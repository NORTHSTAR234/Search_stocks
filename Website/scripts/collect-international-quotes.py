#!/usr/bin/env python3
"""Scheduled owner-personal international prices via yfinance/Yahoo.

Runs only when one or more configured exchanges are in a normal weekday session.
Discovers any number of international tickers by their canonical archive folders.
Quotes are POSTed to a private Cloudflare KV cache using signed GitHub OIDC.
No quote, OAuth token, or API key is committed to the public repository.
"""
import argparse
import base64
import datetime as dt
import json
import math
import os
from pathlib import Path
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo

ROOT=Path(__file__).resolve().parents[2]
CONFIG=ROOT/"Website/market-exchanges.json"
UTC=dt.timezone.utc
NAME=re.compile(r"^(?:[A-Z0-9.-]+)_(\d{4}-\d\d-\d\d)_(\d\d-\d\d-\d\d)Z(?:_chat_response)?\.(?:html|md)$",re.I)
SNAPSHOT=re.compile(r'<script\b(?=[^>]*\bid=["\']aya-report-snapshot["\'])[^>]*>(.*?)</script\s*>',re.I|re.S)
INGEST="https://search-stocks-international-ingest.stockresearch-fred.workers.dev/ingest"
AUDIENCE="search-stocks-personal-yfinance-v1"

def now_utc():
    return dt.datetime.now(UTC)

def minute_in_session(now, config):
    local=now.astimezone(ZoneInfo(config["timeZone"]))
    if local.isoweekday() not in config.get("weekdays",[]):
        return False
    local_minute=local.hour*60+local.minute
    for session in config.get("sessions",[]):
        start_h,start_m=map(int,session["start"].split(":"))
        end_h,end_m=map(int,session["end"].split(":"))
        if start_h*60+start_m<=local_minute<end_h*60+end_m:
            return True
    return False

def open_markets(registry,now):
    return {name:spec for name,spec in registry["markets"].items()
            if spec.get("priceSource")=="yfinance" and
            minute_in_session(now,spec)}

def latest_snapshot(folder):
    reports=[]
    for path in folder.iterdir():
        if path.is_file() and (match:=NAME.fullmatch(path.name)):
            reports.append((match.group(1),match.group(2),path))
    if not reports:return None
    latest=max(reports,key=lambda x:(x[0],x[1],x[2].suffix==".html"))
    if latest[2].suffix!=".html":return None
    try:
        text=latest[2].read_text(encoding="utf-8")
        match=SNAPSHOT.search(text)
        return json.loads(match.group(1)) if match else None
    except (OSError,ValueError):
        return None

def discover(registry,opened):
    symbols={}
    override=registry.get("sourceSymbolOverrides",{})
    for bucket in ("halal","nonhalal"):
        folder=ROOT/bucket
        if not folder.exists():continue
        for item in folder.iterdir():
            if not item.is_dir():continue
            ticker=item.name.upper()
            if "." not in ticker:continue
            suffix=ticker.rsplit(".",1)[-1]
            alias=registry.get("aliases",{}).get(suffix,suffix)
            market=opened.get(alias)
            if not market:continue
            snap=latest_snapshot(item)
            prefix=ticker.rsplit(".",1)[0]
            expected=market.get("yahooSuffix")
            if not expected:continue
            ysymbol=override.get(ticker)
            if not ysymbol and snap:
                ysymbol=(snap.get("market_schedule") or {}).get("yahoo_ticker") or snap.get("source_market_ticker")
                if not isinstance(ysymbol,str) or not ysymbol.upper().endswith(expected.upper()):
                    ysymbol=None
            if not ysymbol:
                ysymbol=prefix+expected
            if not re.fullmatch(r"[A-Za-z0-9^.-]{1,25}",ysymbol):continue
            symbols[ticker]={"yahoo":ysymbol.upper(),"exchange":alias,
                             "timeZone":market["timeZone"],
                             "currency":market.get("currency")}
    return symbols

