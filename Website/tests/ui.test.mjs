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
 assert(source.includes("const result=musaffaVisual(r);"));
 assert(source.includes("musaffa-cell status-only-cell"));
 assert(!source.includes("Screening only · no current investment rating"),"Verbose badge note must stay hidden");
});

test("investment quality and entry timing have equal, independent color-coded score boxes",()=>{
 assert(source.includes("function scoreCell(r)"));
 assert(source.includes("'<td class=\"markers-cell\">'+markersCell(r,context)+'</td>'"));
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
 assert(source.includes('reportRangeCard("Stop-loss",initial,"bad")'));
 assert(source.includes('reportRangeCard("No chase",noChase,"warn")'));
 assert(source.includes("zoneCell(r,context)+"));
 assert(source.includes("stopsCell(r)+"));
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
 "Company / ticker","Regular / latest price","Overnight / vs close","Live chart · 1M",
 "Action / Risk","Markers","Last report (AEDT/AEST)",
 "Musaffa status / grade / screening date","AAOIFI","Ethical / BDS","Next earnings / confirmation"]);
 assert.equal(headings.length,11);
 assert(!source.includes('Original GitHub</a>'));
 assert(source.includes("'<td class=\"markers-cell\">'+markersCell(r,context)+'</td>'"));
 assert(source.includes("zoneCell(r,context)+"));
 assert(source.includes("stopsCell(r)+"));
 assert(source.includes('colspan="11"'));
 assert(source.includes("class=\"ticker'+active+'\" href="));
});
test("entry caps use preferred-first inclusive thresholds and Action/Risk ignores above ceilings",()=>{
 const sourcePosition=source.match(/function zonePosition\(price,bands\)\{([\s\S]*?)\n  \}/);
 const sourceInsight=source.match(/function zoneInsight\(context\)\{([\s\S]*?)\n  \}/);
 assert(sourcePosition&&sourceInsight);
 const zone=new Function("price","bands",sourcePosition[1]);
 const insight=new Function("context","escape",sourceInsight[1]);
 const bands=[[4000,4200],[4250,4350]];
 for(const p of [1,3990,4000,4200])assert.equal(zone(p,bands).kind,"preferred",p);
 for(const p of [4200.01,4225,4250,4350])assert.equal(zone(p,bands).kind,"acceptable",p);
 for(const p of [4350.01,5000])assert.equal(zone(p,bands).kind,"above",p);
 assert.equal(zone(-1,bands),null);
 assert.equal(zone(0,bands),null);
 assert.equal(zone(180,[]),null);
 assert.equal(zone(180,[[200,100],[176,185]]).kind,"acceptable");
 assert.equal(zone(160,[[165,175],[176,185]]).kind,"preferred");
 assert.equal(zone(175.5,[[165,175],[176,185]]).kind,"acceptable");
 assert.equal(zone(198,[[185,195],null]).kind,"above");
 const above={regular:{label:"Regular",position:{kind:"above",text:"above both entry ceilings",distance:null}}};
 assert.equal(insight(above,String),"","above both should have no alert anywhere");
 assert.equal(insight(null,String),"");
 assert(source.includes("const selected=context?.overnight||context?.regular"));
 assert(source.includes("zone-hit-preferred")&&source.includes("zone-hit-acceptable"));
 assert(!source.includes("zone-below")&&!source.includes("zone-between")&&!source.includes("zone-above"));
 const css=readFileSync(new URL("../assets/style.css",import.meta.url),"utf8");
 assert(css.includes(".table-wrap .range-box.zone-hit-preferred"));
 assert(css.includes(".table-wrap .range-box.zone-hit-acceptable"));
 assert(!css.includes(".table-wrap .range-box.zone-below"));
 assert(!css.includes(".table-wrap .range-box.zone-between"));
 assert(!css.includes(".table-wrap .range-box.zone-above"));
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
 assert(source.includes("non-US delayed Yahoo hourly month charts checked every 5 minutes while visible from private caches"));
});

test("AAOIFI dashboard column uses separate green red yellow semantics",()=>{
 assert(source.includes("function aaoifiVisual(r)"));
 assert(source.includes("function aaoifiCell(r)"));
 assert(source.includes('status==="AAOIFI-COMPLIANT"'));
 assert(source.includes('status==="AAOIFI-NON-COMPLIANT"'));
 assert(source.includes('status==="SHARIAH REVIEW REQUIRED"'));
 assert(source.includes("'<td>'+aaoifiCell(r)+'</td>'"));
});

