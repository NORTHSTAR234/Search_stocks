"""Market schedule self-discovery regression tests (no network or Yahoo calls)."""
import datetime as dt
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

COLLECTOR=Path(__file__).resolve().parents[1]/"collect-international-quotes.py"
spec=importlib.util.spec_from_file_location("international_collector",COLLECTOR)
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

def snapshot(ticker="ASM.XAMS", **overrides):
    result={
        "schema_version":2,
        "ticker":ticker,
        "canonical_archive_ticker":ticker,
        "source_market_ticker":"ASM.AS",
        "exchange":"XAMS",
        "currency":"EUR",
        "market_schedule":{
            "exchange":"XAMS",
            "mic":"XAMS",
            "market_time_zone":"Europe/Amsterdam",
            "sydney_time_zone":"Australia/Sydney",
            "weekdays":[1,2,3,4,5],
            "sessions":[{"start":"09:00","end":"17:30"}],
            "yahoo_ticker":"ASM.AS",
            "hours_source":"https://www.euronext.com/en/trading/trading-hours-holidays",
            "hours_checked_utc":"2026-11-10T08:31:33Z"
        }
    }
    result.update(overrides)
    return result

class MarketSelfDiscovery(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)
        self.original=module.ROOT
        module.ROOT=self.root
        self.addCleanup(lambda:setattr(module,"ROOT",self.original))
        self.registry={"markets":{"US":{"timeZone":"America/New_York","weekdays":[1,2,3,4,5],
                                      "sessions":[{"start":"09:30","end":"16:00"}],"priceSource":"alpaca"}},"aliases":{}}
    def add(self,ticker,snap,bucket="halal"):
        folder=self.root/bucket/ticker
        folder.mkdir(parents=True,exist_ok=True)
        p=folder/(ticker+"_2026-11-10_08-31-33Z.html")
        p.write_text('<html><script type="application/json" id="aya-report-snapshot">'+
                     json.dumps(snap)+'</script></html>')
    def test_unknown_exchange_from_valid_HTML_requires_no_registry_edit(self):
        self.add("ASM.XAMS",snapshot())
        known=module.report_markets(self.registry)
        self.assertIn("XAMS",known)
        self.assertEqual(known["XAMS"]["timeZone"],"Europe/Amsterdam")
        self.assertEqual(known["XAMS"]["currency"],"EUR")
        self.assertEqual(known["XAMS"]["yahooSuffix"],".AS")
        at_open=dt.datetime(2026,11,10,8,45,tzinfo=dt.timezone.utc)
        self.assertIn("XAMS",module.open_markets(self.registry,at_open))
        self.assertEqual(module.discover(self.registry,module.open_markets(self.registry,at_open))["ASM.XAMS"]["yahoo"],"ASM.AS")
        self.assertNotIn("XAMS",module.open_markets(self.registry,at_open-dt.timedelta(hours=2)))
        self.assertNotIn("XAMS",module.open_markets(self.registry,at_open+dt.timedelta(hours=9)))
    def test_fail_closed_for_invalid_identity_or_session_or_provider(self):
        base=snapshot()
        invalid=[
            {"ticker":"FAKE.XAMS"},
            {"canonical_archive_ticker":"FAKE.XAMS"},
            {"currency":"NOT A CURRENCY"},
            {"market_schedule":{**base["market_schedule"],"yahoo_ticker":"ASM"}},
            {"market_schedule":{**base["market_schedule"],"sessions":[{"start":"09:00","end":"BAD"}]}},
            {"market_schedule":{**base["market_schedule"],"market_time_zone":"Invalid/Amsterdam"}},
            {"market_schedule":{**base["market_schedule"],"sydney_time_zone":"America/New_York"}}
        ]
        for x in invalid:
            with self.subTest(x=x):
                self.add("ASM.XAMS",snapshot(**x))
                self.assertNotIn("XAMS",module.report_markets(self.registry))
    def test_inconsistent_metadata_for_same_exchange_fails_closed(self):
        self.add("ASM.XAMS",snapshot())
        different=snapshot(ticker="BESI.XAMS",source_market_ticker="BESI.AS")
        different["market_schedule"]["yahoo_ticker"]="BESI.AS"
        different["market_schedule"]["sessions"]=[{"start":"08:00","end":"17:30"}]
        self.add("BESI.XAMS",different)
        self.assertNotIn("XAMS",module.report_markets(self.registry))
    def test_us_alpaca_not_selected_by_international_collector(self):
        self.assertEqual(module.report_markets(self.registry)["US"]["priceSource"],"alpaca")
        self.assertEqual(module.open_markets(self.registry,dt.datetime(2026,11,10,14,30,tzinfo=dt.timezone.utc)),{})
if __name__=="__main__":
    unittest.main()
