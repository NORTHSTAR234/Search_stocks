import test from "node:test";
import assert from "node:assert/strict";
import {evaluateIntradaySignal,SIGNAL_VERSION} from "../lib/intraday-signals.mjs";

const t0=Date.parse("2026-11-11T14:30:00Z");
const bar=(i,c,v=100)=>({
  t:new Date(t0+i*300000).toISOString(),o:100,h:Math.max(101,c),
  l:Math.min(99,c),c,v,vw:c
});
const base=[100,100.2,99.9,100.3,100,100].map((c,i)=>bar(i,c));
const build=(last=102,vol=100)=>[...base,bar(6,last,vol)];
const history=(vol=50)=>Array.from({length:5},(_,i)=>({
  day:"2026-11-"+String(i+2).padStart(2,"0"),
  feed:"IEX",bars:[...base,bar(6,100.1)].map(b=>({...b,v:vol,
    t:new Date(Date.parse(b.t)-(9-i)*86400000).toISOString()}))
}));
const hist=()=>Array.from({length:5},(_,i)=>{
  const offset=(i+5)*86400000;
  const day=new Date(t0-offset).toISOString().slice(0,10);
  return {day,feed:"IEX",bars:[...base,bar(6,100.1)].map(b=>({
    ...b,v:50,t:new Date(Date.parse(b.t)-offset).toISOString()
  }))};
});
const input=(target=102,{volume=200,sector=102,broad=101}={})=>({
  ticker:"MU",asOf:"2026-11-11T15:05:00Z",feed:"IEX",
  sectorFeed:"IEX",broadFeed:"IEX",
  bars:build(target,volume),
  sectorBars:build(sector),broadBars:build(broad),
  historicalDays:hist()
});
test("version/format never asserts an executable trade",()=>{
  const r=evaluateIntradaySignal(input());
  assert.equal(SIGNAL_VERSION,"1.0.0");
  assert.equal(r.execution,"RESEARCH_ONLY_NOT_EXECUTABLE");
  assert.equal(r.validated,false);
  assert.equal(r.signal,"BUY_CANDIDATE");
  assert.deepEqual(r.reasonCodes,["NEW_UPSIDE_BREAKOUT","VWAP_SUPPORT",
    "RELATIVE_VOLUME_CONFIRMED","SECTOR_AND_MARKET_ALIGNED"]);
  assert.equal(r.triggerPrice,101);
});
test("downside breakout becomes sell risk, never a short-sale order",()=>{
  const r=evaluateIntradaySignal(input(98,{volume:220,sector:98,broad:99}));
  assert.equal(r.signal,"SELL_RISK");
  assert.equal(r.triggerPrice,99);
});
test("zero lookahead: previously unobserved/future news cannot block",()=>{
  const cfg=input();
  cfg.events=[{publishedAt:"2026-11-11T15:10:00Z",direction:"negative",
    severity:"material",verification:"confirmed",sourceUrl:"https://example.org/1"}];
  assert.equal(evaluateIntradaySignal(cfg).signal,"BUY_CANDIDATE");
});
test("verified recent material event overrides technicals, even after hours",()=>{
  const cfg=input();
  cfg.asOf="2026-11-12T01:00:00Z";
  cfg.events=[{publishedAt:"2026-11-11T23:00:00Z",direction:"negative",
    severity:"material",verification:"reported",sourceUrl:"https://example.org/1"}];
  const r=evaluateIntradaySignal(cfg);
  assert.equal(r.signal,"RISK_ALERT");
  assert.equal(r.tradeTrigger,null);
});
test("news without attributable HTTPS source is not promoted",()=>{
  const cfg=input();
  cfg.events=[{publishedAt:"2026-11-11T14:50:00Z",direction:"negative",
    severity:"material",verification:"reported",sourceUrl:"rumour"}];
  assert.equal(evaluateIntradaySignal(cfg).signal,"BUY_CANDIDATE");
});
test("no same-feed prior sessions => NO_DATA, not a buy",()=>{
  const cfg=input();cfg.historicalDays=[];
  assert.equal(evaluateIntradaySignal(cfg).signal,"NO_DATA");
});
test("mismatched benchmark feeds fail closed",()=>{
  const cfg=input();cfg.sectorFeed="SIP";
  assert.equal(evaluateIntradaySignal(cfg).signal,"NO_DATA");
});
test("unconfirmed breakout volume, sector or broad market => WAIT",()=>{
  assert.equal(evaluateIntradaySignal(input(102,{volume:30})).signal,"WAIT");
  assert.equal(evaluateIntradaySignal(input(102,{sector:98})).signal,"WAIT");
  assert.equal(evaluateIntradaySignal(input(102,{broad:99})).signal,"WAIT");
});
test("stale/incomplete candle must not create a signal",()=>{
  const stale=input();stale.asOf="2026-11-11T15:30:00Z";
  assert.equal(evaluateIntradaySignal(stale).signal,"NO_DATA");
  const early=input();early.asOf="2026-11-11T15:01:00Z";
  assert.equal(evaluateIntradaySignal(early).signal,"NO_DATA");
});
test("missing first six opening bars is not inferred",()=>{
  const cfg=input();cfg.bars=cfg.bars.slice(1);
  assert.equal(evaluateIntradaySignal(cfg).signal,"NO_DATA");
});
test("outside regular session cannot issue a buy",()=>{
  const cfg=input();cfg.asOf="2026-11-11T23:00:00Z";
  assert.equal(evaluateIntradaySignal(cfg).signal,"MARKET_CLOSED");
});
test("explicit long position may generate exit and take-profit reviews",()=>{
  const cfg=input(102);cfg.position={side:"long",entryPrice:101,
    stopPrice:99,takeProfitPrice:102};
  assert.equal(evaluateIntradaySignal(cfg).signal,"TAKE_PROFIT_REVIEW");
  cfg.position.stopPrice=102.5;cfg.position.takeProfitPrice=106;
  cfg.position.entryPrice=103;
  assert.equal(evaluateIntradaySignal(cfg).signal,"EXIT_RISK");
});
test("old risk events expire after 48 hours",()=>{
  const cfg=input();
  cfg.events=[{publishedAt:"2026-11-08T15:00:00Z",direction:"negative",
    severity:"material",verification:"confirmed",sourceUrl:"https://example.org/a"}];
  assert.equal(evaluateIntradaySignal(cfg).signal,"BUY_CANDIDATE");
});
