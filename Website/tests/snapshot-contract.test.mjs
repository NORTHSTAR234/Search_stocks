import {readFileSync} from "node:fs";
// Dependency-free regression tests run by the GitHub Actions report-index workflow.
// They verify the exact Aya v2 contract and old reports without modifying archives.
import test from "node:test";
import assert from "node:assert/strict";
import {archiveInfo,aaoifiInfo,parseHtmlReport,parseAaoifiHtml} from "../lib/report-archive.mjs";

const html=snapshot=>'<!doctype html><html lang="en"><head><title>Research</title></head><body>'+
  '<h1>Stock Research</h1><script type="application/json" id="aya-report-snapshot">'+
  JSON.stringify(snapshot)+'</script><p>Complete report</p></body></html>';
const info=t=>archiveInfo('halal/'+t+'/'+t+'_2026-11-09_21-27-38Z.html');

const canonical={
  schema_version:2,ticker:"PG",canonical_archive_ticker:"PG",source_market_ticker:"PG",
  exchange:"NYSE",company:"The Procter & Gamble Company",currency:"USD",
  report_utc:"2026-11-09T21:27:38Z",report_type:"full",
  musaffa:{classification:"HALAL",grade:"A-",screening_date:"2026-08-10",gate:"PASS"},
  actions:{new_position:"WATCH",existing_holder:"HOLD"},risk:"MODERATE",
  scores:{investment:73,entry:35},next_earnings:{date:"2027-01-20",confirmed:false},
  entry:{preferred_low:147,preferred_high:154,acceptable_low:155,acceptable_high:161,no_chase:168},
  targets:{stop:139,tp1:172,tp2:182}
};

