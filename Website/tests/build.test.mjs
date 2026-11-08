import test from "node:test";
import assert from "node:assert/strict";
import { archiveInfo,latestArchive,parseReport } from "../build.mjs";
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
