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
 assert(code.includes('"Regular / latest price","Overnight / vs close","Action / Risk"'));
 assert(code.includes('colspan="11"'));
});
