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
  assert.equal(yahooSymbol({ticker:"ORG.ASX",exchange:"ASX"}),"ORG.AX");
  assert.equal(yahooSymbol({ticker:"APA.AX",exchange:"ASX"}),"APA.AX");
  assert.equal(yahooSymbol({ticker:"2330.TW",exchange:"TWSE"}),"2330.TW");
  assert.equal(yahooSymbol({ticker:"1519.TW",exchange:"TWSE"}),"1519.TW");
  assert.equal(yahooSymbol({ticker:"1519.TWSE",exchange:"TWSE"}),"1519.TW");
  assert.equal(yahooSymbol({ticker:"CBHB",exchange:"BURSA"}),null);
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
  assert.match(source,/setInterval\(\(\)=>\{if\(document\.visibilityState==="visible"\)render\(\);\},60000\)/);
  assert.match(source,/checked every 5 minutes while visible/);
});

test("US Alpaca refresh remains five minutes; owner-only delayed non-US cache is separate",()=>{
 assert(source.includes('retrieve("/api/prices",us,"Alpaca")'));
 assert(source.includes('retrieve("/api/international-prices",international,"Personal Yahoo cache")'));
 assert(!source.includes('eodhdSymbols=new Set('));
 assert(source.includes('state.quotes={...usQuotes,...intlQuotes};'));
 assert(source.includes("Non-US quotes are collected on GitHub Actions every 20 minutes"));
 assert(source.includes('function yahooSymbol(r)'));
 assert(source.includes("IEX 24h"));
 assert.match(source,/setInterval\(\(\)=>\{if\(document\.visibilityState==="visible"\)checkAll\(\);\},300000\)/);
});

