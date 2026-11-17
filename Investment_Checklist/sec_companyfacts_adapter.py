#!/usr/bin/env python3
"""SEC US-GAAP annual-facts adapter. Stdlib only, no API keys.

Builds a *partial, source-attributed* annual-statement CSV for the shared
import_market_csv.py normalizer. Use lawful SEC companyfacts ZIP or per-CIK
JSON files; this program does not scrape an undocumented endpoint.

python Investment_Checklist/sec_companyfacts_adapter.py \
  --roster company_tickers_exchange.json --facts-dir downloaded_companyfacts \
  --tickers ADBE,ACN,NFLX --out us_annual.csv --audit us_coverage.json

Optional --fetch uses official data.sec.gov with a declared SEC_USER_AGENT
and caches JSON; be considerate of SEC fair-access rules. Bulk archive mode
avoids thousands of HTTP calls:
  --companyfacts-zip companyfacts.zip
Facts with missing tags/units remain blank, never imputed as zero.
"""
import argparse
import csv
import datetime as dt
import json
import os
import re
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

from import_market_csv import canonical

FIELDS = ('ticker','company','fy','period_end','report_currency','revenue',
          'ebit','cfo','capex','lease_principal','equity','interest_debt',
          'lease_liabilities','cash','source_url','source_date')
# No untested algebraic substitutes: tags within each group have the same
# intended financial concept, but issuer-specific reconciliations are required.
TAGS = {
  'revenue': ('RevenueFromContractWithCustomerExcludingAssessedTax',
              'Revenues','SalesRevenueNet','RevenueFromContractWithCustomerIncludingAssessedTax'),
  'ebit': ('OperatingIncomeLoss',),
  'cfo': ('NetCashProvidedByUsedInOperatingActivities',),
  'capex': ('PaymentsToAcquirePropertyPlantAndEquipment',),
  'equity': ('StockholdersEquity','StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'),
  'cash': ('CashAndCashEquivalentsAtCarryingValue',),
  'debt_noncurrent': ('LongTermDebtNoncurrent','LongTermDebt'),
  'debt_current': ('LongTermDebtCurrent','CurrentPortionOfLongTermDebt'),
  'lease_noncurrent': ('OperatingLeaseLiabilityNoncurrent',),
  'lease_current': ('OperatingLeaseLiabilityCurrent',),
}
DURATION = {'revenue','ebit','cfo','capex'}
ANNUAL_FORMS = {'10-K','10-K/A'}


def iso(s):
    try: return dt.date.fromisoformat(str(s))
    except (TypeError, ValueError): return None


def roster_rows(blob):
    """SEC company_tickers_exchange.json = {'fields':[], 'data':[...]}."""
    if not isinstance(blob,dict) or not isinstance(blob.get('fields'),list) or not isinstance(blob.get('data'),list):
        raise ValueError('Not a SEC company_tickers_exchange.json object')
    fields=[str(x).lower() for x in blob['fields']]
    for key in ('cik','name','ticker','exchange'):
        if key not in fields: raise ValueError('SEC roster missing '+key)
    for row in blob['data']:
        if len(row)!=len(fields): continue
        obj=dict(zip(fields,row))
        if str(obj['exchange']).strip().lower() in {'nasdaq','nyse','new york stock exchange'}:
            try:
                ticker=canonical(str(obj['ticker']),'US')
                cik=int(obj['cik'])
                if cik<=0: continue
                yield {'ticker':ticker,'cik':cik,'company':str(obj['name']),
                       'exchange':str(obj['exchange'])}
            except (ValueError,TypeError): continue


def items_for(facts,tag):
    obj=facts.get('facts',{}).get('us-gaap',{}).get(tag,{})
    return obj.get('units',{}).get('USD',[]) if isinstance(obj,dict) else []


def annual_fact(items, accession, period_end, duration):
    result=[]
    for f in items:
        if f.get('accn')!=accession or f.get('form') not in ANNUAL_FORMS:
            continue
        end=iso(f.get('end'))
        if end!=period_end or not isinstance(f.get('val'),(int,float)):
            continue
        if duration:
            start=iso(f.get('start'))
            if not start or not 330 <= (end-start).days <= 400:
                continue
        elif f.get('start'):
            continue
        result.append(f)
    if not result: return None
    # Same-year annual filing, identical end and USD; newest filed row wins.
    return sorted(result,key=lambda f:str(f.get('filed','')),reverse=True)[0]['val']


