import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source=readFileSync(new URL("../assets/app.js",import.meta.url),"utf8");
const match=source.match(/const actionKind=v=>\{([\s\S]*?)\};/);
assert(match,"Dashboard recommendation classifier must exist");
const classify=new Function("v",match[1]);
test("WATCH stays orange even when explanation contains buy-zone",()=>{
  assert.equal(classify("🟠 WATCH — no validated support or favourable buy-zone"),"warn");
  assert.equal(classify("🟠 WATCH — wait before you BUY"),"warn");
});
test("BUY green, SELL/AVOID red, HOLD neutral",()=>{
  assert.equal(classify("🟢 BUY — favorable entry"),"good");
  assert.equal(classify("STRONG BUY"),"good");
  assert.equal(classify("🔴 SELL — risk too high"),"bad");
  assert.equal(classify("🔴 AVOID — no safety margin"),"bad");
  assert.equal(classify("⚪ HOLD — conditional"),"neutral");
  assert.equal(classify("SCREENING ONLY — NO INVESTMENT REPORT"),"neutral");
});

const yahooSource=source.match(/function yahooSymbol\(r\)\s*\{([\s\S]*?)\n  \}/);
assert(yahooSource,"Yahoo navigation symbol mapping must exist");
const yahooSymbol=new Function("r",yahooSource[1]);
test("Yahoo fallback maps only verified ASX, Taiwan and Malaysian listings",()=>{
  assert.equal(yahooSymbol({ticker:"ORG",exchange:"ASX"}),"ORG.AX");
  assert.equal(yahooSymbol({ticker:"APA.AX",exchange:"ASX"}),"APA.AX");
  assert.equal(yahooSymbol({ticker:"2330.TW",exchange:"TWSE"}),"2330.TW");
  assert.equal(yahooSymbol({ticker:"1519.TW",exchange:"TWSE"}),"1519.TW");
  assert.equal(yahooSymbol({ticker:"CBHB",exchange:"BURSA"}),"0339.KL");
  assert.equal(yahooSymbol({ticker:"0339.KL",exchange:"BURSA"}),"0339.KL");
  assert.equal(yahooSymbol({ticker:"AAPL",exchange:"US"}),null);
  assert.equal(yahooSymbol({ticker:"UNKNOWN",exchange:"OTHER"}),null);
});
test("Yahoo fallback never fetches or proxies an unofficial Yahoo endpoint",()=>{
  assert(!source.includes("query1.finance.yahoo.com"));
  assert(!source.includes("query2.finance.yahoo.com"));
  assert(source.includes('target="_blank" rel="noopener noreferrer"'));
});

test("Quote scheduler refreshes every five minutes only while page is visible",()=>{
  assert.match(source,/setInterval\(\(\)=>\{if\(document\.visibilityState==="visible"\)checkAll\(\);\},300000\)/);
  assert.doesNotMatch(source,/setInterval\([^;]+,60000\)/);
  assert.match(source,/Automatic refresh every 5 minutes/);
});

test("EODHD and Alpaca both refresh independently every five minutes",()=>{
 assert(source.includes('retrieve("/api/prices",us,"Alpaca")'));
 assert(source.includes('retrieve("/api/international-prices",international,"EODHD")'));
 assert(source.includes('state.quotes={...usQuotes,...internationalQuotes}'));
 assert(source.includes('state.providerReady=true;'));
 assert(source.includes('previousCloseChangePercent'));
 assert(source.includes("IEX 24h"));
 assert(source.includes("vs previous close"));
 assert.match(source,/setInterval\(\(\)=>\{if\(document\.visibilityState==="visible"\)checkAll\(\);\},300000\)/);
});

test("GitHub reports and both price providers refresh together every five minutes",()=>{
 assert(source.includes("async function syncGithubReports()"));
 assert(source.includes('fetch(url,{credentials:"same-origin",cache:"no-store"})'));
 assert(source.includes('"/api/github-reports"'));
 assert(source.includes('if(!old||r.timestamp>old.timestamp'));
 assert(source.includes('state.rows=[...map.values()]'));
 assert(source.includes('await syncGithubReports();'));
 assert(source.includes('await refresh();'));
 assert(source.includes('addEventListener("click",checkAll)'));
 assert(source.includes('Next check in 5 minutes'));
});
test("unknown international tickers cannot break existing EODHD quote batches",()=>{
 assert(source.includes('eodhdSymbols.has(r.ticker.toUpperCase())'));
 assert(source.includes('eodhdSymbols=new Set(["ORG","APA.AX"'));
});

test("regular and overnight have distinct columns and signed price/percentage colors",()=>{
 assert(source.includes("function quoteCell(r)"));
 assert(source.includes("function overnightCell(r)"));
 assert(source.includes("'<td>'+overnightCell(r)+'</td>'"));
 assert(source.includes("Last US regular close · consolidated"));
 assert(source.includes("Indicative · 15-min delayed"));
 assert(source.includes("vs regular close"));
 assert(source.includes("vs previous regular close"));
 assert(source.includes("quoteDirection(pct)"));
 assert(source.includes("quoteDirection(valid?c.regularChangePercent:null)"));
 assert(source.includes("quote-value overnight-value"));
 assert(source.includes("No recent verified overnight indication"));
 assert(source.includes('colspan="11"'));
});

