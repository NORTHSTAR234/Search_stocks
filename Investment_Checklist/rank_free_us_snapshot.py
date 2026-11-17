#!/usr/bin/env python3
"""Broad US discovery ranking from a dated, explicitly redistributable free CSV.

Source: DeltaScreener US stock universe, dated 2026-11-03.
Optional independent cross-check: JANalytics SEC-derived listed companies CSV.
No data is live; no stock is declared Investment Checklist-qualified by this.
"""
import argparse
import csv
import datetime as dt
import hashlib
import json
import math
from pathlib import Path

SOURCE = 'https://deltascreener.com/data/us-stock-universe-2026-11-03.csv'
ATTRIBUTION = 'DeltaScreener, "US stock universe dataset", https://deltascreener.com/data, as of 3 November 2026.'
SEC_SOURCE = 'https://github.com/JANalytics/us-stock-universe/blob/main/us_listed_companies.csv'
CRITICAL = ('price', 'mktCap', 'pe', 'roce', 'opMargin',
            'freeCashFlow', 'salesGrowth3y', 'debtToEquity', 'profitAfterTax')
SPECIAL_SECTORS = ('Financial Services', 'Real Estate')


def parse_num(x):
    s = str(x or '').strip()
    if s in ('', 'N/A', 'NA', 'null', 'None', '—', '-', 'nan'):
        return None
    s = s.replace(',', '').replace('$', '').replace('%', '')
    factor = 1
    if s and s[-1].upper() in ('K','M','B','T'):
        factor = {'K':1e3,'M':1e6,'B':1e9,'T':1e12}[s[-1].upper()]
        s = s[:-1]
    try:
        v = float(s)*factor
        return v if math.isfinite(v) else None
    except ValueError:
        return None


def read_csv(path):
    with Path(path).open('r', encoding='utf-8-sig', newline='') as f:
        reader=csv.DictReader(f)
        fields=reader.fieldnames or []
        return fields, list(reader)


def clamp(x):
    return max(0, min(1, x))


def metric_score(m):
    required=('roce','opMargin','salesGrowth3y','fcf_yield','debtToEquity','pe')
    if any(m.get(k) is None for k in required):
        return None
    result=round(
        30*clamp((m['roce']-5)/25)
       +20*clamp((m['opMargin']-5)/30)
       +15*clamp((m['salesGrowth3y']+5)/25)
       +15*clamp(m['fcf_yield']/12)
       +10*clamp((2-m['debtToEquity'])/2)
       +10*clamp((35-m['pe'])/30), 1)
    return result


def assess(raw):
    identity={k: str(raw.get(k) or '').strip() for k in ('ticker','name','exchange','sector','industry')}
    identity['ticker']=identity['ticker'].upper()
    identity['exchange']=identity['exchange'].upper()
    if identity['exchange'] in ('NASDAQGS','NASDAQGM','NASDAQCM','NAS'):
        identity['exchange']='NASDAQ'
    m={k:parse_num(raw.get(k)) for k in CRITICAL}
    m.update({k:parse_num(raw.get(k)) for k in ('avgVolume','salesGrowth','sales','currentRatio')})
    cap=m['mktCap']
    m['fcf_yield']=round(100*m['freeCashFlow']/cap,2) if cap and cap>0 and m['freeCashFlow'] is not None else None
    # Delta profitAfterTax is reported in USD millions; cashflow in USD.
    pat=m['profitAfterTax']
    m['fcf_cash_conversion']=round(m['freeCashFlow']/(pat*1e6),2) if pat and pat>0 and m['freeCashFlow'] is not None else None
    coverage=sum(m[k] is not None for k in CRITICAL)
    flags=[]
    if m['pe'] is not None and m['pe'] < 7: flags.append('very low P/E: audit earnings normalization')
    if m['salesGrowth3y'] is not None and abs(m['salesGrowth3y'])>70:
        flags.append('growth/cyclical extreme')
    if m['roce'] is not None and m['roce'] > 80: flags.append('ROCE needs reconciliation')
    if m['fcf_yield'] is not None and m['fcf_yield'] > 20:
        flags.append('extreme FCF yield requires verification')
    if m['fcf_cash_conversion'] is not None and (
        m['fcf_cash_conversion']<0.5 or m['fcf_cash_conversion']>3):
        flags.append('cash-to-profit conversion atypical')
    if identity['sector'] in ('Energy','Basic Materials'):
        flags.append('through-cycle earnings and capex required')
    if identity['sector'] in SPECIAL_SECTORS:
        status='SPECIALIST SECTOR — separate methods required'
    elif identity['exchange'] not in ('NYSE','NASDAQ'):
        status='OUTSIDE NYSE NASDAQ'
    elif coverage < 7:
        status='INSUFFICIENT DATA'
    elif cap is None or cap < 300e6 or not m['price'] or m['price']<=0:
        status='NOT IN SIZE/PRICE DISCOVERY COHORT'
    elif any(m.get(k) is None for k in ('roce','opMargin','freeCashFlow','pe','salesGrowth3y','debtToEquity')):
        status='INCOMPLETE FOR QUANT SCREEN'
    elif (m['roce']<10 or m['opMargin']<5 or m['freeCashFlow']<=0
          or not (5<=m['pe']<=35) or m['debtToEquity']>2 or m['salesGrowth3y']<-10):
        status='FILTERED BY PRELIMINARY CRITERIA'
    else:
        status='QUANT DISCOVERY — FULL CHECKLIST PENDING'
    discovery_score=metric_score(m) if status.startswith('QUANT DISCOVERY') else None
    return {**identity,'metrics':m,'critical_data_count':coverage,
            'warnings':flags,'status':status,'discovery_score':discovery_score}