def best_field(facts, aliases, accession, end, duration):
    for tag in aliases:
        got=annual_fact(items_for(facts,tag),accession,end,duration)
        if got is not None: return got,tag
    return None,None


def anchors(facts):
    """Pick annual accession/end/fiscal year from verified 10-K duration facts."""
    proposals={}
    for tags in (TAGS['revenue'],TAGS['ebit'],TAGS['cfo']):
        for tag in tags:
            for f in items_for(facts,tag):
                if f.get('form') not in ANNUAL_FORMS or f.get('fp')!='FY':
                    continue
                end,start=iso(f.get('end')),iso(f.get('start'))
                if not end or not start or not 330 <= (end-start).days <= 400:
                    continue
                if not isinstance(f.get('fy'),int) or not re.fullmatch(r'\d{10}-\d{2}-\d{6}',str(f.get('accn',''))):
                    continue
                filed=iso(f.get('filed'))
                if not filed: continue
                fy=int(f['fy'])
                candidate={'fy':fy,'end':end,'accession':f['accn'],'filed':filed}
                # Keep latest accepted filing for each FY, not an annual
                # comparative fact from another period.
                existing=proposals.get(fy)
                if existing is None or (candidate['filed'],candidate['end'])>(existing['filed'],existing['end']):
                    proposals[fy]=candidate
    return sorted(proposals.values(),key=lambda p:p['fy'])


def to_rows(facts,ticker,company,years):
    rows=[]; gaps=[]; chosen=anchors(facts)[-years:]
    for anchor in chosen:
        a,end=anchor['accession'],anchor['end']
        data={}
        for field in ('revenue','ebit','cfo','capex','equity','cash'):
            val,tag=best_field(facts,TAGS[field],a,end,field in DURATION)
            data[field]=val
            if tag is None: gaps.append({'ticker':ticker,'fy':anchor['fy'],'field':field})
        noncur,_=best_field(facts,TAGS['debt_noncurrent'],a,end,False)
        cur,_=best_field(facts,TAGS['debt_current'],a,end,False)
        # Cannot assume an undisclosed debt component equals 0.
        data['interest_debt']=cur+noncur if cur is not None and noncur is not None else None
        lease_n,_=best_field(facts,TAGS['lease_noncurrent'],a,end,False)
        lease_c,_=best_field(facts,TAGS['lease_current'],a,end,False)
        data['lease_liabilities']=lease_n+lease_c if lease_n is not None and lease_c is not None else None
        data['lease_principal']=None # SEC taxonomy does not standardize the desired lease-principal amount here.
        if data['interest_debt'] is None: gaps.append({'ticker':ticker,'fy':anchor['fy'],'field':'interest_debt'})
        if data['lease_liabilities'] is None: gaps.append({'ticker':ticker,'fy':anchor['fy'],'field':'lease_liabilities'})
        path=a.replace('-','')
        doc_url=f'https://www.sec.gov/Archives/edgar/data/{int(facts.get("cik",0))}/{path}/{a}-index.html'
        out={'ticker':ticker,'company':company,'fy':anchor['fy'],'period_end':end.isoformat(),
             'report_currency':'USD','source_url':doc_url,'source_date':anchor['filed'].isoformat()}
        out.update(data)
        rows.append(out)
    return rows,gaps


def sec_download(cik,cache_dir,user_agent):
    if not user_agent or '@' not in user_agent:
        raise ValueError('--fetch requires a descriptive SEC_USER_AGENT containing a real contact email')
    cache_dir.mkdir(parents=True,exist_ok=True)
    path=cache_dir/f'CIK{cik:010d}.json'
    if path.exists(): return json.loads(path.read_text(encoding='utf-8'))
    url=f'https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json'
    req=urllib.request.Request(url,headers={'User-Agent':user_agent,'Accept':'application/json'})
    # Explicitly slower than SEC maximum; no retries of access-denied.
    time.sleep(0.35)
    with urllib.request.urlopen(req,timeout=30) as response:
        payload=response.read()
    blob=json.loads(payload)
    path.write_bytes(payload)
    return blob


