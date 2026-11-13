import test from "node:test";
import assert from "node:assert/strict";
import { archiveInfo,latestArchive,parseReport } from "../build.mjs";
import {readFileSync} from "node:fs";
test("canonical ticker and archive parsing",()=>{
  assert.equal(archiveInfo("halal/AAPL/AAPL_2026-11-06_12-20-11Z.md").ticker,"AAPL");
  assert.equal(archiveInfo("halal/ABC/XYZ_2026-11-06_12-20-11Z.md"),null);
  assert.equal(archiveInfo("COMPARISONS/X.md"),null);
});
test("newest across two buckets wins without backfill",()=>{
  const older=archiveInfo("halal/AAPL/AAPL_2026-11-06_12-20-11Z.md");
  const latest=archiveInfo("nonhalal/AAPL/AAPL_2026-11-07_12-20-11Z.md");
  assert.deepEqual(latestArchive([older,latest]),[latest]);
  const r=parseReport(latest,"# AAPL — HALAL STATUS ONLY / FINANCIAL RESEARCH SKIPPED\nClassification: NOT VERIFIED");
  assert.equal(r.statusOnly,true);assert.equal(r.investment,"NOT RATED");
});
test("extracts full dashboard and never calculates 24h from report",()=>{
  const info=archiveInfo("halal/AMAT/AMAT_2026-11-07_00-16-40Z.md");
  const raw="# AMAT — APPLIED MATERIALS, INC. (NASDAQ:AMAT)\n"+
    "| Field | Value |\n|---|---|\n| Action if I don't own any | WATCH |\n"+
    "| Investment Score | 77/100 |\n| Entry Score | 43/100 |\n"+
    "| Preferred / acceptable | US$275–305 / US$306–325 |\n"+
    "| Initial stop / no_chase | US$250 / US$365 |\n";
  const r=parseReport(info,raw);
  assert.equal(r.investment,"77/100");assert.equal(r.entry,"43/100");assert.equal(r.action,"WATCH");
  assert.deepEqual(r.zoneBands,[[275,305],[306,325]]);
  assert.equal(Object.hasOwn(r,"price"),false);
});

test("unsuffixed ASX security identity is not sent to US price feed",()=>{
  const x=archiveInfo("halal/ORG/ORG_2026-11-05_12-00-18Z.md");
  const report="# Origin Energy Ltd (ASX:ORG) — Research Report\n**Security:** Origin Energy Ltd, Australian Securities Exchange (ORG.AX)\n";
  const r=parseReport(x,report);
  assert.equal(r.exchange,"ASX");
  assert.equal(r.company,"Origin Energy Ltd");
  assert.equal(r.nativeCurrency,"AUD");
  assert.deepEqual(r.zoneBands,[]);
});

