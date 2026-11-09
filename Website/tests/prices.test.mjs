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

test("international gateway denies missing binding and unsigned requests",async()=>{
 const {onRequestGet}=await import("../functions/api/international-prices.js");
 const unauth=new Request("https://owner.example/api/international-prices?symbols=ORG");
 const disabled=await onRequestGet({request:unauth,env:{}});
 assert.equal(disabled.status,503);
 const protectedEnv={INTERNATIONAL_PRICE_PROVIDER:{fetch:()=>{throw Error("should not fetch")}},
 ACCESS_TEAM_DOMAIN:"team.cloudflareaccess.com",ACCESS_AUD:"aud",OWNER_EMAIL:"owner@example.com"};
 assert.equal((await onRequestGet({request:unauth,env:protectedEnv})).status,403);
});
test("international quote validation keeps exact listing currencies and separate previous-close percentage",async()=>{
 const {validateInternationalQuote}=await import("../functions/api/international-prices.js");
 const asOf=new Date(Date.now()-22*60000).toISOString();
 const org=validateInternationalQuote("ORG",{price:12.115,currency:"AUD",asOf,providerSymbol:"ORG.AU",exchange:"ASX",
   feed:"EODHD",session:"delayed",previousClose:12.12,previousCloseChangePercent:-0.0413,change24hPercent:null});
 assert.equal(org.currency,"AUD");assert.equal(org.change24hPercent,null);
 assert(Math.abs(org.previousCloseChangePercent+0.0413)<0.001);
 assert.equal(validateInternationalQuote("ORG",{...org,providerSymbol:"ORG.US"}),null);
 assert.equal(validateInternationalQuote("CBHB",{...org,providerSymbol:"0339.KLSE",currency:"MYR",exchange:"BURSA",price:0}),null);
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
