#!/usr/bin/env python3
"""Market-agnostic local-only fiscal-data normalizer (stdlib; no keys/network).

Consumes a lawfully obtained CSV containing issuer-level annual statement rows.
Produces auditable ticker records for discovery. It never issues buy signals,
claims whole-market coverage, fetches restricted data, or imputes missing facts.

Usage: python import_market_csv.py statements.csv --market ASX --out result.json
Supported canonical exchanges are open-ended (ASX, US, TWSE, MYX, LSE, ...).
"""
import argparse
import csv
import datetime as dt
import json
import math
import re
from collections import defaultdict
from pathlib import Path
from urllib.parse import urlparse

FIELD_ALIASES = {
    'ticker': ['ticker', 'symbol', 'code'],
    'company': ['company', 'issuer', 'company_name', 'name'],
    'fy': ['fy', 'fiscal_year', 'year'],
    'period_end': ['period_end', 'fiscal_period_end', 'fy_end'],
    'report_currency': ['report_currency', 'reporting_currency', 'currency'],
    'revenue': ['revenue', 'sales'],
    'ebit': ['ebit', 'operating_income'],
    'cfo': ['cfo', 'operating_cash_flow'],
    'capex': ['capex', 'cash_capex'],
    'lease_principal': ['lease_principal', 'lease_payments'],
    'equity': ['equity', 'total_equity'],
    'interest_debt': ['interest_debt', 'interest_bearing_debt', 'debt'],
    'lease_liabilities': ['lease_liabilities', 'lease_debt'],
    'cash': ['cash', 'cash_equivalents'],
    'price': ['price', 'market_price'],
    'price_currency': ['price_currency', 'trading_currency'],
    'price_date': ['price_date', 'quote_date'],
    'source_url': ['source_url', 'filing_url'],
    'source_date': ['source_date', 'filing_date'],
}
NUMERICS = ('revenue','ebit','cfo','capex','lease_principal','equity',
            'interest_debt','lease_liabilities','cash','price')


def num(value):
    if value is None or str(value).strip() in ('', 'N/A', '—', '-', 'null'):
        return None
    try:
        v = float(str(value).replace(',', '').strip())
    except ValueError:
        return None
    return v if math.isfinite(v) else None


def canonical(ticker, market):
    t = ticker.strip().upper()
    m = market.upper()
    if not re.fullmatch(r'[A-Z0-9^._-]{1,24}', t):
        raise ValueError('Invalid symbol: '+repr(ticker))
    if m == 'US':
        return t
    if t.endswith('.'+m):
        return t
    # Strip no suffix: provider symbols require independent issuer mapping.
    if '.' in t:
        raise ValueError(f'Explicitly map provider symbol {t!r} to canonical {m} ticker')
    return t+'.'+m


def parse_date(s):
    try:
        return dt.date.fromisoformat(s).isoformat()
    except (ValueError, TypeError):
        raise ValueError(f'Expected YYYY-MM-DD, got {s!r}')


def valid_url(s):
    u = urlparse(str(s))
    return u.scheme == 'https' and bool(u.hostname)


