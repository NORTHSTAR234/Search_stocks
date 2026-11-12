import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../worker/intraday-research-preview-workflow.mjs",import.meta.url),"utf8")
 .replace(/^import\s+.*?;\s*$/gm,"")
 .replace("export class IntradayResearchPreviewOnce","class IntradayResearchPreviewOnce")
 .replace("export default {","const __default = {");
function Harness(response,opts={}){
 const ctx={WorkflowEntrypoint:class {},Date,Response,Number,Set,String};vm.createContext(ctx);
 const {Workflow,publicWorker}=vm.runInContext(source+
   ";({Workflow:IntradayResearchPreviewOnce,publicWorker:__default});",ctx);
 const inst=new Workflow(),written=[],requests=[];
 inst.env={
  PRIVATE_RESEARCH_PREVIEW:{async snapshot(s){requests.push([...s]);return response;}},
  ...(opts.noKV?{}:{PAPER_JOURNAL:{async put(k,v,o){written.push({key:k,body:JSON.parse(v),ttl:o.expirationTtl});}}})
 };
 const step={async do(name,settings,fn){
   assert.equal(name,"private-research-and-journal");
   assert.equal(settings.retries.limit,0);
   return fn();
 }};
 const run=(symbols=["MU"])=>inst.run({payload:{purpose:"private_intraday_preview_20261112",symbols}},step);
 return {run,inst,step,written,requests,publicWorker};
}
const asOf=new Date().toISOString();
function good(){
 return {status:"RESEARCH_ONLY",validated:false,execution:"RESEARCH_ONLY_NOT_EXECUTABLE",
  asOf,feed:"IEX",sourceStatus:"BARS_AND_NEWS",
  signals:[{ticker:"MU",assessment:{
     signal:"BUY_CANDIDATE",validated:false,execution:"RESEARCH_ONLY_NOT_EXECUTABLE",
     reasonCodes:["NEW_UPSIDE_BREAKOUT"],
     signalId:"MU|2026-11-12|10:00|UP",
     triggerPrice:100.5,invalidationPrice:99.5,
     features:{price:101,relativeVolume:2}
   },marketData:{feed:"IEX",observationAsOf:asOf,priorCompleteSessions:5},
   newsCoverage:"SAMPLED",riskHeadlines:[{headline:"unverified headline",
      riskCode:"LEADERSHIP_DISRUPTION",url:"https://example.org/secret"}]}]};
}
test("Private Workflow returns sanitized research and writes private journal, never a trade",async()=>{
 const h=Harness(good());const result=await h.run();
 assert.equal(result.status,"PRIVATE_RESEARCH_PREVIEW");
 assert.equal(result.journaled,1);assert.equal(result.signals[0].researchSignal,"BUY_CANDIDATE");
 assert.equal(result.signals[0].paperOnly,true);
 assert.equal(h.written.length,1);
 assert.equal(h.written[0].ttl,90*86400);
 assert.equal(h.written[0].body.signalId,"MU|2026-11-12|10:00|UP");
 assert.deepEqual(h.requests,[["MU"]]);
 const all=JSON.stringify({...result,journal:h.written});
 for(const word of ["triggerPrice","invalidationPrice","unverified headline","example.org","relativeVolume"]){
   assert.equal(all.includes(word),false,word);
 }
 assert.equal((await h.publicWorker.fetch(new Request("https://localhost/"))).status,404);
});
test("API-scoped purpose and allowed tickers fail closed without fetching data",async()=>{
 const h=Harness(good());
 const bad=await h.inst.run({payload:{purpose:"random",symbols:["MU"]}},h.step);
 assert.equal(bad.status,"INVALID_PREVIEW_REQUEST");
 assert.equal((await h.run(["TSLA"])).status,"INVALID_PREVIEW_REQUEST");
 assert.equal((await h.run(["MU","MU"])).status,"INVALID_PREVIEW_REQUEST");
 assert.equal((await h.run(["MU","NVDA","AMD"])).status,"INVALID_PREVIEW_REQUEST");
 assert.equal(h.requests.length,0);
});
test("Unarmed or failed provider never produces a journal record",async()=>{
 const statuses=["NOT_ACTIVE","DATA_UNAVAILABLE",null];
 for(const state of statuses){
  const h=Harness(state?{status:state}:null);
  const r=await h.run();
  assert.equal(r.status,state||"DATA_UNAVAILABLE");
  assert.equal(h.written.length,0);
 }
});
test("An inconsistent payload or a missing KV fails closed",async()=>{
 const payload=good();payload.signals[0].assessment.validated=true;
 const h=Harness(payload);
 assert.equal((await h.run()).status,"NO_VALID_RESEARCH_DATA");
 assert.equal(h.written.length,0);
 const without=Harness(good(),{noKV:true});
 assert.equal((await without.run()).status,"JOURNAL_NOT_CONFIGURED");
});
test("Risk reports preserve risk codes but strip any headlines",async()=>{
 const p=good();
 p.signals[0].assessment.signal="RISK_ALERT";
 p.signals[0].assessment.reasonCodes=["RECENT_MATERIAL_NEGATIVE_NEWS"];
 p.signals[0].assessment.signalId=null;
 p.signals[0].marketData.observationAsOf=null;
 const h=Harness(p);
 const result=await h.run();
 assert.equal(result.status,"PRIVATE_RESEARCH_PREVIEW");
 assert.deepEqual(result.signals[0].materialReportedRiskCodes,["LEADERSHIP_DISRUPTION"]);
 assert.equal(result.signals[0].observedBarAt,null);
 assert.equal(JSON.stringify(result).includes("unverified headline"),false);
});
