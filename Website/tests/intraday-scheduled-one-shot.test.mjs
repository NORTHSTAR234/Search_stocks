import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";

const source=readFileSync(new URL("../worker/intraday-research-provider.mjs",import.meta.url),"utf8")
  .replace(/^import\s+.*?;\s*$/gm,"")
  .replace("export class IntradayResearchProvider","class IntradayResearchProvider")
  .replace("export default {","const __workerDefault={");
function load(probe){
 const ctx={WorkerEntrypoint:class {},runIntradayCredentialProbe:probe,
    Date,Intl,Response,URL,AbortSignal};
 vm.createContext(ctx);
 return vm.runInContext(source+";__workerDefault;",ctx);
}
const env=()=>({
 INTRADAY_RESEARCH_ENABLED:"disabled",
 INTRADAY_DIAGNOSTIC_MODE:"armed_20261112",
 PROBE_RESULTS:{
  store:new Map(),
  async get(k){return this.store.get(k)||null;},
  async put(k,v){this.store.set(k,v);}
 }
});
test("One-shot cron never calls credentials if feature mode is absent or changed",async()=>{
 let invoked=0;const worker=load(async()=>{invoked++;return {overall:"PASS"};});
 const disabled=env();disabled.INTRADAY_DIAGNOSTIC_MODE="disarmed";
 await worker.scheduled({},disabled);
 const wrong=env();wrong.INTRADAY_RESEARCH_ENABLED="read_only";
 await worker.scheduled({},wrong);
 assert.equal(invoked,0);
 assert.equal(disabled.PROBE_RESULTS.store.size,0);
 assert.equal(wrong.PROBE_RESULTS.store.size,0);
});
test("Private scheduled probe persists sanitized output once and never places orders",async()=>{
 let count=0;const worker=load(async()=>{count++;return {
  overall:"PASS",kind:"INTRADAY_READONLY_CREDENTIAL_SMOKE_V1",
  bars:{ok:true,items:2},news:{ok:true,items:3}
 };});
 const settings=env();
 await worker.scheduled({},settings);
 await worker.scheduled({},settings);
 assert.equal(count,1);
 const saved=JSON.parse(settings.PROBE_RESULTS.store.get("intraday-smoke-20261112"));
 assert.equal(saved.status,"COMPLETE");
 assert.equal(saved.overall,"PASS");
 assert.equal(saved.bars.items,2);
 assert.equal(saved.news.items,3);
});
test("Unbound storage refuses invocation and no public fetch route exists",async()=>{
 let calls=0;const worker=load(async()=>{calls++;});
 await worker.scheduled({},{
  INTRADAY_RESEARCH_ENABLED:"disabled",INTRADAY_DIAGNOSTIC_MODE:"armed_20261112"});
 assert.equal(calls,0);
 const http=await worker.fetch(new Request("https://localhost/private"));
 assert.equal(http.status,404);
});