test("reads canonical and legacy HTML filenames and prefers HTML over Markdown at the same instant",()=>{
 const canonical=archiveInfo("halal/NVDA/NVDA_2026-11-08_20-58-00Z.html");
 const oldHtml=archiveInfo("halal/NVDA/NVDA_2026-11-08_20-58-00Z_chat_response.html");
 const md=archiveInfo("halal/NVDA/NVDA_2026-11-08_20-58-00Z.md");
 assert.equal(canonical.format,"html");assert.equal(oldHtml.format,"html");
 assert.equal(archiveInfo("halal/NVDA/NVDA_2026-11-08_20-58-00Z.html.bak"),null);
 assert.deepEqual(latestArchive([md,oldHtml,canonical]),[canonical]);
 const newer=archiveInfo("nonhalal/NVDA/NVDA_2026-11-09_00-00-00Z.html");
 assert.deepEqual(latestArchive([canonical,newer]),[newer]);
});
test("new standalone HTML report extracts fields without borrowing prior Markdown data",async()=>{
 const {parseHtmlReport,safeHtmlDocument}=await import("../lib/report-archive.mjs");
 const info=archiveInfo("halal/NEWCO/NEWCO_2026-11-09_04-00-00Z.html");
 const raw='<!DOCTYPE html><html><head><title>NEWCO report</title><style>h1{color:red}</style></head><body>'+
  '<h1>New Company (NASDAQ:NEWCO) — 9 November 2026</h1><div class="screen"><span class="pill">Musaffa HALAL · B</span><span class="date">Screened 1 November 2026</span></div>'+
  '<div class="actions"><div class="action orange">WATCH — new buyer</div><div class="action gray">HOLD — existing holder</div></div>'+
  '<div class="scoregrid"><div><div class="muted tiny">Investment</div><div class="score">71/100</div></div><div><div class="muted tiny">Entry</div><div class="score">44/100</div></div></div>'+
  '<table><tr><td>Preferred buy zone</td><td>$12–15</td></tr><tr><td>Acceptable buy zone</td><td>$16–17</td></tr></table>'+
  '<script>alert(1)</script><p>Complete research report</p></body></html>';
 const row=parseHtmlReport(info,raw);
 assert.equal(row.company,"New Company");assert.equal(row.ticker,"NEWCO");
 assert.equal(row.investment,"71/100");assert.equal(row.entry,"44/100");
 assert.equal(row.action,"WATCH — new buyer");
 assert.equal(row.sourceFormat,"html");
 assert.equal(row.reportPath,"/view-report?path=halal%2FNEWCO%2FNEWCO_2026-11-09_04-00-00Z.html");
 assert.deepEqual(row.zoneBands,[[12,15],[16,17]]);
 const rendered=safeHtmlDocument(info,raw);
 assert(rendered.includes("Complete research report"));
 assert(!rendered.includes("<script>"));assert(rendered.includes("<style>"));
});

test("dashboard uses independent regular and overnight columns",()=>{
 const code=readFileSync(new URL("../build.mjs",import.meta.url),"utf8");
 assert(code.includes('"Regular / latest price","Overnight / vs close","Live chart · 1M","Action / Risk"'));
 assert(code.includes('colspan="13"'));
});

test("snapshot-based Mastercard HTML extraction yields actual scores, actions, Shariah and bands",async()=>{
 const {archiveInfo,parseHtmlReport}=await import("../lib/report-archive.mjs");
 const info=archiveInfo("halal/MA/MA_2026-11-09_05-35-16Z.html");
 const snapshot={
  report_type:"full",ticker:"MA",exchange:"NYSE",
  identity:{company:"Mastercard Incorporated"},
  musaffa:{classification:"HALAL",grade:"A",screening_date:"2026-08-03"},
  actions:{new_position:"WATCH",existing_holder:"HOLD"},risk:"MODERATE-HIGH",
  scores:{investment:83,entry:45},
  next_earnings:{date:"2027-01-28",confirmed:false},
  entry:{preferred_low:535,preferred_high:565,acceptable_low:566,acceptable_high:600,no_chase:640},
  targets:{stop:510}
 };
 const html='<!DOCTYPE html><html><head><title>MA</title></head><body><h1>Mastercard Incorporated <small>NYSE: MA</small></h1>'+
  '<script type="application/json" id="aya-report-snapshot">'+JSON.stringify(snapshot)+'</script>'+
  '<p>A full finance report, with self-contained score snapshot and chart.</p></body></html>';
 const v=parseHtmlReport(info,html);
 assert.equal(v.company,"Mastercard Incorporated");assert.equal(v.statusOnly,false);
 assert.equal(v.action,"WATCH");assert.equal(v.ownerAction,"HOLD");assert.equal(v.risk,"MODERATE-HIGH");
 assert.equal(v.investment,"83/100");assert.equal(v.entry,"45/100");
 assert.equal(v.musaffa,"HALAL · A · 2026-08-03");
 assert.equal(v.earnings,"28 Jan 2027 estimated");
 assert.equal(v.zones,"US$535–565 / US$566–600");
 assert.equal(v.stops,"US$510 / US$640");
 assert.deepEqual(v.zoneBands,[[535,565],[566,600]]);
 assert.throws(()=>parseHtmlReport({...info,ticker:"FAKE"},html),/identity mismatch/);
});
test("full TWSE archive suffix accepts only the exact TW exchange alias",async()=>{
 const {parseHtmlReport,archiveInfo}=await import("../lib/report-archive.mjs");
 const info=archiveInfo("nonhalal/1519.TWSE/1519.TWSE_2026-11-09_05-23-30Z.html");
 assert.equal(info.ticker,"1519.TWSE");
 const rawData={ticker:"1519.TW",exchange:"TWSE",report_type:"screening_only",
   identity:{company:"Fortune Electric"}};
 const generate=(data)=>'<!DOCTYPE html><html><head><title>status</title></head><body><h1>Fortune Electric</h1>'+
   '<p>HALAL STATUS ONLY. Full investment research skipped due to stale screening.</p>'+
   '<script id="aya-report-snapshot" type="application/json">'+JSON.stringify(data)+'</script></body></html>';
 const row=parseHtmlReport(info,generate(rawData));
 assert.equal(row.ticker,"1519.TWSE");
 assert.equal(row.exchange,"TWSE");
 assert.equal(row.statusOnly,true);
 assert.throws(()=>parseHtmlReport(info,generate({...rawData,ticker:"2330.TW"})),/identity mismatch/);
 assert.throws(()=>parseHtmlReport(info,generate({...rawData,exchange:"ASX"})),/identity mismatch/);
});


