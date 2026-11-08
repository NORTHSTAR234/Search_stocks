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
