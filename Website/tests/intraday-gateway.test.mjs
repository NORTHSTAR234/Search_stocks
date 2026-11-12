import test from "node:test";
import assert from "node:assert/strict";
import {validateIntradayResearchPayload} from "../lib/intraday-gateway.mjs";
import {onRequestGet} from "../functions/api/intraday-research.js";

const now=Date.parse("2026-11-12T04:00:00Z");
const data=()=>({status:"RESEARCH_ONLY",asOf:"2026-11-12T03:59:00Z",
  feed:"IEX",validated:false,execution:"RESEARCH_ONLY_NOT_EXECUTABLE",
  signals:[{ticker:"MU",newsCoverage:"SAMPLED",riskHeadlines:[],
    marketData:{feed:"IEX",currency:"USD",lagMinutes:1},
    assessment:{signal:"WAIT",validated:false,execution:"RESEARCH_ONLY_NOT_EXECUTABLE",
      reasonCodes:["NO_NEW_BREAKOUT"]}}]});
test("Private worker research reply has a strict, non-executable contract",()=>{
  assert.equal(validateIntradayResearchPayload(data(),["MU"],now),true);
  assert.equal(validateIntradayResearchPayload({...data(),validated:true},["MU"],now),false);
  assert.equal(validateIntradayResearchPayload({...data(),execution:"LIVE_ORDER"},["MU"],now),false);
  const r=data();r.signals[0].assessment.execution="LIVE_ORDER";
  assert.equal(validateIntradayResearchPayload(r,["MU"],now),false);
});
test("Rejects stale RPC status and ghost/extra ticker rows",()=>{
  assert.equal(validateIntradayResearchPayload({...data(),asOf:"2026-11-10T03:59:00Z"},["MU"],now),false);
  assert.equal(validateIntradayResearchPayload(data(),["NVDA"],now),false);
  const r=data();r.signals.push(r.signals[0]);
  assert.equal(validateIntradayResearchPayload(r,["MU","NVDA"],now),false);
});
test("Rejects malformed signal enums and missing data provenance",()=>{
  const r=data();r.signals[0].assessment.signal="BUY_NOW";
  assert.equal(validateIntradayResearchPayload(r,["MU"],now),false);
  const q=data();q.signals[0].marketData.feed="UNVERIFIED";
  assert.equal(validateIntradayResearchPayload(q,["MU"],now),false);
});
test("All intraday research API requests without owner Access proof fail 403",async()=>{
  const response=await onRequestGet({
    request:new Request("https://private.example/api/intraday-research?symbols=MU"),
    env:{INTRADAY_RESEARCH_ENABLED:"read_only"}});
  assert.equal(response.status,403);
  assert.equal((await response.json()).status,"NOT_AUTHORIZED");
  assert.equal(response.headers.get("cache-control"),"private, no-store");
});
