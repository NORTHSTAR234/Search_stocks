import test from "node:test";
import assert from "node:assert/strict";
import {scoreProspectivePaper} from "../scripts/score-paper-journal.mjs";
const t0=Date.parse("2026-11-11T14:30:00Z");
function session(){
 return Array.from({length:78},(_,i)=>{
  const at=new Date(t0+i*300000).toISOString();
  const o=i===6?100.7:i===7?101.05:i>7?101.1:100;
  const c=i===6?101:i===7?101.1:i>7?101.1:100;
  return {t:at,o,c,h:Math.max(o,c)+0.2,l:Math.min(o,c)-0.2,v:100,vw:(o+c)/2};
 });
}
function record(overrides={}){
 const ts=new Date(t0+7*300000).toISOString();
 return {schema:"paper-research-v1",ticker:"MU",feed:"IEX",
  asOf:ts,recordedAt:ts,
  researchSignal:"BUY_CANDIDATE",signalId:"MU|2026-11-11|10:00|UP",
  paperOnly:true,unvalidated:true,...overrides};
}
test("Scoring only a prior genuinely journaled BUY with full future IEX bars",()=>{
 const out=scoreProspectivePaper([record()],{MU:session()});
 assert.equal(out.recordedObservations,1);
 assert.equal(out.paperTradeCount,1);
 assert.equal(out.rows[0].paperStatus,"PAPER_FILLED");
 assert.equal(out.researchOnly,true);
 assert.equal(out.autoExecution,false);
 assert(out.rows[0].netReturnPct<out.rows[0].netReturnPct+1);
});
test("Never fabricate next candle opening fill if observation was recorded after it opened",()=>{
 const p=record({recordedAt:new Date(t0+7*300000+2000).toISOString()});
 const out=scoreProspectivePaper([p],{MU:session()});
 assert.equal(out.paperTradeCount,0);
 assert.equal(out.rows[0].reason,"NEXT_BAR_ALREADY_OPEN_AT_RECORDING");
});
test("No trade for after-hours or reported risk status, even when IEX dataset provided",()=>{
 const obs=[record({researchSignal:"MARKET_CLOSED",signalId:null}),
   record({researchSignal:"RISK_ALERT",ticker:"NVDA",signalId:null})];
 const v=scoreProspectivePaper(obs,{MU:session(),NVDA:session()});
 assert.equal(v.paperTradeCount,0);
 assert.equal(v.notPaperTradeCount,2);
 assert(v.rows.every(x=>x.reason==="NOT_A_PROSPECTIVE_BUY"));
});
test("Missing, gapped, unverified, or non-breakout data cannot produce paper profit",()=>{
 const broken=session();broken.splice(14,1);
 const scenarios=[
  [record(),{MU:broken}],
  [record(),{MU:[]}],
  [record({recordedAt:new Date(t0).toISOString()}),{MU:session()}],
  [record({signalId:"MU|2026-11-11|09:55|UP"}),{MU:session()}],
  [record({unvalidated:false}),{MU:session()}]
 ];
 for(const [j,b] of scenarios){
  const v=scoreProspectivePaper([j],b);
  assert.equal(v.paperTradeCount,0);
  assert.equal(v.rows[0].paperStatus,"UNSCORED");
 }
});
test("Identical journal entries are only scored once",()=>{
 const v=scoreProspectivePaper([record(),record()],{MU:session()});
 assert.equal(v.recordedObservations,1);
});
