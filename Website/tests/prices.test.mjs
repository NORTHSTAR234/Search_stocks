import test from "node:test";
import assert from "node:assert/strict";
import { onRequestGet } from "../functions/api/prices.js";

test("price gateway fails closed when private binding is unavailable",async()=>{
  const response=await onRequestGet({request:new Request("https://owner.example/api/prices?symbols=AAPL"),env:{}});
  assert.equal(response.status,503);
  const data=await response.json();assert.equal(data.error,"PRICE_INTEGRATION_NOT_CONFIGURED");
});
test("price gateway denies nonauthenticated callers despite service binding",async()=>{
  const env={PRICE_PROVIDER:{fetch:()=>{throw Error("should not execute")}},ACCESS_TEAM_DOMAIN:"team.cloudflareaccess.com",ACCESS_AUD:"test-aud",OWNER_EMAIL:"owner@example.com"};
  const response=await onRequestGet({request:new Request("https://owner.example/api/prices?symbols=AAPL"),env});
  assert.equal(response.status,403);
});

test("retired international gateway does not call upstream or consume quota",async()=>{
 const {onRequestGet}=await import("../functions/api/international-prices.js");
 const unauth=new Request("https://owner.example/api/international-prices?symbols=ORG");
 const env={INTERNATIONAL_PRICE_PROVIDER:{fetch:()=>{throw Error("EODHD must never be called")}},
  ACCESS_TEAM_DOMAIN:"team.cloudflareaccess.com",ACCESS_AUD:"aud",OWNER_EMAIL:"owner@example.com"};
 const response=await onRequestGet({request:unauth,env});
 assert.equal(response.status,403);
 const code=await import("node:fs/promises").then(fs=>fs.readFile(new URL("../functions/api/international-prices.js",import.meta.url),"utf8"));
 assert(!code.includes("INTERNATIONAL_PRICE_PROVIDER.fetch"));
 assert(!code.includes("eodhd.com"));
 assert(code.includes('status:410'));
});

test("US price gateway validates independent consolidated close and overnight feed",async()=>{
 const {validateQuote}=await import("../functions/api/prices.js");
 const now=Date.parse("2026-11-09T05:45:00Z");
 const raw={price:187.62,asOf:"2026-11-06T21:57:39Z",currency:"USD",
  feed:"IEX",session:"latest_trade",sessionScope:"extended",adjustment:"raw",
  regularClose:{price:186.64,asOf:"2026-11-06T05:00:00Z",sessionDate:"2026-11-06",
    feed:"DELAYED_SIP",label:"completed_regular_session_close"},
  overnight:{price:178.57,asOf:"2026-11-09T05:29:45Z",feed:"OVERNIGHT",label:"indicative_delayed_15m",delayMinutes:15}
 };
 const q=validateQuote("NVDA",raw,now);
 assert.equal(q.price,187.62);
 assert.equal(q.regularClose.price,186.64);
 assert.equal(q.overnight.price,178.57);
 assert.equal(q.overnightChangeAmount,-8.07);
 assert.equal(q.overnightChangePercent,-4.324);
 assert.equal(q.change24hPercent,null);
});
test("spoofed stale, reversed and wrong-feed overnight comparisons are rejected",async()=>{
 const {validateQuote}=await import("../functions/api/prices.js");
 const now=Date.parse("2026-11-09T05:45:00Z");
 const base={price:187.62,asOf:"2026-11-06T21:57:39Z",currency:"USD",
  feed:"IEX",session:"latest_trade",sessionScope:"extended",adjustment:"raw",
  regularClose:{price:186.64,asOf:"2026-11-06T05:00:00Z",sessionDate:"2026-11-06",feed:"DELAYED_SIP",label:"completed_regular_session_close"},
  overnight:{price:178.57,asOf:"2026-11-09T05:29:45Z",feed:"OVERNIGHT",label:"indicative_delayed_15m",delayMinutes:15}};
 assert.equal(validateQuote("NVDA",{...base,overnight:{...base.overnight,feed:"IEX"}},now).overnight,null);
 assert.equal(validateQuote("NVDA",{...base,overnight:{...base.overnight,asOf:"2026-11-05T05:29:45Z"}},now).overnight,null);
 assert.equal(validateQuote("NVDA",{...base,overnight:{...base.overnight,price:0}},now).overnight,null);
 assert.equal(validateQuote("NVDA",{...base,regularClose:{...base.regularClose,feed:"IEX"}},now).regularClose,null);
});

test("regular session change uses actual previous close, never overnight base",async()=>{
 const {validateQuote}=await import("../functions/api/prices.js");
 const q=validateQuote("MA",{price:652.87,asOf:"2026-11-06T20:59:59Z",currency:"USD",feed:"IEX",
   session:"latest_trade",sessionScope:"extended",adjustment:"raw",
   regularClose:{price:652.70,asOf:"2026-11-06T05:00:00Z",sessionDate:"2026-11-06",
     feed:"DELAYED_SIP",label:"completed_regular_session_close",previousClose:655.92}
 },Date.parse("2026-11-09T05:45:00Z"));
 assert.equal(q.regularClose.price,652.7);
 assert.equal(q.regularClose.previousClose,655.92);
 assert.equal(q.regularClose.regularChangeAmount,-3.22);
 assert(Math.abs(q.regularClose.regularChangePercent+0.491)<0.001);
});