def diversified(ranked,count=20,max_sector=4):
    out=[];sectors={}
    for r in ranked:
        s=r['sector']
        if sectors.get(s,0)>=max_sector:continue
        out.append(r)
        sectors[s]=sectors.get(s,0)+1
        if len(out)>=count:break
    return out


def md_report(a,leaders,raw):
    lines=['# US Investment Checklist: broad quantitative discovery',
           '',
           '**Snapshot: 3 November 2026. Not live quotations or an investment-qualification report.**',
           '',
           'Data attribution: '+ATTRIBUTION,
           'SEC-derived comparison: '+SEC_SOURCE,
           '',
           '## Actual data coverage',
           '',
           '* Published rows: '+str(a['published_rows']),
           '* Deduplicated symbols: '+str(a['unique_tickers']),
           '* NYSE/NASDAQ records: '+str(a['nyse_nasdaq_rows']),
           '* Rows with 7/9 key metrics: '+str(a['data_coverage_7of9']),
           '* Passed explicit preliminary quantitative criteria: '+str(a['quantitative_pass_count']),
           '* Independent SEC-derived source rows: '+str(a['independent_rows']),
           '* Ticker overlaps with SEC-derived source: '+str(a['crossmatched_tickers']),
           '* Verified Investment Checklist opportunities: NOT ASSESSED (no business/valuation audit)',
           '',
           '## Top 20 diversified discovery priorities',
           '',
           '| Rank | Ticker | Company | Sector | Price 3 Nov (USD) | P/E | ROCE | FCF yield | Sales growth 3Y | Priority score |',
           '|---:|---|---|---|---:|---:|---:|---:|---:|---:|']
    def fmt(v,dec=1):
        return 'N/A' if v is None else str(round(v,dec))
    for n,r in enumerate(leaders,1):
        m=r['metrics']
        lines.append('| '+str(n)+' | '+r['ticker']+' | '+r['name'].replace('|','/')+' | '+r['sector']+
                     ' | '+fmt(m['price'],2)+' | '+fmt(m['pe'])+'x | '+fmt(m['roce'])+
                     '% | '+fmt(m['fcf_yield'])+'% | '+fmt(m['salesGrowth3y'])+
                     '% | '+fmt(r['discovery_score'])+' |')
    lines.extend(['',
        '**Priority score is a custom quantitative discovery heuristic, not Michael Shearn scoring, intrinsic value or a BUY recommendation.**',
        '',
        '## Unrestricted highest-ranked tickers',
        ', '.join(r['ticker'] for r in raw[:50]),
        '',
        '## Specialist sectors',
        'Financial Services and Real Estate were separated, NOT failed. Banks, insurers, asset managers and REITs require distinct capital and valuation measures.',
        '',
        '## Material limitations',
        '* Snapshot is two weeks older than the 17 November 2026 research date. Prices and ratios must be refreshed before recommendations.',
        '* Published P/E, capital returns and free cash flow can be distorted by special items, acquisitions, leases and cyclicality.',
        '* SEC-derived cross-match is ticker-only; it is not confirmed same issuer and share class without CIK validation.',
        '* No three-year reconstructed ROIC, management, competitive moat, earnings normalization or two-scenario fair value has been completed by this bulk screen.',
        '* Full NYSE/NASDAQ operating-company completeness is not independently verified.',
        '* The checklist and 15% valuation margin-of-safety gates must still be independently applied.',
        '',
        '## Next steps',
        'Use the shortlist with Investment Checklist Screener for full due diligence; pass chosen individual tickers to @Search_stock.',
        '',
        '## Sources and fingerprints',
        '* Snapshot: '+SOURCE,
        '* Snapshot SHA-256: '+a['snapshot_sha256'],
        '* SEC-only comparison: '+SEC_SOURCE,
        '* SEC-only SHA-256: '+str(a['independent_sha256']),
        '* Generated UTC: '+a['generated_utc'],
        ''])
    return '\n'.join(lines)


