#!/usr/bin/env python3
"""Build market-open sessions from independently verified exchange identities.

All timestamps are stored as UTC instants; Sydney formatted hours are also
stored for display. Quotes are not collected or stored by this script.
Unknown/unverified exchanges fail closed, rather than pretending weekdays open.
"""
import datetime as dt
import json
from pathlib import Path
from zoneinfo import ZoneInfo
import exchange_calendars as xcals

HERE = Path(__file__).resolve().parent.parent
UTC = dt.timezone.utc
SYDNEY = ZoneInfo("Australia/Sydney")
TODAY = dt.datetime.now(UTC).date()
START = TODAY - dt.timedelta(days=2)
END = TODAY + dt.timedelta(days=18)

def utc_iso(value):
    return value.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")

def interval(start, end):
    if start >= end:
        return None
    syd_start, syd_end = start.astimezone(SYDNEY), end.astimezone(SYDNEY)
    return {"start": utc_iso(start), "end": utc_iso(end),
            "sydney": syd_start.strftime("%a %d %b %H:%M")+"–"+syd_end.strftime("%H:%M %Z")
            if syd_start.date() == syd_end.date()
            else syd_start.strftime("%a %d %b %H:%M %Z")+" – "+syd_end.strftime("%a %d %b %H:%M %Z")}

def bursa_windows(open_dt, close_dt, timezone):
    """Exclude the documented midday gap and non-continuous closing auction."""
    day = open_dt.astimezone(timezone).date()
    def local(h, m):
        return dt.datetime(day.year, day.month, day.day, h, m, tzinfo=timezone).astimezone(UTC)
    return [(max(open_dt, local(9,0)), min(close_dt, local(12,15))),
            (max(open_dt, local(14,30)), min(close_dt, local(16,45)))]

def create():
    registry = json.loads((HERE/"market-exchanges.json").read_text())
    markets = {}
    for symbol, item in registry["exchanges"].items():
        if not item.get("officialHours") or not item.get("calendar") or not item.get("calendarCheckedUTC"):
            raise ValueError("Unverified exchange registry record: "+symbol)
        checked = dt.datetime.fromisoformat(item["calendarCheckedUTC"].replace("Z","+00:00"))
        if checked.tzinfo is None or dt.datetime.now(UTC)-checked>dt.timedelta(days=120):
            # A stale exchange calendar MUST NOT falsely show market open.
            markets[symbol]={"mic":item.get("mic"),"name":item.get("name"),
                             "status":"CALENDAR_UNVERIFIED","days":{},
                             "calendarCheckedUTC":item.get("calendarCheckedUTC")}
            continue
        calendar = xcals.get_calendar(item["calendar"])
        zone = ZoneInfo(item["timeZone"])
        sessions = set(x.date() for x in calendar.sessions_in_range(START.isoformat(), END.isoformat()))
        days = {}
        date = START
        while date <= END:
            key = date.isoformat()
            exception = item.get("holidayOverrides",{}).get(key)
            if exception:
                days[key]={"status":"MARKET_HOLIDAY","reason":exception,"periods":[]}
            elif date not in sessions:
                days[key]={"status":"WEEKEND" if date.weekday()>=5 else "MARKET_HOLIDAY","periods":[]}
            else:
                opened = calendar.session_open(key).to_pydatetime().astimezone(UTC)
                closed = calendar.session_close(key).to_pydatetime().astimezone(UTC)
                if item.get("sessionMode")=="bursa-continuous":
                    windows = bursa_windows(opened,closed,zone)
                else:
                    bstart = calendar.session_break_start(key)
                    bend = calendar.session_break_end(key)
                    if str(bstart)=="NaT" or str(bend)=="NaT":
                        windows = [(opened,closed)]
                    else:
                        windows = [(opened,bstart.to_pydatetime().astimezone(UTC)),
                                   (bend.to_pydatetime().astimezone(UTC),closed)]
                periods = [p for a,b in windows if (p:=interval(a,b))]
                days[key]={"status":"TRADING_DAY" if periods else "CALENDAR_UNVERIFIED",
                           "periods":periods}
            date += dt.timedelta(days=1)
        markets[symbol]={"mic":item["mic"],"name":item["name"],
                         "marketTimeZone":item["timeZone"],"sydneyTimeZone":"Australia/Sydney",
                         "calendar":item["calendar"],"officialHours":item["officialHours"],
                         "calendarCheckedUTC":item["calendarCheckedUTC"],
                         "status":"VERIFIED_SCHEDULE","days":days}
    return {"schemaVersion":1,"generatedAt":utc_iso(dt.datetime.now(UTC)),
            "validUntil":utc_iso(dt.datetime.now(UTC)+dt.timedelta(hours=36)),
            "sydneyTimeZone":"Australia/Sydney","markets":markets}

if __name__=="__main__":
    target = HERE/"market-sessions.json"
    target.write_text(json.dumps(create(),ensure_ascii=False,separators=(",",":"))+"\n")
    print("Updated",target)