test("GitHub reports and Alpaca US prices refresh together every five minutes",()=>{
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
test("international quote links remain when the owner cache has no quote",()=>{
 assert(source.includes('View on Yahoo Finance (delayed)'));
 assert(source.includes('No cached international quote'));
 assert(source.includes('retrieve("/api/international-prices",international,"Personal Yahoo cache")'));
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
 assert(source.includes('function zoneCell(r,context)'));
 assert(source.includes('score-pair range-pair'));
 assert(source.includes('score-box range-box'));
 assert(source.includes('highlightedCard("Preferred",preferred,"good","preferred")'));
 assert(source.includes('highlightedCard("Acceptable",acceptable,"warn","acceptable")'));
 assert(source.includes('reportRangeCard("Initial stop",initial,"bad")'));
 assert(source.includes('reportRangeCard("No chase",noChase,"warn")'));
 assert(source.includes("'<td>'+zoneCell(r,context)+'</td>'"));
 assert(source.includes("'<td>'+stopsCell(r)+'</td>'"));
 assert(source.includes('zone-hit-preferred'));
 assert(source.includes('zone-hit-acceptable'));
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

test("dashboard columns match specified new order and remove duplicate report column",()=>{
 const build=readFileSync(new URL("../build.mjs",import.meta.url),"utf8");
 const list=build.match(/const labels=(\[[^\n]+\]);/);
 assert(list);
 const headings=JSON.parse(list[1]);
 assert.deepEqual(headings,[
 "Company / ticker","Regular / latest price","Overnight / vs close",
 "Action / Risk","Investment / Entry","Last report (AEDT/AEST)",
 "Preferred / acceptable buy zone","Initial stop / no_chase",
 "Musaffa status / grade / screening date","AAOIFI","Next earnings / confirmation"]);
 assert.equal(headings.length,11);
 assert(!source.includes('Original GitHub</a>'));
 assert(source.includes("'<td>'+scoreCell(r)+'</td>'"));
 assert(source.includes("'<td>'+zoneCell(r,context)+'</td>'"));
 assert(source.includes("'<td>'+stopsCell(r)+'</td>'"));
 assert(source.includes('colspan="11"'));
 assert(source.includes("class=\"ticker'+active+'\" href="));
});
test("a preferred or acceptable match lights only its own buy-zone card",()=>{
 assert(source.includes('function zonePosition(price,bands)'));
 assert(source.includes('function zoneContext(r)'));
 assert(source.includes('function zoneInsight(context)'));
 assert(source.includes('zone-hit-preferred'));
 assert(source.includes('zone-hit-acceptable'));
 assert(source.includes("const matches=hits(kind)"));
 assert(source.includes("regular:regular?.position?regular:null"));
 assert(source.includes("overnight:night?.position?night:null"));
 const css=readFileSync(new URL("../assets/style.css",import.meta.url),"utf8");
 assert(css.includes('.table-wrap .range-box.zone-hit-preferred'));
 assert(css.includes('.table-wrap .range-box.zone-hit-acceptable'));
 assert(css.includes('.range-hit-chip'));
});
test("price-zone relationships are mutually exclusive, boundary aware and never use mismatched bands",()=>{
 const match=source.match(/function zonePosition\(price,bands\)\{([\s\S]*?)\n  \}/);
 assert(match);
 const compare=new Function("price","bands",match[1]);
 const bands=[[165,175],[176,185]];
 assert.equal(compare(170,bands).kind,"preferred");
 assert.equal(compare(178,bands).kind,"acceptable");
 assert.equal(compare(165,bands).kind,"preferred");
 assert.equal(compare(185,bands).kind,"acceptable");
 assert.equal(compare(175.5,bands).text,"between preferred and acceptable zones");
 assert.equal(compare(160,bands).text,"below preferred buy zone");
 const above=compare(187.62,bands);
 assert.equal(above.kind,"above");
 assert(above.text.includes("above acceptable buy zone"));
 assert(!above.text.includes("preferred"));
 assert.equal(compare(185.5,bands).kind,"above");
 assert.equal(compare(-50,bands),null);
 assert.equal(compare(180,[]),null);
 assert.equal(compare(180,[[200,100],[176,185]]).kind,"acceptable");
 assert.equal(compare(300,[[185,195],[196,205]]).text,"above acceptable buy zone");
});
test("entry context describes only the correct relation for regular and overnight prices",()=>{
 const body=source.match(/function zoneInsight\(context\)\{([\s\S]*?)\n  \}/);
 assert(body);
 const insight=new Function("context","escape",body[1]);
 const esc=x=>String(x).replace(/[&<>"']/g,"");
 const same={regular:{label:"Regular",position:{kind:"above",text:"above acceptable buy zone",distance:8.8}},
  overnight:{label:"Overnight",position:{kind:"above",text:"above acceptable buy zone",distance:9.1}}};
 const combined=insight(same,esc);
 assert(combined.includes("Regular and overnight: above acceptable buy zone"));
 assert(combined.includes("regular 8.8%; overnight 9.1%"));
 assert(!combined.includes("above preferred"));
 const mixed=insight({regular:{label:"Regular",position:{kind:"preferred",text:"inside preferred buy zone",distance:null}},
   overnight:{label:"Overnight",position:{kind:"acceptable",text:"inside acceptable buy zone",distance:null}}},esc);
 assert(mixed.includes("Regular: inside preferred buy zone"));
 assert(mixed.includes("Overnight: inside acceptable buy zone"));
 assert.equal(insight(null,esc),"");
});

test("market-open glow follows Sydney-rendered exchange weekdays without market price inference",()=>{
  assert(source.includes("function marketStatus(r,now=new Date())"));
  assert(source.includes('timeZone:"Australia/Sydney"'));
  assert(source.includes("zonedSessionTime(local,v.start,m.timeZone)"));
  assert(source.includes("class=\"ticker'+active+'\" href="));
  assert(source.includes("setInterval(()=>{if(document.visibilityState===\"visible\")render();},60000)"));
});

test("older international ticker suffixes are normalized before quote lookup and market-hours display",()=>{
  const block=source.match(/function normalizeListing\(row\)\s*\{([\s\S]*?)\n  \}/);
  assert(block,"Expected listing normalization function");
  const normalizeListing=new Function("row",block[1]);
  for(const [ticker,expected] of [["2330.TWSE","TWSE"],["2379.TWSE","TWSE"],
    ["ORG.ASX","ASX"],["APA.ASX","ASX"],["CBHB.MYX","BURSA"]])
    assert.equal(normalizeListing({ticker,exchange:"OTHER"}).exchange,expected,ticker);
  assert.equal(normalizeListing({ticker:"AAPL",exchange:"US"}).exchange,"US");
  assert(source.includes('data.rows.map(normalizeListing)'));
  assert(source.includes('map.set(ticker,normalizeListing(r))'));
});

test("new international exchanges appear as filter options without a site code change",()=>{
  assert(source.includes("function syncExchangeFilters()"));
  assert(source.includes("state.rows.map(r=>String(r.exchange"));
  assert(source.includes("option.textContent=exchange"));
  assert(source.includes("syncExchangeFilters();"));
  assert(source.includes('currency==="EUR"?"€"'));
});

test("a deleted HTML report disappears from an already-open dashboard",()=>{
 assert(source.includes("const incomingHtml=new Set("));
 assert(source.includes('if(row.sourceFormat==="html"&&!incomingHtml.has(ticker))'));
 assert(source.includes("map.delete(ticker);"));
 assert(source.includes("delete state.quotes[ticker];"));
});

test("Musaffa badges use verified date + exact classification, not archive folder or investment action",()=>{
  const block=source.match(/function musaffaVisual\(r,now=new Date\(\)\)\{([\s\S]*?)\n  \}/);
  assert(block,"independent Musaffa classifier must be present");
  const classify=new Function("r","now",block[1]);
  const now=new Date("2026-11-11T11:00:00Z");
  const base={bucket:"nonhalal",action:"BUY",musaffaGate:"PASS"};
  assert.deepEqual(classify({...base,musaffaClassification:"HALAL",musaffaScreeningDate:"2026-10-04"},now),
    {tone:"good",label:"VERIFIED HALAL"});
  assert.deepEqual(classify({...base,musaffaClassification:"NOT HALAL",musaffaScreeningDate:"2026-09-01",musaffaGate:"FAIL"},now),
    {tone:"bad",label:"VERIFIED NON-COMPLIANT"});
  assert.deepEqual(classify({...base,musaffaClassification:"HALAL",musaffaScreeningDate:"2026-03-01"},now),
    {tone:"warn",label:"INCONCLUSIVE"});
  assert.deepEqual(classify({...base,musaffaClassification:"HALAL",musaffa:"HALAL · PASS"},now),
    {tone:"warn",label:"INCONCLUSIVE"});
  assert.deepEqual(classify({...base,musaffaClassification:"HALAL",musaffaScreeningPeriod:"2026-10"},now),
    {tone:"good",label:"VERIFIED HALAL"});
  assert.deepEqual(classify({...base,musaffaClassification:"HALAL",musaffaScreeningPeriod:"2026-07"},now),
    {tone:"warn",label:"INCONCLUSIVE"});
  assert.match(source,/screeningCell\(r\)/);
});

test("SU.PA month-only Musaffa screen is green when recent, amber when stale or conflicting",()=>{
  const found=source.match(/function musaffaVisual\(r,now=new Date\(\)\)\{([\s\S]*?)\n  \}/);
  assert(found,"independent Musaffa classifier must remain present");
  const classify=new Function("r","now",found[1]);
  const screen={ticker:"SU.PA",bucket:"halal",musaffaClassification:"HALAL",
    musaffaGate:"PASS",musaffaScreeningDate:null,musaffaScreeningPeriod:"2026-10",
    musaffaScreeningMonthConflict:false};
  assert.deepEqual(classify(screen,new Date("2026-11-11T12:00:00Z")),
    {tone:"good",label:"VERIFIED HALAL"});
  assert.deepEqual(classify(screen,new Date("2027-03-11T12:00:00Z")),
    {tone:"warn",label:"INCONCLUSIVE"});
  assert.deepEqual(classify({...screen,musaffaScreeningPeriod:"2026-07"},new Date("2026-11-11T12:00:00Z")),
    {tone:"warn",label:"INCONCLUSIVE"});
  assert.deepEqual(classify({...screen,musaffaScreeningMonthConflict:true},new Date("2026-11-11T12:00:00Z")),
    {tone:"warn",label:"INCONCLUSIVE"});
  assert.deepEqual(classify({...screen,musaffaAssessment:"INCONCLUSIVE"},new Date("2026-11-11T12:00:00Z")),
    {tone:"warn",label:"INCONCLUSIVE"});
  assert.deepEqual(classify({...screen,musaffaScreeningPeriod:null},new Date("2026-11-11T12:00:00Z")),
    {tone:"warn",label:"INCONCLUSIVE"});
});


test("US regular session promotes fresh IEX observed trade ahead of old SIP close",()=>{
 const match=source.match(/function usSessionQuote\(r,q,now=new Date\(\)\)\{([\s\S]*?)\n  \}/);
 assert(match,"US quote presentation helper must be independently testable");
 const classify=new Function("r","q","now","marketStatus","marketParts",match[1]);
 const parts=(date,zone)=>{
   const p=new Intl.DateTimeFormat("en-GB",{timeZone:zone,year:"numeric",month:"2-digit",
     day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(date);
   return Object.fromEntries(p.filter(x=>x.type!=="literal").map(x=>[x.type,Number(x.value)]));
 };
 const marketStatus=()=>({open:true});
 const now=new Date("2026-11-11T19:42:00Z"); // 12 Nov 06:42 AEDT / NY 14:42
 const q={feed:"IEX",price:175.41,asOf:"2026-11-11T19:40:00Z",
   regularClose:{price:168.89,sessionDate:"2026-11-10"}};
 const active=classify({ticker:"NVDA",exchange:"US"},q,now,marketStatus,parts);
 assert.equal(active.open,true);
 assert.equal(active.fresh,true);
 assert.equal(active.ageMinutes,2);
 assert.equal(active.comparison.amount,6.52);
 assert(Math.abs(active.comparison.percent-3.861)<0.01);
 const stale=classify({ticker:"NVDA",exchange:"US"},
   {...q,asOf:"2026-11-10T20:45:00Z"},now,marketStatus,parts);
 assert.equal(stale.fresh,false);
 const oldClose=classify({ticker:"NVDA",exchange:"US"},
   {...q,regularClose:{price:160.1,sessionDate:"2026-10-15"}},now,marketStatus,parts);
 assert.equal(oldClose.comparison,null);
 const post=classify({ticker:"NVDA",exchange:"US"},q,now,()=>({open:false}),parts);
 assert.equal(post.open,false);
});
test("active-session columns show IEX first and hide old pre-market indications",()=>{
 assert(source.includes("Latest observed IEX trade · current US session"));
 assert(source.includes("Last IEX observation · not recent"));
 assert(source.includes("Previous regular close (delayed SIP): "));
 assert(source.includes("Current IEX vs previous regular close"));
 assert(source.includes("Current-session IEX comparison unavailable"));
 assert(source.includes("90*60000"));
 assert(source.includes("session.fresh?{label:\"Latest IEX\",price:Number(q.price)}"));
 assert(source.includes("US Alpaca IEX latest trades checked every 5 minutes while visible"));
});

test("AAOIFI dashboard column uses separate green red yellow semantics",()=>{
 assert(source.includes("function aaoifiVisual(r)"));
 assert(source.includes("function aaoifiCell(r)"));
 assert(source.includes('status==="AAOIFI-COMPLIANT"'));
 assert(source.includes('status==="AAOIFI-NON-COMPLIANT"'));
 assert(source.includes('status==="SHARIAH REVIEW REQUIRED"'));
 assert(source.includes("'<td>'+aaoifiCell(r)+'</td>'"));
});