test("dashboard restores 11-column table with one page scrollbar and only table horizontal panning",()=>{
 const css=readFileSync(new URL("../assets/style.css",import.meta.url),"utf8");
 const section=css.slice(css.indexOf("ORIGINAL FULL-WIDTH STOCK TABLE WITH CONTAINED HORIZONTAL OVERFLOW"),
   css.indexOf("/* FLUID VIEWPORT WIDTH"));
 assert(section.length>1800,"Original table layout override must exist");
 assert.match(section,/\.table-wrap\s*\{[^}]*max-height:none!important;[^}]*overflow-x:auto!important;[^}]*overflow-y:hidden!important;/);
 assert.match(section,/\.panel\s*\{[^}]*max-width:100%;[^}]*overflow:hidden;/);
 assert.match(section,/\.table-wrap table\s*\{[^}]*display:table;[^}]*width:100%!important;/);
 assert.match(section,/\.table-wrap thead\s*\{[^}]*display:table-header-group;/);
 assert.match(section,/\.table-wrap tbody\s*\{display:table-row-group\}/);
 assert.match(section,/\.table-wrap tr\s*\{display:table-row\}/);
 assert.match(section,/\.table-wrap th,[\s\S]*?display:table-cell;/);
 assert.match(section,/min-width:0!important;/);
 assert(!/grid-template-columns|display:grid|display:none!important[^}]*thead/.test(section),
   "The stock table must never be turned into cards or hide its headers");
 assert(section.includes("overflow-y:hidden!important;"),
   "The table must never create an additional vertical scrollbar");
 assert(section.includes("overflow-x:auto!important;"),
   "Wide table must pan independently rather than shift the entire page");
});
test("vertical separators match horizontal row borders at every viewport width",()=>{
 const css=readFileSync(new URL("../assets/style.css",import.meta.url),"utf8");
 const table=css.slice(css.indexOf("ORIGINAL FULL-WIDTH STOCK TABLE WITH CONTAINED HORIZONTAL OVERFLOW"),
   css.indexOf("/* FLUID VIEWPORT WIDTH"));
 const header=table.match(/\.table-wrap th\s*\{([\s\S]*?)\}/)?.[1]||"";
 const cells=table.match(/\.table-wrap td\s*\{([\s\S]*?)\}/)?.[1]||"";
 for(const rule of [header,cells]){
   assert(rule.includes("border-bottom:1px solid #27394d;"));
   assert(rule.includes("border-right:1px solid #27394d;"));
 }
 assert(table.includes("th:first-child,\n.table-wrap td:first-child {border-left:1px solid #27394d}"));
 assert(table.includes(".table-wrap th:last-child,\n.table-wrap td:last-child {border-right:0}"));
 assert(table.includes("min-width:1840px!important;"));
 assert(!table.includes("min-width:1400px!important;"));
 assert(!table.includes("min-width:1350px!important;"));
 assert(table.includes("overflow-wrap:break-word;"));
 assert(table.includes("word-break:normal;"));
 assert(!table.includes("overflow-wrap:anywhere;"));
 assert(table.includes("overflow-y:hidden!important;"),
   "Keep page-level vertical scrolling");
 assert(table.includes("overflow-x:auto!important;"),
   "Use only horizontal overflow for 11 columns on narrow windows");
});
test("table headings and first column no longer cover rows when page scrolls",()=>{
 const css=readFileSync(new URL("../assets/style.css",import.meta.url),"utf8");
 const table=css.slice(css.indexOf("ORIGINAL FULL-WIDTH STOCK TABLE WITH CONTAINED HORIZONTAL OVERFLOW"),
   css.indexOf("/* FLUID VIEWPORT WIDTH"));
 assert.match(table,/\.table-wrap th\{[^}]*position:static;[^}]*top:auto;[^}]*z-index:auto;/);
 assert.match(table,/\.table-wrap th:first-child \{position:static;left:auto;top:auto;z-index:auto;/);
 assert.match(table,/\.table-wrap td:first-child \{position:static;left:auto;top:auto;z-index:auto;/);
 assert(!table.includes("position:sticky"),"Header or first column must not overlay scrolled data");
 assert(table.includes("border-right:1px solid #27394d;"),
  "Keep the equally weighted vertical separators");
 assert(table.includes("border-bottom:1px solid #27394d;"),
  "Keep the row separators");
});
test("all eleven stock headings are visible in the restored table",()=>{
 const css=readFileSync(new URL("../assets/style.css",import.meta.url),"utf8");
 const section=css.slice(css.indexOf("ORIGINAL FULL-WIDTH STOCK TABLE WITH CONTAINED HORIZONTAL OVERFLOW"),
   css.indexOf("/* FLUID VIEWPORT WIDTH"));
 const build=readFileSync(new URL("../build.mjs",import.meta.url),"utf8");
 const headings=JSON.parse(build.split("\n").find(l=>l.includes("const labels=")).split("const labels=")[1].trim().replace(/;$/, ""));
 assert.equal(headings.length,11);
 assert(section.includes("display:table-header-group"));
 assert(section.includes("td::before {content:none!important;display:none!important}"));
 for(let i=1;i<=headings.length;i++)
   assert(section.includes(".table-wrap th:nth-child("+i+")"),
     "Missing proportional column width for heading "+i);
 assert(section.includes("td[colspan]"));
});

