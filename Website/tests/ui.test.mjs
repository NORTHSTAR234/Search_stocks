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


test("same-timestamp HTML field corrections and screening gates sync without a new filename",()=>{
 assert(source.includes('r.timestamp===old.timestamp&&(old.sourceFormat!=="html"||JSON.stringify(old)!==JSON.stringify(r))'));
 assert(source.includes('const screening=r.musaffa||"NOT VERIFIED"'));
 assert(source.includes('Screening only · no current investment rating'));
});

test("investment quality and entry timing have equal, independent color-coded score boxes",()=>{
 assert(source.includes("function scoreCell(r)"));
 assert(source.includes("'<td>'+scoreCell(r)+'</td>'"));
 assert(source.includes('item("Investment",r.investment)'));
 assert(source.includes('item("Entry",r.entry)'));
 const expression=source.match(/const scoreTone=value=>\{([\s\S]*?)\n  \};/);
 assert(expression,"score tone classifier must exist");
 const scoreTone=new Function("value","score",expression[1]);
 const parse=v=>{const m=String(v).match(/(\d{1,3})\s*\/\s*100/);return m?Number(m[1]):-1;};
 assert.equal(scoreTone("78/100",parse),"good");
 assert.equal(scoreTone("34/100",parse),"bad");
 assert.equal(scoreTone("48/100",parse),"warn");
 assert.equal(scoreTone("83/100",parse),"good");
 assert.equal(scoreTone("45/100",parse),"warn");
 assert.equal(scoreTone("NOT RATED",parse),"neutral");
 assert.equal(scoreTone("108/100",parse),"neutral");
});


test("Preferred / Acceptable and Initial stop / No chase match the existing Investment / Entry cards",()=>{
 assert(source.includes('function splitReportPair(value)'));
 assert(source.includes('function reportRangeCard(label,value,tone)'));
 assert(source.includes('function stopsCell(r)'));
 assert(source.includes('function zoneCell(r)'));
 assert(source.includes('score-pair range-pair'));
 assert(source.includes('score-box range-box'));
 assert(source.includes('reportRangeCard("Preferred",preferred,"good")'));
 assert(source.includes('reportRangeCard("Acceptable",acceptable,"warn")'));
 assert(source.includes('reportRangeCard("Initial stop",initial,"bad")'));
 assert(source.includes('reportRangeCard("No chase",noChase,"warn")'));
 assert(source.includes("'<td>'+zoneCell(r)+'</td>'"));
 assert(source.includes("'<td>'+stopsCell(r)+'</td>'"));
 assert(source.includes('IN PREFERRED ZONE'));
 assert(source.includes('IN ACCEPTABLE ZONE'));
});
test("pair rendering keeps exact report values, including unrated and unavailable fields",()=>{
 const pairBody=source.match(/function splitReportPair\(value\)\{([\s\S]*?)\n  \}/);
 assert(pairBody,"Pair splitter must exist");
 const split=new Function("value",pairBody[1]);
 assert.deepEqual(split("US$535–565 / US$566–600"),["US$535–565","US$566–600"]);
 assert.deepEqual(split("US$510 / US$640"),["US$510","US$640"]);
 assert.deepEqual(split("US$165–175 / US$176–185"),["US$165–175","US$176–185"]);
 assert.deepEqual(split("NOT RATED"),["NOT RATED","NOT RATED"]);
 assert.deepEqual(split("US$154"),["US$154","NOT RATED"]);
 assert.deepEqual(split("US$176–185, historical conditional bands retained / NOT RATED"),
   ["US$176–185, historical conditional bands retained","NOT RATED"]);
});
test("matching range cards use distinct semantic colors without inventing recommendations",()=>{
 const css=readFileSync(new URL("../assets/style.css",import.meta.url),"utf8");
 assert.match(css,/\.range-value\.good\{color:#66dcaa\}/);
 assert.match(css,/\.range-value\.warn\{color:#ffc377\}/);
 assert.match(css,/\.range-value\.bad\{color:#ff8a95\}/);
 assert.match(css,/\.range-value\.neutral\{color:#d2e0ee/);
 assert(css.includes(".score-pair"));
 assert(css.includes(".score-box"));
});