def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--roster',type=Path,required=True,help='Official SEC company_tickers_exchange.json')
    source=p.add_mutually_exclusive_group(required=True)
    source.add_argument('--facts-dir',type=Path)
    source.add_argument('--companyfacts-zip',type=Path)
    source.add_argument('--fetch',action='store_true',help='Download per-CIK public SEC API data with caching')
    p.add_argument('--cache-dir',type=Path,default=Path('.sec-cache'))
    p.add_argument('--tickers',help='Comma-separated ticker list; missing names audited')
    p.add_argument('--limit',type=int,default=0,help='Max issuers to process; 0 means all eligible SEC-mapped issuers')
    p.add_argument('--years',type=int,default=5)
    p.add_argument('--out',type=Path,required=True)
    p.add_argument('--audit',type=Path,required=True)
    args=p.parse_args(argv)
    if not 1<=args.years<=20 or args.limit<0: p.error('--years must be 1–20 and --limit nonnegative')
    roster=json.loads(args.roster.read_text(encoding='utf-8'))
    entries=list(roster_rows(roster))
    byticker={e['ticker']:e for e in entries}
    requested={x.strip().upper() for x in args.tickers.split(',') if x.strip()} if args.tickers else None
    missing_symbols=sorted(requested-set(byticker)) if requested else []
    selected=[e for e in entries if requested is None or e['ticker'] in requested]
    # Avoid counting same issuer twice for share classes: keep first and audit.
    seen=set(); unique=[]; duplicate_classes=[]
    for e in sorted(selected,key=lambda x:x['ticker']):
        if e['cik'] in seen:
            duplicate_classes.append(e['ticker']);continue
        seen.add(e['cik']);unique.append(e)
    if args.limit: unique=unique[:args.limit]
    zf=zipfile.ZipFile(args.companyfacts_zip) if args.companyfacts_zip else None
    output=[]; omissions=[]; successes=0
    try:
        for e in unique:
            filename=f"CIK{e['cik']:010d}.json"
            try:
                if zf: facts=json.loads(zf.read(filename))
                elif args.facts_dir: facts=json.loads((args.facts_dir/filename).read_text(encoding='utf-8'))
                else: facts=sec_download(e['cik'],args.cache_dir,os.getenv('SEC_USER_AGENT',''))
                if int(facts.get('cik',-1))!=e['cik']:
                    raise ValueError('CIK mismatch in Companyfacts JSON')
                rows,gaps=to_rows(facts,e['ticker'],e['company'],args.years)
                if not rows:
                    omissions.append({'ticker':e['ticker'],'reason':'no complete 10-K annual anchors'})
                else:
                    output.extend(rows);successes+=1
                    omissions.extend(gaps)
            except (OSError,KeyError,ValueError,urllib.error.HTTPError,zipfile.BadZipFile) as err:
                omissions.append({'ticker':e['ticker'],'reason':str(err)[:240]})
    finally:
        if zf: zf.close()
    args.out.parent.mkdir(parents=True,exist_ok=True)
    args.audit.parent.mkdir(parents=True,exist_ok=True)
    with args.out.open('w',newline='',encoding='utf-8') as f:
        w=csv.DictWriter(f,fieldnames=FIELDS)
        w.writeheader();w.writerows(output)
    audit={
        'source':'Official SEC EDGAR Company Facts; annual US-GAAP 10-K records ONLY',
        'date_generated_utc':dt.datetime.now(dt.timezone.utc).isoformat(),
        'eligible_sec_mapped_exchange_symbols':len(entries),
        'selected_distinct_issuer_ciks':len(unique),
        'duplicate_share_class_symbols':duplicate_classes,
        'requested_symbols_not_in_sec_roster':missing_symbols,
        'issuers_with_annual_rows':successes,'annual_rows_emitted':len(output),
        'issues_and_missing_fields':omissions,
        'coverage_exhaustive':False,
        'notes':['SEC ticker mapping is not a fully validated NYSE/NASDAQ eligible operating-company universe',
                 'Unreported debt/leases and issuer-specific XBRL tags remain missing, not zero',
                 'ROIC and sector-adjusted interpretation require additional analysis',
                 'Prices, valuation, moat and management NOT provided; no stock qualified by this adapter']
    }
    args.audit.write_text(json.dumps(audit,indent=2),encoding='utf-8')
    return audit


if __name__=='__main__':
    main()