test("narrow screens cannot horizontally shift the website header or filters",()=>{
 const css=readFileSync(new URL("../assets/style.css",import.meta.url),"utf8");
 const table=css.slice(css.indexOf("ORIGINAL FULL-WIDTH STOCK TABLE WITH CONTAINED HORIZONTAL OVERFLOW"),
   css.indexOf("/* FLUID VIEWPORT WIDTH"));
 const fluid=css.slice(css.indexOf("/* FLUID VIEWPORT WIDTH"));
 assert(table.includes("max-width:100%;"));
 assert(table.includes("overflow-x:auto!important;"));
 assert(table.includes("min-width:1840px!important;"));
 assert(fluid.includes("html,body{max-width:100%;overflow-x:hidden}"));
 assert(fluid.includes("main:not(.report-layout)>.panel .toolbar,"));
 assert(fluid.includes("main:not(.report-layout)>.panel .notice,"));
 assert(fluid.includes("main:not(.report-layout)>.panel .table-footer{"));
 assert(!table.includes("min-width:2280px!important;"));
 assert(!table.includes("overflow:visible!important;"));
});
test("dashboard fills available window width without creating a second scrollbar",()=>{
 const css=readFileSync(new URL("../assets/style.css",import.meta.url),"utf8");
 const fluid=css.slice(css.indexOf("/* FLUID VIEWPORT WIDTH"));
 assert(fluid.length>500,"Fluid width stylesheet must exist");
 assert.match(fluid,/main:not\(\.report-layout\)\s*\{[^}]*width:100%;[^}]*max-width:none;/);
 assert.match(fluid,/main:not\(\.report-layout\)>\.panel/);
 assert.match(fluid,/\.top\s*\{[^}]*padding-left:clamp\(/);
 assert(!fluid.includes("grid-template-columns"),"No card layout on wide screens");
 assert.match(fluid,/@media\(max-width:560px\)/);
 assert(!/max-height\s*:\s*70vh/.test(fluid));
 assert(!/overflow\s*:\s*(?:auto|scroll)/.test(fluid));
 assert(fluid.includes("report-layout"),
   "Report pages must preserve their readable width independently");
});

test("RizqInvests ethical/BDS column colors neutral green, flags red, unknown yellow",()=>{
 const build=readFileSync(new URL("../build.mjs",import.meta.url),"utf8");
 assert(build.includes('"Ethical / BDS"'));
 assert(source.includes("function ethicalVisual(r,now=new Date())"));
 assert(source.includes("'<td>'+ethicalCell(r)+'</td>'"));
 const m=source.match(/function ethicalVisual\(r,now=new Date\(\)\)\{([\s\S]*?)\n  \}/);
 assert(m);
 const rate=new Function("r","now",m[1]);
 const evidence={ethicalSourceUrl:"https://www.rizqinvests.com/ethical",ethicalAssessmentDate:"2026-11-12"};
 const now=new Date("2026-11-13T01:00:00Z");
 assert.equal(rate({...evidence,ethicalStatus:"NEUTRAL",ethicalBdsListed:false},now).tone,"good");
 assert.equal(rate({...evidence,ethicalStatus:"ETHICAL",ethicalBdsListed:false},now).tone,"good");
 assert.equal(rate({...evidence,ethicalStatus:"NEUTRAL",ethicalBdsListed:true},now).tone,"bad");
 assert.equal(rate({...evidence,ethicalStatus:"UNETHICAL",ethicalBdsListed:false},now).tone,"bad");
 assert.equal(rate({...evidence,ethicalStatus:"NEUTRAL",ethicalBdsListed:null},now).tone,"good");
 assert.equal(rate({ethicalStatus:"NEUTRAL",ethicalBdsListed:false},now).tone,"warn");
 assert.equal(rate({...evidence,ethicalAssessmentDate:"2026-03-01",ethicalStatus:"NEUTRAL",ethicalBdsListed:false},now).tone,"warn");
});