def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('file',type=Path)
    p.add_argument('--market',required=True,help='Canonical exchange (US, ASX, TWSE, MYX, etc.)')
    p.add_argument('--out',type=Path,default=None)
    p.add_argument('--tax-rate',type=float,default=None,
                   help='Explicit tax assumption for indicative NOPAT; no ROIC if omitted')
    args=p.parse_args(argv)
    market=args.market.strip().upper()
    if not re.fullmatch(r'[A-Z][A-Z0-9_-]{1,15}',market):
        raise ValueError('Invalid market label')
    if args.tax_rate is not None and not 0 <= args.tax_rate <= 0.6:
        raise ValueError('Tax rate must be 0 to 0.6')
    with args.file.open('r',encoding='utf-8-sig',newline='') as f:
        reader=csv.DictReader(f)
        h={k.strip().lower():k for k in (reader.fieldnames or [])}
        def field(r,key):
            for alias in FIELD_ALIASES[key]:
                name=h.get(alias)
                if name is not None and str(r.get(name) or '').strip():
                    return str(r[name]).strip()
            return ''
        for required in ('ticker','fy','report_currency','source_url','source_date'):
            if not any(x in h for x in FIELD_ALIASES[required]):
                raise ValueError('Missing required column: '+required)
        grouped=defaultdict(dict)
        errors=[]; input_rows=0
        for line,r in enumerate(reader,2):
            input_rows+=1
            try:
                ticker=canonical(field(r,'ticker'),market)
                fy=int(field(r,'fy'))
                if fy < 1990 or fy > dt.date.today().year+1:
                    raise ValueError('Unsupported fiscal year')
                currency=field(r,'report_currency').upper()
                if not re.fullmatch(r'[A-Z]{3}',currency):
                    raise ValueError('Invalid currency')
                url=field(r,'source_url')
                if not valid_url(url):
                    raise ValueError('Missing/invalid primary source URL')
                sourced=parse_date(field(r,'source_date'))
                row={k:num(field(r,k)) for k in NUMERICS}
                row.update({'fy':fy,'company':field(r,'company'), 'report_currency':currency,
                           'period_end':parse_date(field(r,'period_end')) if field(r,'period_end') else None,
                           'source_url':url,'source_date':sourced,
                           'price_currency':field(r,'price_currency').upper() or None,
                           'price_date':parse_date(field(r,'price_date')) if field(r,'price_date') else None})
                if row['price'] is not None and (not row['price_date'] or not row['price_currency']):
                    raise ValueError('Price requires price_currency and price_date')
                if fy in grouped[ticker]:
                    raise ValueError('Duplicate ticker/fiscal year; reconcile restatements before import')
                grouped[ticker][fy]=row
            except (ValueError, TypeError) as exc:
                errors.append({'csv_line':line,'error':str(exc)})
    records=[]
    for ticker,by_year in sorted(grouped.items()):
        ys=sorted(by_year)
        prev_ic=None
        annual=[]
        for fy in ys:
            r=by_year[fy]
            if annual and r['report_currency'] != annual[-1]['report_currency']:
                prev_ic = None # Never compare balances denominated in different currencies.
            vals=[r[k] for k in ('equity','interest_debt','cash')]
            ic=sum(vals[:2])-vals[2]+(r['lease_liabilities'] or 0) if all(v is not None for v in vals) else None
            fcf=(r['cfo']-r['capex']-(r['lease_principal'] or 0)) if r['cfo'] is not None and r['capex'] is not None else None
            roic=None
            if args.tax_rate is not None and prev_ic is not None and ic is not None and prev_ic+ic>0 and r['ebit'] is not None:
                roic=round(200*r['ebit']*(1-args.tax_rate)/(prev_ic+ic),2)
            annual.append({**r,'invested_capital':round(ic,2) if ic is not None else None,
                           'indicative_fcf_after_leases':round(fcf,2) if fcf is not None and r['lease_principal'] is not None else None,
                           'indicative_fcf_before_lease_principal':round(r['cfo']-r['capex'],2) if r['cfo'] is not None and r['capex'] is not None else None,
                           'indicative_roic_pct':roic})
            prev_ic=ic
        latest=annual[-1]
        results=sum(row['indicative_roic_pct'] is not None for row in annual)
        records.append({'ticker':ticker,'company':latest['company'],'market':market,
                        'financial_years_observed':len(annual),'roic_years_computed':results,
                        'three_year_roic_complete':results>=3,
                        'latest_price_currency_matches_reporting_currency':bool(latest['price'] is not None and
                          latest['price_currency']==latest['report_currency']),
                        'annual':annual,'screening_status':'DISCOVERY ONLY / NOT INVESTMENT QUALIFIED'})
    result={'schema_version':1,'market':market,'as_of':dt.datetime.now(dt.timezone.utc).isoformat(),
            'source_file':args.file.name,'input_rows':input_rows,'unique_issuers':len(records),
            'invalid_rows':errors,'eligible_universe_size':None,'universe_exhaustive':False,
            'method':{'indicative_roic':'EBIT*(1-tax_rate)/average invested capital; requires prior-year IC',
                      'tax_rate_assumption':args.tax_rate,
                      'invested_capital':'equity+interest_debt+lease_liabilities-cash',
                      'indicative_fcf':'CFO - capex - lease_principal; absent lease payments => after-lease FCF unknown'},
            'caution':'Filing rows are user-provided and not externally verified; price/earnings currency mismatch blocks comparability; no investment passes implied.',
            'companies':records}
    doc=json.dumps(result,ensure_ascii=False,indent=2)
    if args.out: args.out.parent.mkdir(parents=True,exist_ok=True);args.out.write_text(doc,encoding='utf-8')
    else: print(doc)
    return result


if __name__=='__main__':
    main()
