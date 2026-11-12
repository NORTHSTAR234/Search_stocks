import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
import {onRequestGet} from "../functions/api/daily-signals.js";
const snapshot={schemaVersion:1,kind:"DAILY_TECHNICAL_SIGNALS",
 generatedAt:new Date().toISOString(),execution:"RESEARCH_ONLY_NO_ORDERS",
 rows:[{ticker:"AAPL",technicalSignal:"WATCH"}]};
test("Daily endpoint fails closed without private service binding",async()=>{
 const r=await onRequestGet({request:new Request("https://site.test/api/daily-signals"),env:{}});
 assert.equal(r.status,503);
 assert.equal((await r.json()).status,"NOT_CONFIGURED");
});
test("Daily endpoint denies anonymous callers BEFORE private RPC",async()=>{
 let rpc=0;
 const env={DAILY_SIGNALS:{latest:async()=>{rpc++;return snapshot;}},
  ACCESS_TEAM_DOMAIN:"example.cloudflareaccess.com",ACCESS_AUD:"aud",
  OWNER_EMAIL:"owner@example.com"};
 const r=await onRequestGet({request:new Request("https://site.test/api/daily-signals"),env});
 assert.equal(r.status,403);
 assert.equal((await r.json()).status,"NOT_AUTHORIZED");
 assert.equal(rpc,0);
});
test("Owner-only route refuses malformed snapshots and never caches sensitive results",async()=>{
 const text=readFileSync(new URL("../functions/api/daily-signals.js",import.meta.url),"utf8")
  .replace(/^import\s+.*?;\s*$/gm,"")
  .replace("export async function onRequestGet","async function onRequestGet");
 const ctx={authenticatedOwner:async()=>true,Response,URL,Date,JSON,Number,String,Array};
 vm.createContext(ctx);
 const get=vm.runInContext(text+"\nonRequestGet;",ctx);
 const r=await get({request:new Request("https://site.test/api/daily-signals"),env:{
  DAILY_SIGNALS:{latest:async()=>({...snapshot,execution:"BROKER_ORDER"})}}});
 assert.equal(r.status,503);
 assert.equal((await r.json()).status,"INVALID_SNAPSHOT");
 const valid=await get({request:new Request("https://site.test/api/daily-signals"),env:{
  DAILY_SIGNALS:{latest:async()=>snapshot}}});
 assert.equal(valid.status,200);
 assert.equal(valid.headers.get("Cache-Control"),"private, no-store");
 assert.equal((await valid.json()).rows[0].ticker,"AAPL");
});
test("Daily source and browser page contain no execution endpoints",()=>{
 const path=new URL("../worker/daily-signals-worker.mjs",import.meta.url);
 const src=readFileSync(path,"utf8");
 const browser=readFileSync(new URL("../assets/daily-signals.js",import.meta.url),"utf8");
 assert.match(src,/class DailySignalsRead/);
 assert.match(src,/async scheduled/);
 assert.match(src,/fetch\(\)\{return new Response\("Not found",\{status:404\}\)/);
 for(const body of [src,browser]){
  assert.doesNotMatch(body,/\/v2\/orders|submitOrder|createOrder|placeOrder/);
 }
});