test("canonical v2 snapshot uses exact nested website keys",()=>{
 const row=parseHtmlReport(info("PG"),html(canonical));
 assert.equal(row.company,"The Procter & Gamble Company");
 assert.equal(row.statusOnly,false);
 assert.equal(row.action,"WATCH");
 assert.equal(row.ownerAction,"HOLD");
 assert.equal(row.investment,"73/100");
 assert.equal(row.entry,"35/100");
 assert.equal(row.musaffa,"HALAL · A- · 2026-08-10 · PASS");
 assert.equal(row.earnings,"20 Jan 2027 estimated");
 assert.equal(row.zones,"US$147–154 / US$155–161");
 assert.equal(row.stops,"US$139 / US$168");
 assert.deepEqual(row.zoneBands,[[147,154],[155,161]]);
});
test("canonical v2 refuses missing, wrong-typed or mismatched keys",()=>{
 assert.throws(()=>parseHtmlReport(info("PG"),html({...canonical,ticker:"JNJ"})),/identity mismatch/);
 assert.throws(()=>parseHtmlReport(info("PG"),html({...canonical,scores:{investment:73}})),/Incomplete Aya v2 nested report fields/);
 assert.throws(()=>parseHtmlReport(info("PG"),html({...canonical,entry:{...canonical.entry,preferred_low:"147"}})),/Invalid Aya v2 rating or price/);
 assert.throws(()=>parseHtmlReport(info("PG"),html({...canonical,canonical_archive_ticker:"JNJ"})),/identity mismatch/);
});
test("canonical v2 status-only never leaks full research",()=>{
 const row={
  ...canonical,report_type:"screening_only",
  musaffa:{classification:"HALAL",grade:null,screening_date:null,gate:"UNVERIFIED"},
  actions:{new_position:null,existing_holder:null},risk:"NOT RATED",
  scores:{investment:null,entry:null},next_earnings:{date:null,confirmed:null},
  entry:{preferred_low:null,preferred_high:null,acceptable_low:null,acceptable_high:null,no_chase:null},
  targets:{stop:null,tp1:null,tp2:null}
 };
 const statusInfo=archiveInfo("nonhalal/PG/PG_2026-11-09_21-27-38Z.html");
 const parsed=parseHtmlReport(statusInfo,html(row));
 assert.equal(parsed.statusOnly,true);
 assert.equal(parsed.action,"SCREENING ONLY — NO INVESTMENT REPORT");
 assert.equal(parsed.investment,"NOT RATED");
 assert.throws(()=>parseHtmlReport(statusInfo,html({...row,scores:{investment:73,entry:null}})),/Screening-only report/);
});
test("PG, JNJ, AAPL and XOM historical snapshot aliases remain readable",()=>{
 const examples=[
  ["PG",{canonical_archive_ticker:"PG",exchange:"NYSE",company:"The Procter & Gamble Company",report_type:"full",
    musaffa:{status:"HALAL",grade:"A-",screening_date:"2026-08-10"},
    investment_score:73,entry_score:35,new_buyer_action:"WATCH",existing_holder_action:"HOLD",
    earnings:"20 January 2027 estimated/unconfirmed; other calendars 21 January",
    preferred_buy_zone:[147,154],acceptable_buy_zone:[155,161],no_chase:168,stop:139},
    ["73/100","35/100","HALAL · A- · 2026-08-10","US$147–154 / US$155–161","US$139 / US$168"]],
  ["JNJ",{canonical_archive_ticker:"JNJ",exchange:"NYSE",company:"Johnson & Johnson",report_type:"full",
    musaffa:{status:"HALAL",grade:"B−",screen_date:"2026-08-04"},
    investment_score:73,entry_score:29,new_buyer_action:"WATCH",existing_holder_action:"HOLD",
    next_earnings:"26 Jan 2027 (estimated; unconfirmed)",
    entry_preferred:[230,245],entry_acceptable:[246,255],stop:218,no_chase:270},
    ["73/100","29/100","HALAL · B− · 2026-08-04","US$230–245 / US$246–255","US$218 / US$270"]],
  ["AAPL",{ticker:"AAPL",exchange:"NASDAQ",company:"Apple Inc.",report_type:"full",
    musaffa:{classification:"HALAL",grade:"C",date:"2026-08-20"},
    investment_score:75,entry_score:35,new_buyer_action:"WATCH",holder_action:"HOLD",
    earnings:{next_date:"2027-02-04",date_status:"estimated unconfirmed"},
    buy:{preferred:[315,325],acceptable:[326,336],stop:299,no_chase:344}},
    ["75/100","35/100","HALAL · C · 2026-08-20","US$315–325 / US$326–336","US$299 / US$344"]],
  ["XOM",{canonical_archive_ticker:"XOM",exchange:"NYSE",company:"ExxonMobil Holdings Corporation",report_type:"full",
    screening:{status:"HALAL",grade:"A",screened_date:"2026-08-04"},
    actions:{new_buyer:"WATCH",holder:"HOLD"},scores:{investment:76,entry:62},
    earnings:{next_date_estimated:"2027-01-29"},
    entry:{preferred:[150,158],acceptable:[159,164],no_chase:173,initial_stop:142}},
    ["76/100","62/100","HALAL · A · 2026-08-04","US$150–158 / US$159–164","US$142 / US$173"]]
 ];
 for(const [ticker,record,expect] of examples){
  const row=parseHtmlReport(info(ticker),html(record));
  assert.equal(row.investment,expect[0],ticker+" investment");
  assert.equal(row.entry,expect[1],ticker+" entry");
  assert.equal(row.action,"WATCH",ticker+" new-buyer action");
  assert.equal(row.ownerAction,"HOLD",ticker+" holder action");
  assert.equal(row.musaffa,expect[2],ticker+" screening");
  assert.equal(row.zones,expect[3],ticker+" buy zones");
  assert.equal(row.stops,expect[4],ticker+" initial stop/no chase");
  assert.notEqual(row.earnings,"NOT VERIFIED",ticker+" earnings");
 }
});

test("new nonhalal full report preserves financial research and separate Musaffa screening evidence",()=>{
  const statusInfo=archiveInfo("nonhalal/PG/PG_2026-11-09_21-27-38Z.html");
  const unverified={...canonical,report_type:"full",musaffa:{
    classification:"HALAL",grade:null,screening_date:"2025-11-01",
    gate:"STALE",assessment:"INCONCLUSIVE",reason:"Last dated screen is older than four calendar months"
  }};
  const parsed=parseHtmlReport(statusInfo,html(unverified));
  assert.equal(parsed.statusOnly,false);
  assert.equal(parsed.investment,"73/100");
  assert.equal(parsed.entry,"35/100");
  assert.equal(parsed.action,"WATCH");
  assert.equal(parsed.musaffaGate,"STALE");
  assert.equal(parsed.musaffaScreeningDate,"2025-11-01");
  assert.equal(parsed.musaffaAssessment,"INCONCLUSIVE");
  assert.match(parsed.musaffaReason,/older than four/);
  assert.deepEqual(parsed.zoneBands,[[147,154],[155,161]]);
});

