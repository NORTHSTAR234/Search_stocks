import test from "node:test";
import assert from "node:assert/strict";
import {onRequestGet,validateSeries} from "../functions/api/price-history.js";
const sample={feed:"IEX",currency:"USD",adjustment:"raw",timeframe:"1Day",bars:[{date:"2026-11-10",asOf:"2026-11-10T05:00:00Z",close:187.25},{date:"2026-11-11",asOf:"2026-11-11T05:00:00Z",close:190.5}]};
test("one-month IEX daily bars reject invalid feed, price, duplicates and missing dates",()=>{
 const now=Date.parse("2026-11-13T00:00:00Z");
 assert.equal(validateSeries(sample,now).bars.length,2);
 assert.equal(validateSeries({...sample,feed:"SIP"},now),null);
 assert.equal(validateSeries({...sample,adjustment:"split"},now),null);
 assert.equal(validateSeries({...sample,bars:[...sample.bars,sample.bars[1]]},now),null);
 assert.equal(validateSeries({...sample,bars:[{...sample.bars[0],close:0}]},now),null);
});
test("historical chart gateway fails closed without owner authentication",async()=>{
 const request=new Request("https://example.test/api/price-history?symbols=NVDA");
 assert.equal((await onRequestGet({request,env:{}})).status,503);
 const env={PRICE_PROVIDER:{fetch:()=>{throw Error("Not authorized")}},ACCESS_TEAM_DOMAIN:"team.cloudflareaccess.com",ACCESS_AUD:"aud",OWNER_EMAIL:"owner@example.com"};
 assert.equal((await onRequestGet({request,env})).status,403);
});
