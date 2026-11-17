#!/usr/bin/env python3
"""Live SEC source probe for review branch (not a market-wide scan).

Run only on an approved GitHub Actions runner with a descriptive, contactable
SEC_USER_AGENT. Fetches official SEC ticker roster and select Company Facts.
Never confuses a small pilot with the full US market universe.
"""
import argparse
import datetime as dt
import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path
from sec_companyfacts_adapter import roster_rows, to_rows

SEC_ROSTER = "https://www.sec.gov/files/company_tickers_exchange.json"

def fetch_json(url, agent, retries=2):
    if not agent or ('https://github.com/' not in agent and '@' not in agent):
        raise ValueError("SEC_USER_AGENT requires contactable identity URL or email")
    for attempt in range(retries+1):
        try:
            r=urllib.request.Request(url,headers={
                "User-Agent":agent,
                "Accept":"application/json",
                "Accept-Encoding":"identity"
            })
            with urllib.request.urlopen(r,timeout=50) as reply:
                content=reply.read()
                return json.loads(content)
        except urllib.error.HTTPError as exc:
            if exc.code in (403,401,429):
                raise RuntimeError(f"SEC refused HTTP {exc.code}; no bypass or alternate IP attempted")
            if attempt>=retries: raise
        except (TimeoutError,urllib.error.URLError):
            if attempt>=retries: raise
        time.sleep(1+attempt)

def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--tickers",default="ADBE,ACN,NFLX,QCOM,CRM,NVDA,GOOGL,INTU,MU,PEP")
    p.add_argument("--out",default="Investment_Checklist/data/US/pilot-sec-audit.json")
    args=p.parse_args(argv)
    agent=os.getenv("SEC_USER_AGENT")
    roster=fetch_json(SEC_ROSTER,agent)
    entries=list(roster_rows(roster))
    requested=[q.strip().upper() for q in args.tickers.split(",") if q.strip()]
    keyed={e["ticker"]:e for e in entries}
    outcomes=[];errors=[]
    for ticker in requested:
        e=keyed.get(ticker)
        if e is None:
            errors.append({"ticker":ticker,"error":"Not on SEC exchange roster"})
            continue
        time.sleep(0.4)
        url=f"https://data.sec.gov/api/xbrl/companyfacts/CIK{e['cik']:010d}.json"
        try:
            facts=fetch_json(url,agent)
            if int(facts.get('cik',-1))!=e['cik']:
                raise ValueError("CIK does not match roster")
            rows,gaps=to_rows(facts,ticker,e["company"],5)
            outcomes.append({
                "ticker":ticker,"cik":e["cik"],"fy_rows":len(rows),
                "years":[r["fy"] for r in rows],
                "latest_period_end":rows[-1]["period_end"] if rows else None,
                "latest_filing_date":rows[-1]["source_date"] if rows else None,
                "latest_ebit_usd":rows[-1]["ebit"] if rows else None,
                "latest_revenue_usd":rows[-1]["revenue"] if rows else None,
                "latest_cashflow_usd":rows[-1]["cfo"] if rows else None,
                "latest_debt_available":rows[-1]["interest_debt"] is not None if rows else False,
                "annual_gaps":gaps[:20],
                "source_url":rows[-1]["source_url"] if rows else url
            })
        except (RuntimeError,ValueError,urllib.error.URLError) as exc:
            errors.append({"ticker":ticker,"error":str(exc)[:200]})
    report={
        "schema_version":1,
        "as_of_utc":dt.datetime.now(dt.timezone.utc).isoformat(),
        "universe":"SEC NYSE/NASDAQ ticker association file (not independently verified eligible operating universe)",
        "roster_symbols_nyse_nasdaq":len(entries),
        "roster_distinct_ciks":len({e["cik"] for e in entries}),
        "pilot_tickers_requested":len(requested),
        "pilot_tickers_success":len(outcomes),
        "pilot_tickers_failed":len(errors),
        "coverage_exhaustive":False,
        "annual_data":outcomes,"errors":errors
    }
    path=Path(args.out);path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(report,indent=2),encoding='utf-8')
    print("SEC PILOT SUMMARY: "+json.dumps({k:v for k,v in report.items() if k not in ('annual_data','errors')}))
    for row in outcomes:
        print("  ",row["ticker"],row["cik"],row["years"],"latest EBIT",row["latest_ebit_usd"],"gaps",len(row["annual_gaps"]))
    for issue in errors: print("  ERROR",issue)
    if not outcomes:
        raise RuntimeError("No pilot issuer passed official SEC fetch and annual fact extraction")
    return report

if __name__=="__main__":
    main()