test("Aya 3.1 canonical-only snapshots index without weakening exact ticker identity",async()=>{
  const {archiveInfo,parseHtmlReport}=await import("../lib/report-archive.mjs");
  const info=archiveInfo("halal/XOM/XOM_2026-11-09_21-21-54Z.html");
  const base={canonical_archive_ticker:"XOM",source_market_ticker:"XOM",
    exchange:"NYSE",company:"ExxonMobil",report_type:"full",investment_score:76};
  const make=(snapshot)=>'<!doctype html><html><head><title>XOM</title></head><body>'+
    '<h1>ExxonMobil Corporation</h1><script type="application/json" id="aya-report-snapshot">'+
    JSON.stringify(snapshot)+'</script><p>Research report</p></body></html>';
  const result=parseHtmlReport(info,make(base));
  assert.equal(result.ticker,"XOM");
  assert.equal(result.statusOnly,false);
  assert.throws(()=>parseHtmlReport(info,make({...base,canonical_archive_ticker:"CVX"})),/identity mismatch/);
  assert.throws(()=>parseHtmlReport(info,make({...base,ticker:"CVX"})),/identity mismatch/);
  assert.throws(()=>parseHtmlReport(info,make({exchange:"NYSE"})),/identity mismatch/);
});


test("Legacy PG/JNJ/AAPL/XOM snapshot names never become NOT RATED",async()=>{
 const {archiveInfo,parseHtmlReport}=await import("../lib/report-archive.mjs");
 const examples=[
  ["PG",{canonical_archive_ticker:"PG",exchange:"NYSE",company:"The Procter & Gamble Company",report_type:"full",
    musaffa:{status:"HALAL",grade:"A-",screening_date:"2026-08-10"},
    investment_score:73,entry_score:35,new_buyer_action:"WATCH",existing_holder_action:"HOLD",
    risk:"MODERATE",earnings:"20 January 2027 estimated/unconfirmed; other calendars 21 January",
    preferred_buy_zone:[147,154],acceptable_buy_zone:[155,161],no_chase:168,stop:139},
   {invest:"73/100",entry:"35/100",musaffa:"HALAL · A- · 2026-08-10",
    zones:"US$147–154 / US$155–161",stops:"US$139 / US$168"}],
  ["JNJ",{canonical_archive_ticker:"JNJ",company:"Johnson & Johnson",exchange:"NYSE",report_type:"full",
    musaffa:{status:"HALAL",grade:"B−",screen_date:"2026-08-04"},
    new_buyer_action:"WATCH",existing_holder_action:"HOLD",investment_score:73,entry_score:29,
    next_earnings:"26 Jan 2027 (estimated; unconfirmed)",
    entry_preferred:[230,245],entry_acceptable:[246,255],stop:218,no_chase:270},
   {invest:"73/100",entry:"29/100",musaffa:"HALAL · B− · 2026-08-04",
    zones:"US$230–245 / US$246–255",stops:"US$218 / US$270"}],
  ["AAPL",{ticker:"AAPL",company:"Apple Inc.",exchange:"NASDAQ",report_type:"full",
    musaffa:{classification:"HALAL",grade:"C",date:"2026-08-20"},
    new_buyer_action:"WATCH",holder_action:"HOLD",investment_score:75,entry_score:35,
    earnings:{next_date:"2027-02-04",date_status:"estimated unconfirmed"},
    buy:{preferred:[315,325],acceptable:[326,336],stop:299,no_chase:344}},
   {invest:"75/100",entry:"35/100",musaffa:"HALAL · C · 2026-08-20",
    zones:"US$315–325 / US$326–336",stops:"US$299 / US$344"}],
  ["XOM",{canonical_archive_ticker:"XOM",company:"ExxonMobil Holdings Corporation",exchange:"NYSE",report_type:"full",
    screening:{status:"HALAL",grade:"A",screened_date:"2026-08-04"},
    actions:{new_buyer:"WATCH",holder:"HOLD"},scores:{investment:76,entry:62},
    earnings:{next_date_estimated:"2027-01-29"},
    entry:{preferred:[150,158],acceptable:[159,164],no_chase:173,initial_stop:142}},
   {invest:"76/100",entry:"62/100",musaffa:"HALAL · A · 2026-08-04",
    zones:"US$150–158 / US$159–164",stops:"US$142 / US$173"}]
 ];
 for(const [ticker,snapshot,expected] of examples){
   const info=archiveInfo("halal/"+ticker+"/"+ticker+"_2026-11-09_21-27-38Z.html");
   const html='<!DOCTYPE html><html><head><title>'+ticker+'</title></head><body>'+
     '<h1>'+ticker+' Research</h1><script id="aya-report-snapshot" type="application/json">'+
     JSON.stringify(snapshot)+'</script><p>Full investment research</p></body></html>';
   const row=parseHtmlReport(info,html);
   assert.equal(row.investment,expected.invest,ticker+" investment");
   assert.equal(row.entry,expected.entry,ticker+" entry");
   assert.equal(row.action,"WATCH",ticker+" new buyer");
   assert.equal(row.ownerAction,"HOLD",ticker+" holder");
   assert.equal(row.musaffa,expected.musaffa,ticker+" Musaffa");
   assert.equal(row.zones,expected.zones,ticker+" zones");
   assert.equal(row.stops,expected.stops,ticker+" stop/no chase");
   assert.notEqual(row.earnings,"NOT VERIFIED",ticker+" earnings");
 }
});
test("Exact Aya HTML snapshot v2 keys are accepted and mismatches rejected",async()=>{
 const {archiveInfo,parseHtmlReport}=await import("../lib/report-archive.mjs");
 const info=archiveInfo("halal/PG/PG_2026-11-09_21-27-38Z.html");
 const sample={
   schema_version:2,ticker:"PG",canonical_archive_ticker:"PG",source_market_ticker:"PG",
   exchange:"NYSE",company:"The Procter & Gamble Company",currency:"USD",
   report_utc:"2026-11-09T21:27:38Z",report_type:"full",
   musaffa:{classification:"HALAL",grade:"A-",screening_date:"2026-08-10",gate:"PASS"},
   actions:{new_position:"WATCH",existing_holder:"HOLD"},risk:"MODERATE",
   scores:{investment:73,entry:35},next_earnings:{date:"2027-01-20",confirmed:false},
   entry:{preferred_low:147,preferred_high:154,acceptable_low:155,acceptable_high:161,no_chase:168},
   targets:{stop:139,tp1:172,tp2:182}
 };
 const html=value=>'<!doctype html><html><head><title>PG</title></head><body><h1>The Procter & Gamble Company</h1>'+
    '<script id="aya-report-snapshot" type="application/json">'+JSON.stringify(value)+'</script></body></html>';
 const row=parseHtmlReport(info,html(sample));
 assert.equal(row.action,"WATCH");assert.equal(row.ownerAction,"HOLD");
 assert.equal(row.investment,"73/100");assert.equal(row.entry,"35/100");
 assert.equal(row.musaffa,"HALAL · A- · 2026-08-10 · PASS");
 assert.equal(row.earnings,"20 Jan 2027 estimated");
 assert.equal(row.zones,"US$147–154 / US$155–161");
 assert.equal(row.stops,"US$139 / US$168");
 assert.equal(row.company,"The Procter & Gamble Company");
 assert.throws(()=>parseHtmlReport(info,html({...sample,scores:{investment:73}})),/Incomplete Aya v2 nested report fields/);
 assert.throws(()=>parseHtmlReport(info,html({...sample,ticker:"JNJ"})),/identity mismatch/);
 assert.throws(()=>parseHtmlReport(info,html({...sample,canonical_archive_ticker:"JNJ"})),/identity mismatch/);
 const status={...sample,report_type:"screening_only",musaffa:{classification:"HALAL",grade:null,screening_date:null,gate:"UNVERIFIED"},
  actions:{new_position:null,existing_holder:null},risk:"NOT RATED",
  scores:{investment:null,entry:null},next_earnings:{date:null,confirmed:null},
  entry:{preferred_low:null,preferred_high:null,acceptable_low:null,acceptable_high:null,no_chase:null},
  targets:{stop:null,tp1:null,tp2:null}};
 const statusInfo=archiveInfo("nonhalal/PG/PG_2026-11-09_21-27-38Z.html");
 const screened=parseHtmlReport(statusInfo,html(status));
 assert.equal(screened.action,"SCREENING ONLY — NO INVESTMENT REPORT");
 assert.equal(screened.investment,"NOT RATED");
 assert.throws(()=>parseHtmlReport(statusInfo,html({...status,scores:{investment:73,entry:null}})),/Screening-only report/);
});

