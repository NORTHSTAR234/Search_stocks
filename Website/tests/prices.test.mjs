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