test("SU.PA October 2026 month-only Musaffa screen survives HTML snapshot parsing",()=>{
  const su={...canonical,ticker:"SU.PA",canonical_archive_ticker:"SU.PA",
    source_market_ticker:"SU.PA",exchange:"XPAR",currency:"EUR",
    company:"Schneider Electric SE",musaffa:{
      classification:"HALAL",grade:null,screening_date:null,gate:"PASS",
      screening_month:"2026-10",date_precision:"month"
    }};
  const suInfo=archiveInfo("halal/SU.PA/SU.PA_2026-11-11_04-02-22Z.html");
  const row=parseHtmlReport(suInfo,html(su));
  assert.equal(row.musaffaScreeningPeriod,"2026-10");
  assert.equal(row.musaffaScreeningMonthConflict,false);
  assert.equal(row.musaffaScreeningDate,null);
  assert.equal(row.musaffa,"HALAL · 2026-10 (month) · PASS");
  assert.equal(row.action,"WATCH");
  assert.equal(row.investment,"73/100");
  const canonicalPeriod=parseHtmlReport(suInfo,html({...su,musaffa:{
    classification:"HALAL",grade:null,screening_date:null,gate:"PASS",
    screening_period:"2026-10"
  }}));
  assert.equal(canonicalPeriod.musaffaScreeningPeriod,"2026-10");
  const conflicting=parseHtmlReport(suInfo,html({...su,musaffa:{
    classification:"HALAL",grade:null,screening_date:null,gate:"PASS",
    screening_period:"2026-08",screening_month:"2026-10"
  }}));
  assert.equal(conflicting.musaffaScreeningMonthConflict,true);
});

test("AAOIFI overwrite report snapshot parses into dashboard status fields",()=>{
 const info=aaoifiInfo("AAOIFI/NVDA.NASDAQ.html");
 const snapshot={
  schema_version:1,ticker:"NVDA",exchange:"NASDAQ",company:"NVIDIA Corporation",
  status:"SHARIAH REVIEW REQUIRED",confidence:"Medium",
  screened_at:"2026-11-12T08:40:00Z",
  executive_summary:"Core AAOIFI ratios pass, but material investment gains still require Shariah classification."
 };
 const doc='<!doctype html><html><body><script type="application/json" id="aaoifi-report-snapshot">'+
  JSON.stringify(snapshot)+'</script><h1>AAOIFI</h1></body></html>';
 const row=parseAaoifiHtml(info,doc);
 assert.equal(row.ticker,"NVDA");
 assert.equal(row.status,"SHARIAH REVIEW REQUIRED");
 assert.equal(row.confidence,"Medium");
 assert.match(row.reportPath,/AAOIFI%2FNVDA.NASDAQ.html/);
});

test("AMD independent AAOIFI screen retains tested financial pass, conditional rights and overall review",()=>{
 const source=readFileSync(new URL("../../AAOIFI/AMD.NASDAQ.html",import.meta.url),"utf8");
 const out=parseAaoifiHtml(aaoifiInfo("AAOIFI/AMD.NASDAQ.html"),source);
 assert.equal(out.ticker,"AMD");
 assert.equal(out.status,"SHARIAH REVIEW REQUIRED");
 assert.equal(out.aaoifiFinancialStatus,"PASS_ON_TESTED_EVIDENCE");
 assert.equal(out.aaoifiTradabilityStatus,"CONDITIONAL_BOOK_PROXY_ABOVE");
 assert(Math.abs(out.aaoifiTradabilityBookProxyPercent-32.162)<0.001);
 assert(out.aaoifiMissingEvidence.includes("market value"));
 assert.equal(out.ethicalStatus,"NEUTRAL");
 assert.equal(out.ethicalBdsListed,false);
});
