import test from "node:test";
import assert from "node:assert/strict";
import {loadInvestigateDataset,applyInvestigateDataset} from "../lib/investigate-dataset.mjs";
import {loadEthicalDataset,applyEthicalDataset} from "../lib/ethical-dataset.mjs";
import fs from "node:fs";
const source=loadInvestigateDataset(),rizq=loadEthicalDataset();
const stock=(ticker,company,exchange="NASDAQ")=>({ticker,company,exchange});
test("User-uploaded July 2025 Investigate source has 255 distinct company listings and four independent flags",()=>{
 assert.equal(source.data.source_kind,"user_supplied_snapshot");
 assert.equal(source.data.source_period,"2025-07");
 assert.equal(source.data.rows.length,255);
 assert.equal(source.data.counts.divestment_shortlist,103);
 assert.equal(source.data.counts.prisons,56);
 assert.equal(source.data.counts.occupations,187);
 assert.equal(source.data.counts.borders,61);
 assert.equal(new Set(source.data.rows.map(x=>x.ticker+"|"+x.exchange)).size,255);
});
test("Exact US issuer and exchange matched to the source URL without conflating BDS",()=>{
 const v=applyInvestigateDataset(stock("NVDA","NVIDIA Corporation"),source);
 assert.equal(v.investigateListed,true);
 assert.equal(v.investigateSourceUrl,"https://investigate.info/company/nvidia");
 assert(v.investigateCategories.includes("Occupations"));
 assert.equal(Object.hasOwn(v,"ethicalBdsListed"),false);
 const z=applyInvestigateDataset(applyEthicalDataset(stock("NVDA","NVIDIA Corporation"),rizq),source);
 assert.equal(z.ethicalStatus,"BDS_LISTED");
 assert.equal(z.investigateListed,true);
 assert.equal(z.ethicalSourceUrl,"https://www.rizqinvests.com/halal/stock/NVDA?view=both");
 assert.equal(z.investigateSourceUrl,"https://investigate.info/company/nvidia");
});
test("SIX and Paris source exchange aliases match only the correct local listed company",()=>{
 const abb=applyInvestigateDataset(stock("ABBN.SIX","ABB Ltd","OTHER"),source);
 assert.equal(abb.investigateSourceUrl,"https://investigate.info/company/abb");
 const air=applyInvestigateDataset(stock("AIR.PA","Airbus SE","OTHER"),source);
 assert.equal(air.investigateSourceUrl,"https://investigate.info/company/airbus");
});
test("No evidence is imputed across issuer/exchange collisions or absent records",()=>{
 for(const input of [stock("NVDA","An unrelated NVIDIA licensee","NASDAQ"),
   stock("NVDA","NVIDIA Corporation","ASX"),stock("MISSING","Missing Company"),
   stock("MU","Micron Technology, Inc.")]){
  const x=applyInvestigateDataset(input,source);
  assert.equal(x.investigateListed,false);
  assert.equal(x.investigateSourceUrl,null);
 }
});
test("Western Union source points to GEO Group and is never presented as issuer evidence",()=>{
 const record=source.data.rows.find(x=>x.ticker==="WU");
 assert(record.source_url.includes("geo-group"));
 assert(record.source_link_warning);
 const v=applyInvestigateDataset(stock("WU","The Western Union Co","NYSE"),source);
 assert.equal(v.investigateListed,true);
 assert.equal(v.investigateSourceUrl,null);
 assert.match(v.investigateSourceLinkWarning,/GEO Group/);
});
test("The ethical page offers two independent filterable tables and the new website script is bundled",()=>{
 const base=new URL("../",import.meta.url);
 const html=fs.readFileSync(new URL("ethical-database/index.html",base),"utf8");
 const js=fs.readFileSync(new URL("assets/investigate-db.js",base),"utf8");
 const build=fs.readFileSync(new URL("build.mjs",base),"utf8");
 assert(html.includes('id="investigate"'));
 assert(html.includes('id="database"'));
 assert(html.includes("/assets/investigate-db.js"));
 assert(html.includes('id="investigateSearch"'));
 assert(html.includes('id="investigateRows"'));
 assert(build.includes("investigate-ethical-concerns-2025-07.json"));
 assert(build.includes("investigate-db.js"));
 assert(js.includes('fetch("/data/investigate-ethical-concerns-2025-07.json"'));
 assert(js.includes("r.source_link_warning"));
});