test("newer screening-only HTML never backfills earlier investment scores",async()=>{
 const {archiveInfo,parseHtmlReport}=await import("../lib/report-archive.mjs");
 const info=archiveInfo("nonhalal/1519.TW/1519.TW_2026-11-09_05-23-30Z.html");
 const data={ticker:"1519.TW",report_type:"screening_only",
  identity:{name:"Fortune Electric Co., Ltd."},
  musaffa:{classification:"HALAL in both available versions",screening_date:null,gate:"RECENCY UNVERIFIED"},
  scores:{investment:88,entry:77},actions:{new_position:"BUY"}};
 const html='<html><head><title>Screening</title></head><body><h1>Fortune Electric Co., Ltd.</h1>'+
  '<p>Full investment research skipped: screening recency unverified.</p>'+
  '<script id="aya-report-snapshot" type="application/json">'+JSON.stringify(data)+'</script></body></html>';
 const v=parseHtmlReport(info,html);
 assert.equal(v.statusOnly,true);
 assert.equal(v.action,"SCREENING ONLY — NO INVESTMENT REPORT");
 assert.equal(v.investment,"NOT RATED");assert.equal(v.entry,"NOT RATED");
 assert(v.musaffa.includes("RECENCY UNVERIFIED"));
});

test("main dashboard has thirteen headings, with reports opened by ticker",()=>{
 const src=readFileSync(new URL("../build.mjs",import.meta.url),"utf8");
 const labels=src.match(/const labels=(\[[^\n]+\]);/);
 assert(labels);
 assert.equal(JSON.parse(labels[1]).length,13);
 assert(!JSON.parse(labels[1]).includes("Report"));
 assert(src.includes('colspan="13"'));
});

test("legacy exchange-suffixed Markdown reports map to actual markets, not OTHER",()=>{
  for(const [ticker,expected] of [["2330.TWSE","TWSE"],["2379.TWSE","TWSE"],
    ["ORG.ASX","ASX"],["APA.ASX","ASX"],["CBHB.MYX","BURSA"]]){
    const info=archiveInfo("halal/"+ticker+"/"+ticker+"_2026-11-10_01-00-00Z.md");
    const row=parseReport(info,"# "+ticker+" archived research\\n| Field | Value |\\n|---|---|");
    assert.equal(row.exchange,expected,ticker);
  }
});
test("website builds fingerprinted JS and CSS URLs to avoid stale dashboard code",()=>{
  const source=readFileSync(new URL("../build.mjs",import.meta.url),"utf8");
  assert(source.includes('const styleVersion=versionOf("style.css"),scriptVersion=versionOf("app.js")'));
  assert(source.includes("/assets/app.js?v='+scriptVersion"));
  assert(source.includes("/assets/style.css?v='+styleVersion"));
});