test("RizqInvests source-backed Neutral remains green with BDS unknown and provider date unpublished",()=>{
 const m=source.match(/function ethicalVisual\(r,now=new Date\(\)\)\{([\s\S]*?)\n  \}/);
 assert(m);
 const classify=new Function("r","now",m[1]);
 const now=new Date("2026-11-13T02:00:00Z");
 const evidence={ethicalStatus:"NEUTRAL",ethicalBdsListed:null,
   ethicalAssessmentDate:null,ethicalCheckedAt:"2026-11-13T00:55:00Z",
   ethicalSourceUrl:"https://www.rizqinvests.com/ethical"};
 assert.equal(classify(evidence,now).tone,"good");
 assert.equal(classify({...evidence,ethicalBdsListed:true},now).tone,"bad");
 assert.equal(classify({...evidence,ethicalStatus:"UNVERIFIED"},now).tone,"warn");
 assert.equal(classify({...evidence,ethicalSourceUrl:null},now).tone,"warn");
 assert.equal(classify({...evidence,ethicalCheckedAt:"2026-03-01T00:00:00Z"},now).tone,"warn");
});

test("AMD RizqInvests Neutral explicitly maps to provider-only BDS not flagged",()=>{
 const fs=readFileSync(new URL("../../AAOIFI/AMD.NASDAQ.html",import.meta.url),"utf8");
 const block=fs.split('id="aaoifi-report-snapshot">')[1]?.split('</script>')[0];
 assert(block,"AMD source must retain machine-readable snapshot");
 const obj=JSON.parse(block);
 assert.equal(obj.ethical.status,"NEUTRAL");
 assert.equal(obj.ethical.bds_listed,false);
 assert.equal(obj.ethical.bds_scope,"RIZQINVESTS_TABLE_2026_11");
 assert.equal(obj.status,"SHARIAH REVIEW REQUIRED");
 assert(source.includes("function ethicalCell(r)"));
});

test("AAOIFI keeps the classified badge and linked full report without inline financial commentary",()=>{
 assert(source.includes("function aaoifiCell(r)"));
 assert(source.includes("aaoifiReportPath"));
 const block=source.split("  function aaoifiCell(r){")[1].split("  // Independent ethical/BDS screening")[0];
 assert(!block.includes("<small"),"Do not render financial and tradability writeups");
 const build=readFileSync(new URL("../build.mjs",import.meta.url),"utf8");
 const headings=JSON.parse(build.split("\n").find(l=>l.includes("const labels=")).split("const labels=")[1].trim().replace(/;$/, ""));
 assert.equal(headings.length,11);
});

test("one-month IEX chart is sourced, responsive and polled with every quote cycle",()=>{
  assert(source.includes("function monthChartCell(r)"));
  assert(source.includes("state.history={...state.history,...month};"));
  assert(source.includes('"/api/price-history?symbols="'));
  assert(source.includes("monthChartCell(r)"));
  assert(source.includes('IEX closes'));
   assert(source.includes('Yahoo 1h · delayed'));
   assert(source.includes('YFINANCE_YAHOO_1H_BAR_DELAYED'));
   assert(source.includes('hourly?.currency===q.currency'));
   assert(source.includes('new RegExp("\\\\b"+currency+"\\\\b","i")'));
  assert(source.includes('colspan="11"'));
  const css=readFileSync(new URL("../assets/style.css",import.meta.url),"utf8");
  assert(css.includes(".mini-chart-svg"));
  assert(css.includes(".mini-chart-legend"));
});

