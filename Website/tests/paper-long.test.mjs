import test from "node:test";
import assert from "node:assert/strict";
import {paperLong,summarizePaperLong,PAPER_DEFAULTS} from "../lib/paper-long.mjs";
const t0=Date.parse("2026-11-11T14:30:00Z");
const c={ticker:"MU",signal:"BUY_CANDIDATE",
  signalId:"MU|2026-11-11|10:00|UP",
  asOf:new Date(t0+7*300000).toISOString(),
  execution:"RESEARCH_ONLY_NOT_EXECUTABLE",validated:false,
  triggerPrice:100.5,invalidationPrice:99.5,
  features:{barStart:new Date(t0+6*300000).toISOString()}};
function fixture({
  nextOpen=100.7,stop=false,target=false,gapStop=false,both=false
}={}){
  const b=Array.from({length:15},(_,i)=>{
    const px=i<6?100:i===6?100.55:i===7?nextOpen:100.8;
    return {t:new Date(t0+i*300000).toISOString(),
      o:px,c:px,h:px+0.2,l:px-0.2};
  });
  if(stop)b[8]={...b[8],l:99.4};
  if(target)b[9]={...b[9],h:104};
  if(both)b[8]={...b[8],l:99.4,h:104};
  if(gapStop)b[9]={...b[9],o:98.9,h:100,l:98.5,c:99};
  return b;
}
test("Uses next completed bar OPEN, never closing signal bar as a fill",()=>{
  const x=paperLong(c,fixture());
  assert.equal(x.status,"PAPER_FILLED");
  assert.equal(x.entryPrice,100.7);
  assert.equal(x.exitReason,"TIME_EXIT");
  assert.equal(x.entryAt,fixture()[7].t);
  assert(x.netReturnPct<x.grossReturnPct);
  assert.equal(x.execution,"PAPER_ONLY_NO_ORDER");
  assert.equal(x.validated,false);
});
test("Rejects non-buy and executable-looking candidates",()=>{
  assert.equal(paperLong({...c,signal:"SELL_RISK"},fixture()).status,"SKIP");
  assert.equal(paperLong({...c,execution:"LIVE_ORDER"},fixture()).status,"SKIP");
  assert.equal(paperLong({...c,validated:true},fixture()).status,"SKIP");
});
test("Never chases a large gap after breakout",()=>{
  const p=paperLong(c,fixture({nextOpen:102}));
  assert.equal(p.status,"SKIP");
  assert.equal(p.reason,"GAP_UP_NO_CHASE");
});
test("Won't fill when next bar opens back below threshold",()=>{
  const p=paperLong(c,fixture({nextOpen:100}));
  assert.equal(p.reason,"OPEN_BACK_BELOW_TRIGGER");
});
test("Stop and target touched same five-minute bar uses conservative stop",()=>{
  const x=paperLong(c,fixture({both:true}));
  assert.equal(x.exitReason,"STOP");
  assert.equal(x.exitPrice,99.5);
  assert(x.netReturnPct<0);
});
test("Gap through stop uses worse available next open, not perfect stop",()=>{
  const x=paperLong(c,fixture({gapStop:true}));
  assert.equal(x.exitReason,"STOP_GAP");
  assert.equal(x.exitPrice,98.9);
});
test("Target exits at target if high touches, no lookahead on entry",()=>{
  const x=paperLong(c,fixture({target:true}));
  assert.equal(x.exitReason,"TARGET");
  assert(x.netReturnPct>0);
});
test("Fails closed on missing/gapped future bars, impossible costs and too-wide stop",()=>{
  assert.equal(paperLong(c,fixture().slice(0,7)).status,"SKIP");
  const b=fixture();b.splice(3,1);
  assert.equal(paperLong(c,b).reason,"INVALID_OR_GAPPED_SESSION");
  assert.equal(paperLong({...c,invalidationPrice:90},fixture()).reason,"RISK_BAND_TOO_WIDE");
  assert.throws(()=>paperLong(c,fixture(),{costBpsPerSide:-1}));
});
test("Accounting separates skipped from simulated filled and does not claim realised profit",()=>{
  const data=[paperLong(c,fixture()),paperLong(c,fixture({both:true})),
    paperLong(c,fixture({nextOpen:105}))];
  const m=summarizePaperLong(data);
  assert.equal(m.signalCount,3);assert.equal(m.filled,2);assert.equal(m.skipped,1);
  assert.equal(m.autoExecution,false);
  assert.match(m.caveat,/no brokerage execution/);
});
test("Cost stress reduces paper returns",()=>{
  const a=paperLong(c,fixture(),{costBpsPerSide:0});
  const b=paperLong(c,fixture(),{costBpsPerSide:30});
  assert(a.netReturnPct>b.netReturnPct);
  assert.equal(PAPER_DEFAULTS.costBpsPerSide,8);
});
