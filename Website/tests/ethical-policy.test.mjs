import test from "node:test";
import assert from "node:assert/strict";
import {loadEthicalDataset,applyEthicalDataset} from "../lib/ethical-dataset.mjs";
import {loadInvestigateDataset,applyInvestigateDataset} from "../lib/investigate-dataset.mjs";
import {applyCombinedEthicalScreening} from "../lib/ethical-policy.mjs";
import fs from "node:fs";
const rizq=loadEthicalDataset(), investigate=loadInvestigateDataset();
const stock=(ticker,company,exchange="NASDAQ")=>({ticker,company,exchange});
const resolve=r=>applyCombinedEthicalScreening(applyInvestigateDataset(applyEthicalDataset(r,rizq),investigate));
test("First source BDS is decisive, even if Investigate also lists the company",()=>{
 const r=resolve(stock("NVDA","NVIDIA Corporation"));
 assert.equal(r.ethicalFinalStatus,"BDS_LISTED");
 assert.equal(r.ethicalFinalSource,"RIZQINVESTS");
 assert.equal(r.ethicalFinalColor,"RED");
 assert.equal(r.ethicalFinalBdsListed,true);
 assert.equal(r.ethicalFinalSourceUrl,"https://www.rizqinvests.com/halal/stock/NVDA?view=both");
 assert.equal(r.investigateListed,true);
});
test("First source Unethical is decisive even without an Investigate match",()=>{
 const r=resolve(stock("AAPL","Apple Inc."));
 assert.equal(r.ethicalFinalStatus,"UNETHICAL");
 assert.equal(r.ethicalFinalSource,"RIZQINVESTS");
 assert.equal(r.ethicalFinalColor,"RED");
 assert.equal(r.ethicalFinalBdsListed,false);
});
test("Second source overrides Rizq Neutral to final Unethical and retains original evidence",()=>{
 const r=resolve(stock("CFG","Citizens Financial Group, Inc.","NYSE"));
 assert.equal(r.ethicalStatus,"NEUTRAL");
 assert.equal(r.ethicalProviderLabel,"Neutral");
 assert.equal(r.ethicalFinalStatus,"UNETHICAL");
 assert.equal(r.ethicalFinalSource,"INVESTIGATE");
 assert.equal(r.ethicalFinalColor,"RED");
 assert.equal(r.ethicalFinalBdsListed,false);
 assert.equal(r.ethicalFinalSourceUrl,"https://investigate.info/company/citizens-financial-group");
 assert.equal(r.ethicalSourceUrl,"https://www.rizqinvests.com/halal/stock/CFG?view=both");
 assert.deepEqual(r.investigateCategories,["Divestment shortlist","Prisons","Borders"]);
 assert.match(r.ethicalFinalReason,/not independently established wrongdoing/);
});
test("Green Neutral requires BOTH Rizq Neutral AND no exact Investigate company",()=>{
 const r=resolve(stock("MU","Micron Technology, Inc."));
 assert.equal(r.ethicalFinalStatus,"NEUTRAL");
 assert.equal(r.ethicalFinalColor,"GREEN");
 assert.equal(r.ethicalFinalSource,"RIZQINVESTS");
 assert.equal(r.investigateListed,false);
});
test("Wrong issuer or market cannot trigger Investigate or Rizq provider matches",()=>{
 const fox=resolve(stock("FOX","Fox Corporation","NASDAQ"));
 assert.equal(fox.ethicalStatus,"NEUTRAL");
 assert.equal(fox.investigateListed,false);
 assert.equal(fox.ethicalFinalStatus,"NEUTRAL");
 const wrong=resolve(stock("NVDA","An unrelated company","ASX"));
 assert.equal(wrong.ethicalFinalStatus,"UNVERIFIED");
 assert.equal(wrong.ethicalFinalColor,"NONE");
});
test("Investigate-only match is red but cannot fabricate Rizq neutral or official BDS",()=>{
 const r=resolve(stock("ABBN.SIX","ABB Ltd","OTHER"));
 assert.equal(r.ethicalStatus,"UNVERIFIED");
 assert.equal(r.ethicalFinalStatus,"UNETHICAL");
 assert.equal(r.ethicalFinalSource,"INVESTIGATE");
 assert.equal(r.ethicalFinalBdsListed,false);
 assert.equal(r.ethicalFinalSourceUrl,"https://investigate.info/company/abb");
});
test("Source link defect remains a red source concern with no invented URL",()=>{
 const r=resolve(stock("WU","The Western Union Co","NYSE"));
 assert.equal(r.investigateListed,true);
 assert.equal(r.investigateSourceUrl,null);
 assert.equal(r.ethicalFinalStatus,"UNETHICAL");
 assert.equal(r.ethicalFinalSource,"INVESTIGATE");
 assert.equal(r.ethicalFinalSourceUrl,null);
});
test("Both frozen source sets remain unchanged and 19 Rizq Neutral US companies have Investigate concerns",()=>{
 const matches=rizq.data.rows.filter(x=>x.ethical_label==="Neutral"&&x.bds_badge===false)
   .filter(x=>resolve(stock(x.ticker,x.company)).ethicalFinalSource==="INVESTIGATE");
 assert.equal(matches.length,19);
 assert.equal(rizq.data.rows.length,491);
 assert.equal(investigate.data.rows.length,255);
});
test("Dashboard UI and database browser use the same first-source precedence",()=>{
 const base=new URL("../",import.meta.url);
 const ui=fs.readFileSync(new URL("assets/app.js",base),"utf8");
 const page=fs.readFileSync(new URL("assets/ethical-db.js",base),"utf8");
 const html=fs.readFileSync(new URL("ethical-database/index.html",base),"utf8");
 const build=fs.readFileSync(new URL("build.mjs",base),"utf8");
 const index=fs.readFileSync(new URL("scripts/build-live-reports.mjs",base),"utf8");
 assert(ui.indexOf("if(rizqRed)")<ui.indexOf("if(invMatched)"));
 assert(ui.indexOf("if(invMatched)")<ui.indexOf("if(rizqGreen)"));
 assert(page.indexOf('if(r.bds_badge===true)')<page.indexOf("const hit=investigateMatch(r)"));
 assert(html.includes('id="final"'));
 assert(html.includes('id="combinedOverlapCount"'));
 assert(build.includes("applyCombinedEthicalScreening("));
 assert(index.includes("applyCombinedEthicalScreening("));
});