test("Markers remains 3 paired rows with all six existing values and behaviors",()=>{
 const start=source.indexOf("function markersCell(r,context){");
 const end=source.indexOf("\n  function tr(r){",start);
 assert(start>=0&&end>start);
 const body=source.slice(start,end);
 const scores=body.indexOf("scoreCell(r)+"),entries=body.indexOf("zoneCell(r,context)+"),exits=body.indexOf("stopsCell(r)+");
 assert(scores>=0&&entries>scores&&exits>entries);
 assert(source.includes('reportRangeCard("Stop-loss",initial,"bad")'));
 assert(source.includes('reportRangeCard("No chase",noChase,"warn")'));
 assert(source.includes('highlightedCard("Preferred",preferred,"good","preferred")'));
 assert(source.includes('highlightedCard("Acceptable",acceptable,"warn","acceptable")'));
 assert(source.includes("zone-hit-preferred")&&source.includes("zone-hit-acceptable"));
 assert(source.includes("range-live-tags"));
 const css=readFileSync(new URL("../assets/style.css",import.meta.url),"utf8");
 assert(css.includes(".table-wrap .markers-stack>.score-pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))"));
 assert(css.includes(".table-wrap .markers-stack .score-label"));
});

test("all three screening status columns display only badges and compact source links",()=>{
 const block=(start,end)=>source.split("  function "+start+"(r){")[1]?.split(end)[0];
 const musaffa=block("screeningCell","  function aaoifiVisual(r){");
 const aa=block("aaoifiCell","  // Independent ethical/BDS screening");
 const ethical=block("ethicalCell","  // One calendar month");
 for(const item of [musaffa,aa,ethical]){
   assert(item&&item.includes("status-only-cell"));
   assert(!item.includes("<small"),"Status cells must not show multiline prose");
 }
 assert(musaffa.includes("musaffaVisual(r)"),"Musaffa classification stays independent");
 assert(aa.includes("aaoifiVisual(r)"),"AAOIFI classification stays independent");
 assert(aa.includes("aaoifiReportPath"),"AAOIFI report link remains accessible");
 assert(ethical.includes("ethicalVisual(r)"),"Ethical/BDS classification stays independent");
 assert(ethical.includes("ethicalSourceUrl"),"RizqInvests provider URL remains accessible");
 assert(ethical.includes("ethical-source-link"),"Compact provider link remains accessible");
 assert(source.includes("markersCell(r,context)"),"Six buy/stop score boxes remain unchanged");
 const css=readFileSync(new URL("../assets/style.css",import.meta.url),"utf8");
 assert(css.includes(".table-wrap .status-only-cell"));
});

test("non-US chart draws actual hourly bars only for an exact verified source/currency and preserves IEX",()=>{
  const start=source.indexOf("function monthChartCell(r){");
  const end=source.indexOf("function markersCell(r,context)",start);
  assert(start>=0&&end>start);
  const section=source.slice(start,end);
  assert(section.includes('q?.feed==="YFINANCE_YAHOO_5M_BAR_DELAYED"'));
  assert(section.includes('hourly?.feed==="YFINANCE_YAHOO_1H_BAR_DELAYED"'));
  assert(section.includes('hourly?.sourceSymbol===q.sourceSymbol'));
  assert(section.includes('hourly?.exchange===q.exchange'));
  assert(section.includes('hourly?.currency===q.currency'));
  assert(section.includes('Number(b?.[0])*1000'));
  assert(section.includes('new RegExp('));
  assert(section.includes('Latest Yahoo · delayed'));
  assert(section.includes('Waiting for verified delayed Yahoo hourly bars'));
  assert(section.includes('Actual Alpaca IEX 1-month daily raw closes'));
  assert(!source.includes("query1.finance.yahoo.com")&&!source.includes("query2.finance.yahoo.com"));
});


