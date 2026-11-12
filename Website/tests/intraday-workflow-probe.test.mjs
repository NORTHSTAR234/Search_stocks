import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../worker/intraday-workflow-probe.mjs",import.meta.url),"utf8")
  .replace(/^import\s+.*?;\s*$/gm,"")
  .replace("export class AlpacaConnectivityOnce","class AlpacaConnectivityOnce")
  .replace("export default {","const __default={");
function provider(){
 const context={WorkflowEntrypoint:class {},Response,Number,String};
 vm.createContext(context);
 return vm.runInContext(source+";({Workflow:AlpacaConnectivityOnce,publicWorker:__default});",context);
}
test("Only a private Workflow binding can run a one-shot, read-only diagnostic",async()=>{
 const {Workflow,publicWorker}=provider();
 let n=0;
 const worker=new Workflow();
 worker.env={PRIVATE_ALPACA_PROBE:{async smoke(){n++;return {
  overall:"PASS",observedAt:"2026-11-12T06:00:00Z",
  bars:{ok:true,code:"OK",items:23,firstTimestamp:"2026-11-11T20:00:00Z",
    lastTimestamp:"2026-11-11T20:55:00Z",rawPrice:120},
  news:{ok:true,code:"OK",items:4,firstTimestamp:"2026-11-11T18:00:00Z",
    lastTimestamp:"2026-11-11T21:00:00Z",headline:"private headline"},
  secret:"private data",accountId:"private account"
 };}}};
 const step={async do(name,settings,fn){assert.equal(name,"authenticated-data-probe");assert.equal(settings.retries.limit,0);return fn();}};
 const denied=await worker.run({payload:{purpose:"OTHER"}},step);
 assert.equal(denied.overall,"INVALID_PURPOSE");assert.equal(n,0);
 const good=await worker.run({payload:{purpose:"read_only_alpaca_smoke_20261112"}},step);
 assert.equal(n,1);assert.equal(good.overall,"PASS");
 assert.equal(good.bars.items,23);assert.equal(good.news.items,4);
 const safe=JSON.stringify(good);
 assert(!safe.includes("private data")&&!safe.includes("private account"));
 assert(!safe.includes("private headline")&&!safe.includes("rawPrice"));
 assert.equal(good.execution,"READ_ONLY_NO_ORDERS");
 assert.equal((await publicWorker.fetch(new Request("https://localhost/"))).status,404);
});
test("Missing or unarmed output remains an INCOMPLETE/NOT_ARMED diagnosis",async()=>{
 const {Workflow}=provider();const worker=new Workflow();
 worker.env={PRIVATE_ALPACA_PROBE:{smoke:async()=>({overall:"NOT_ARMED"})}};
 const step={do:async(name,settings,callback)=>callback()};
 const v=await worker.run({payload:{purpose:"read_only_alpaca_smoke_20261112"}},step);
 assert.equal(v.overall,"NOT_ARMED");assert.equal(v.bars.ok,false);
 assert.equal(v.news.ok,false);
});