def fetch_prices(symbols):
    import pandas as pd
    import yfinance as yf
    collected={}
    # Yahoo imposes variable throttling; limit requests and batch across markets.
    by_yahoo={}
    for ticker,meta in sorted(symbols.items()):
        by_yahoo.setdefault(meta["yahoo"],[]).append((ticker,meta))
    all_symbols=list(by_yahoo)
    for start in range(0,len(all_symbols),25):
        batch=all_symbols[start:start+25]
        try:
            data=yf.download(batch,period="5d",interval="5m",auto_adjust=False,
                             prepost=False,progress=False,group_by="ticker",
                             threads=True,timeout=20)
        except Exception as e:
            print("Yahoo batch unavailable:",type(e).__name__,file=sys.stderr)
            continue
        for symbol in batch:
            try:
                if len(batch)==1 and not isinstance(data.columns,pd.MultiIndex):
                    frame=data
                elif isinstance(data.columns,pd.MultiIndex):
                    if symbol in data.columns.get_level_values(0):
                        frame=data[symbol]
                    elif symbol in data.columns.get_level_values(1):
                        frame=data.xs(symbol,axis=1,level=1)
                    else:continue
                else:continue
                closes=frame["Close"].dropna()
                closes=closes[closes>0]
                if closes.empty:continue
                latest_ts=closes.index[-1]
                if latest_ts.tzinfo is None:continue
                observed=latest_ts.to_pydatetime().astimezone(UTC)
                if observed>now_utc()+dt.timedelta(minutes=2) or now_utc()-observed>dt.timedelta(days=8):continue
                price=float(closes.iloc[-1])
                for ticker,meta in by_yahoo[symbol]:
                    zone=ZoneInfo(meta["timeZone"])
                    today=observed.astimezone(zone).date()
                    previous=closes[[ts.tz_convert(zone).date()<today for ts in closes.index]]
                    prev=float(previous.iloc[-1]) if not previous.empty else None
                    if not math.isfinite(price) or price<=0:continue
                    currency=meta["currency"]
                    if not currency:continue
                    collected[ticker]={
                      "price":price,"currency":currency,"exchange":meta["exchange"],
                      "sourceSymbol":symbol,"asOf":observed.isoformat().replace("+00:00","Z"),
                      "feed":"YFINANCE_YAHOO_5M_BAR_DELAYED",
                      "previousClose":prev if prev and math.isfinite(prev) and prev>0 else None
                    }
            except (ValueError,TypeError,KeyError,AttributeError,IndexError):
                continue
    return collected

def github_oidc():
    url=os.environ["ACTIONS_ID_TOKEN_REQUEST_URL"]
    token=os.environ["ACTIONS_ID_TOKEN_REQUEST_TOKEN"]
    separator="&" if "?" in url else "?"
    request=urllib.request.Request(url+separator+"audience="+urllib.parse.quote(AUDIENCE),
                                    headers={"Authorization":"bearer "+token,"Accept":"application/json"})
    with urllib.request.urlopen(request,timeout=15) as response:
        return json.load(response)["value"]

def publish(quotes):
    token=github_oidc()
    body=json.dumps({"schemaVersion":1,"source":"yfinance",
                     "collectedAt":now_utc().isoformat().replace("+00:00","Z"),
                     "quotes":quotes},separators=(",",":")).encode()
    request=urllib.request.Request(INGEST,data=body,method="POST",
       headers={"Authorization":"Bearer "+token,"Content-Type":"application/json"})
    try:
        with urllib.request.urlopen(request,timeout=25) as response:
            return json.load(response)
    except urllib.error.HTTPError as e:
        # Public workflow logs must NEVER contain the JWT. These fields only
        # describe the public repository/workflow identity for troubleshooting.
        print("Private ingest rejected:",e.code,e.read(300).decode("utf-8","replace"),file=sys.stderr)
        if e.code==403:
            try:
                blob=token.split(".")[1]
                claims=json.loads(base64.urlsafe_b64decode(blob+"="*((-len(blob))%4)))
                fields=["iss","aud","sub","repository","repository_id","ref","workflow_ref","event_name"]
                print("OIDC identity:",json.dumps({k:claims.get(k) for k in fields}),file=sys.stderr)
            except (ValueError,IndexError):
                pass
        raise

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--check-open",action="store_true")
    args=parser.parse_args()
    registry=json.loads(CONFIG.read_text())
    open_now=open_markets(registry,now_utc())
    if args.check_open:
        output="open="+("true" if open_now else "false")+"\n"
        destination=os.environ.get("GITHUB_OUTPUT")
        if destination:
            with open(destination,"a") as file:file.write(output)
        print("Trading exchanges:",",".join(sorted(open_now)) or "none")
        return
    if not open_now:
        print("No supported international market is within normal weekday trading hours.")
        return
    symbols=discover(registry,open_now)
    if not symbols:
        print("No tracked international tickers in currently trading markets.")
        return
    quotes=fetch_prices(symbols)
    print("Requested",len(symbols),"tickers across",len(open_now),"exchanges; verified",len(quotes),"Yahoo 5-minute bars")
    if not quotes:
        raise RuntimeError("No verifiable international quote: no cache overwrite attempted")
    result=publish(quotes)
    if result.get("status")!="UPDATED":
        raise RuntimeError("Private ingest failed")
    print("Private quote cache updated:",result.get("accepted"),"tickers; no quotes logged or committed")

if __name__=="__main__":
    main()
