#!/usr/bin/env python3
"""Owner-personal daily Yahoo history through existing GitHub OIDC, no credentials.
Run once after international exchanges close; not a consolidated licensed market feed.
Only canonical live-report tickers, no automatic brokerage orders or public publication.
"""
import datetime as dt
import json,math,os,re,subprocess,sys,urllib.parse,urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
MANIFEST=ROOT/"Website/live-reports.json"
INGEST="https://search-stocks-international-ingest.stockresearch-fred.workers.dev/daily-history"
AUDIENCE="search-stocks-personal-yfinance-v1"

def oidc():
    url=os.environ["ACTIONS_ID_TOKEN_REQUEST_URL"]
    token=os.environ["ACTIONS_ID_TOKEN_REQUEST_TOKEN"]
    sep="&" if "?" in url else "?"
    r=urllib.request.Request(url+sep+"audience="+urllib.parse.quote(AUDIENCE),
        headers={"Authorization":"bearer "+token,"Accept":"application/json"})
    with urllib.request.urlopen(r,timeout=15) as f:
        return json.load(f)["value"]

def canonical_symbols():
    data=json.loads(MANIFEST.read_text(encoding="utf-8"))
    if len(data.get("rows",[]))>120:raise ValueError("Too many tracked tickers")
    symbols={}
    for r in data.get("rows",[]):
        if r.get("exchange")=="US":continue
        ticker=r.get("ticker","").upper()
        if not re.fullmatch(r"[A-Z0-9][A-Z0-9.-]{0,24}",ticker):continue
        source=r.get("sourceMarketTicker")
        if not isinstance(source,str) or not re.fullmatch(r"[A-Z0-9.^-]{1,25}",source,re.I):
            if ticker.endswith(".TWSE") and re.fullmatch(r"\d{4}\.TWSE",ticker):
                source=ticker.replace(".TWSE",".TW")
            else:continue
        symbols[ticker]=source
    return symbols

def history_for(source):
    import yfinance as yf
    # auto_adjust=True provides split/dividend-adjusted daily research history.
    # The latest bar is also adjusted; users see provenance and source limitations.
    frame=yf.Ticker(source).history(period="1y",interval="1d",auto_adjust=True,
                                      actions=False,raise_errors=False)
    if frame is None or frame.empty:return []
    output=[]
    for stamp,row in frame.tail(245).iterrows():
        try:
            day=stamp.strftime("%Y-%m-%d")
            b={k:float(row[n]) for k,n in (("o","Open"),("h","High"),("l","Low"),("c","Close"),("v","Volume"))}
            if (not re.fullmatch(r"\d{4}-\d\d-\d\d",day) or
                any(not math.isfinite(v) for v in b.values()) or
                min(b["o"],b["h"],b["l"],b["c"])<=0 or b["v"]<0 or
                b["h"]<max(b["o"],b["c"]) or b["l"]>min(b["o"],b["c"])):
                continue
            output.append({"d":day,"o":round(b["o"],5),"h":round(b["h"],5),
                "l":round(b["l"],5),"c":round(b["c"],5),"v":int(b["v"])})
        except (ValueError,TypeError,KeyError):
            continue
    return output

def main():
    symbols=canonical_symbols()
    if not symbols:raise RuntimeError("No canonical international symbols")
    output={}
    for ticker,source in sorted(symbols.items()):
        try:bars=history_for(source)
        except Exception:bars=[]
        if len(bars)>=65:
            output[ticker]={"sourceSymbol":source,"feed":"YFINANCE_DAILY_ADJUSTED",
                "bars":bars}
    if not output:raise RuntimeError("No trustworthy daily history; previous cache preserved")
    payload={"schemaVersion":1,"source":"yfinance-daily",
        "collectedAt":dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00","Z"),
        "symbols":output}
    data=json.dumps(payload,separators=(",",":")).encode("utf-8")
    if len(data)>450000:raise RuntimeError("History exceeds safe 450KB bound")
    token=oidc()
    proc=subprocess.run(["curl","--http1.1","--silent","--show-error",
        "--fail-with-body","--max-time","45","--request","POST",
        "--header","Authorization: Bearer "+token,
        "--header","Content-Type: application/json",
        "--header","Accept: application/json",
        "--header","User-Agent: GitHub-Actions-Stock-Research/1.0",
        "--data-binary","@-",INGEST],
        input=data,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=False)
    if proc.returncode:raise RuntimeError("Private daily-history ingest unsuccessful (curl exit "+str(proc.returncode)+")")
    result=json.loads(proc.stdout.decode("utf-8"))
    if result.get("status")!="UPDATED":raise RuntimeError("Private worker rejected daily history")
    print("Privately ingested adjusted daily history for",result.get("accepted"),
          "international symbols; no candles, secrets or token logged.")

if __name__=="__main__":main()