def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--snapshot',type=Path,required=True)
    p.add_argument('--independent',type=Path)
    p.add_argument('--out',type=Path,required=True)
    args=p.parse_args(argv)
    cols,original=read_csv(args.snapshot)
    required=set(('ticker','name','exchange','sector')+CRITICAL)
    missing=required-set(cols)
    if missing:p.error('Published CSV schema unexpected: '+','.join(sorted(missing)))
    seen=set();dedup=[];dups=0
    for row in original:
        ticker=str(row.get('ticker','')).upper().strip()
        if not ticker or ticker in seen:dups+=1;continue
        seen.add(ticker)
        dedup.append(assess(row))
    other=[]
    secmap={}
    if args.independent and args.independent.exists():
        _,other=read_csv(args.independent)
        for r in other:
            t=str(r.get('Ticker','')).strip().upper()
            if t and t not in secmap:secmap[t]=r
    for r in dedup:
        match=secmap.get(r['ticker'])
        r['sec_crosscheck']=(dict(cik=match.get('CIK'),
                                  latest_annual=match.get('Latest Annual Report'),
                                  sec_company=match.get('SEC Company Name'),
                                  sec_exchange=match.get('SEC Exchange'))
                             if match else None)
    ranked=sorted((r for r in dedup if r['discovery_score'] is not None),
                  key=lambda r:(-r['discovery_score'],r['ticker']))
    chosen=diversified(ranked)
    status_counts={}
    for r in dedup:status_counts[r['status']]=status_counts.get(r['status'],0)+1
    audit={
      'schema_version':1,'generated_utc':dt.datetime.now(dt.timezone.utc).isoformat(),
      'snapshot_date':'2026-11-03','price_live':False,
      'dataset_attribution':ATTRIBUTION,'source':SOURCE,
      'snapshot_sha256':hashlib.sha256(args.snapshot.read_bytes()).hexdigest(),
      'published_rows':len(original),'unique_tickers':len(dedup),'duplicates_or_missing':dups,
      'nyse_nasdaq_rows':sum(r['exchange'] in ('NASDAQ','NYSE') for r in dedup),
      'data_coverage_7of9':sum(r['critical_data_count']>=7 and r['exchange'] in ('NASDAQ','NYSE') for r in dedup),
      'quantitative_pass_count':len(ranked),
      'independent_source':SEC_SOURCE,'independent_rows':len(other),
      'independent_sha256':hashlib.sha256(args.independent.read_bytes()).hexdigest() if args.independent and args.independent.exists() else None,
      'crossmatched_tickers':sum(r['ticker'] in secmap for r in dedup),
      'status_counts':status_counts,'universe_exhaustive':False,
      'fully_verified_investments':None,
      'limitations':['No live price data','No validated fair value or competitive moats',
                     'Cross-source ticker matches do not verify share class',
                     'Specialist sectors require alternate metrics',
                     'Source fundamentals are not issuer-audited by this workflow'],
      'top20_sector_diversified':chosen,'top50_unrestricted':ranked[:50]
    }
    args.out.mkdir(parents=True,exist_ok=True)
    (args.out/'us_quant_audit.json').write_text(json.dumps(audit,indent=2,ensure_ascii=False),encoding='utf-8')
    (args.out/'us_top20.md').write_text(md_report(audit,chosen,ranked),encoding='utf-8')
    with (args.out/'us_ranked_candidates.csv').open('w',newline='',encoding='utf-8') as f:
        fields=('rank','ticker','name','sector','industry','snapshot_price_usd','pe','roce_pct',
            'op_margin_pct','fcf_yield_pct','sales_growth_3y_pct','debt_equity','score',
            'risk_flags','sec_cik','sec_annual_filing','status')
        writer=csv.DictWriter(f,fieldnames=fields);writer.writeheader()
        for n,r in enumerate(ranked,1):
            m=r['metrics'];s=r['sec_crosscheck'] or {}
            writer.writerow(dict(rank=n,ticker=r['ticker'],name=r['name'],sector=r['sector'],
                industry=r['industry'],snapshot_price_usd=m['price'],pe=m['pe'],
                roce_pct=m['roce'],op_margin_pct=m['opMargin'],
                fcf_yield_pct=m['fcf_yield'],sales_growth_3y_pct=m['salesGrowth3y'],
                debt_equity=m['debtToEquity'],score=r['discovery_score'],
                risk_flags='; '.join(r['warnings']),sec_cik=s.get('cik'),
                sec_annual_filing=s.get('latest_annual'),status=r['status']))
    print('SCREEN_AUDIT',json.dumps({k:v for k,v in audit.items() if k not in ('top20_sector_diversified','top50_unrestricted')}))
    for n,r in enumerate(chosen,1):
        m=r['metrics']
        print('SCREEN_TOP',n,r['ticker'],r['name'][:30],r['sector'],
              'score',r['discovery_score'],'pe',m['pe'],'roce',m['roce'],
              'fcfy',m['fcf_yield'],'sec_match',bool(r['sec_crosscheck']))
    return audit


if __name__=='__main__':
    main()