test("all exchanges share exactly one green/amber highlight or none",()=>{
 const mZone=source.match(/function zonePosition\(price,bands\)\{([\s\S]*?)\n  \}/);
 const mContext=source.match(/function zoneContext\(r\)\{([\s\S]*?)\n  \}/);
 const mCell=source.match(/function zoneCell\(r,context\)\{([\s\S]*?)\n  \}/);
 assert(mZone&&mContext&&mCell);
 const pos=new Function("price","bands",mZone[1]);
 const ctx=new Function("r","state","usSessionQuote","zonePosition",mContext[1]);
 const cell=new Function("r","context","splitReportPair","reportRangeCard","escape",mCell[1]);
 const pair=s=>String(s).split(" / ");
 const originalCard=(label,value,tone)=>'<card>'+label+value+tone+'</card>';
 const render=(row,context)=>cell(row,context,pair,originalCard,String);
 const count=(h,label)=>(h.match(new RegExp("zone-hit-"+label+"(?:[^a-z]|$)","g"))||[]).length;
 const date="2026-11-13T08:00:00Z",realNow=Date.now;
 const cases=[
  ["2383.TWSE","TWSE","TWSE","TWD",4225,[[4000,4200],[4250,4350]],"acceptable"],
  ["2383.TWSE","TWSE","TWSE","TWD",4200,[[4000,4200],[4250,4350]],"preferred"],
  ["2383.TWSE","TWSE","TWSE","TWD",4350,[[4000,4200],[4250,4350]],"acceptable"],
  ["2383.TWSE","TWSE","TWSE","TWD",4350.01,[[4000,4200],[4250,4350]],"none"],
  ["2377.TWSE","TWSE","TWSE","TWD",137.5,[[126,133],[134,141]],"acceptable"],
  ["CBHB.MYX","BURSA","MYX","MYR",.68,[[.7,.74],[.75,.78]],"preferred"],
  ["CBHB.MYX","BURSA","MYX","MYR",.745,[[.7,.74],[.75,.78]],"acceptable"],
  ["APA.ASX","ASX","ASX","AUD",11.1,[[9.6,9.95],[9.96,10.3]],"none"],
  ["SU.PA","XPAR","XPAR","EUR",225,[[220,228],[229,236]],"preferred"]
 ];
 try{
  Date.now=()=>Date.parse(date)+60000;
  for(const [ticker,exchange,sourceEx,currency,price,bands,expected] of cases){
   const row={ticker,exchange,nativeCurrency:currency,zoneBands:bands,
     zones:bands.map(b=>b.join("–")).join(" / "),statusOnly:false};
   const state={quotes:{[ticker]:{price,currency,exchange:sourceEx,
     sourceSymbol:"VERIFIED.LOCAL",feed:"YFINANCE_YAHOO_5M_BAR_DELAYED",asOf:date}},
     markets:{aliases:{BURSA:"MYX"}}};
   const c=ctx(row,state,()=>null,pos);
   assert(c,"Missing context "+ticker);
   const html=render(row,c),a=count(html,"preferred"),b=count(html,"acceptable");
   assert.equal(a+b,expected==="none"?0:1,ticker+" one state only");
   assert.equal(a,expected==="preferred"?1:0,ticker+" preferred");
   assert.equal(b,expected==="acceptable"?1:0,ticker+" acceptable");
   assert.equal(ctx({...row,nativeCurrency:"USD"},state,()=>null,pos),null,"wrong currency");
   assert.equal(ctx({...row,statusOnly:true},state,()=>null,pos),null,"screen-only");
   state.quotes[ticker].exchange="OTHER";
   assert.equal(ctx(row,state,()=>null,pos),null,"wrong exchange");
   state.quotes[ticker].exchange=sourceEx;
   state.quotes[ticker].asOf="2026-10-01T00:00:00Z";
   assert.equal(ctx(row,state,()=>null,pos),null,"stale");
  }
  const row={ticker:"NVDA",exchange:"US",nativeCurrency:"USD",statusOnly:false,
    zoneBands:[[155,165],[166,175]],zones:"US$155–165 / US$166–175"};
  const state={quotes:{NVDA:{feed:"IEX",currency:"USD",price:160,asOf:date}}};
  const u=ctx(row,state,()=>({open:true,fresh:true}),pos);
  assert.equal(count(render(row,u),"preferred"),1,"US IEX retains green");
  assert.equal(count(render(row,u),"acceptable"),0,"US IEX no duplicate");
  const both={regular:{label:"Regular",position:pos(170,row.zoneBands)},
    overnight:{label:"Overnight",position:pos(160,row.zoneBands)}};
  assert.equal(count(render(row,both),"preferred"),1,"new overnight preferred");
  assert.equal(count(render(row,both),"acceptable"),0,"older regular not also lit");
  state.quotes.NVDA.price=176;
  const above=ctx(row,state,()=>({open:true,fresh:true}),pos);
  assert.equal(count(render(row,above),"preferred")+count(render(row,above),"acceptable"),0);
 }finally{Date.now=realNow;}
});
