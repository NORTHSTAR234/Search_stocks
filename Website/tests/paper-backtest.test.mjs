import test from "node:test";
import assert from "node:assert/strict";
import {evaluatePaperBenchmark} from "../scripts/paper-backtest.mjs";
const days=["2026-11-02","2026-11-03","2026-11-04","2026-11-05",
  "2026-11-06","2026-11-09","2026-11-10"];
function fixture(){
  const instruments=["MU","SOXX","QQQ"],bars={};
  for(const ticker of instruments){
    bars[ticker]=[];
    for(const day of days){
      const signalDay=day==="2026-11-10";
      const start=Date.parse(day+"T14:30:00Z");
      for(let i=0;i<78;i++){
        const isBreak=ticker==="MU"&&signalDay&&i>=6;
        const isBench=ticker!=="MU"&&signalDay;
        const c=isBreak?(i===6?101:101.2):isBench?101:100;
        const o=isBreak?(i===6?100.8:101.05):100;
        bars[ticker].push({
          t:new Date(start+i*300000).toISOString(),
          o,c,h:Math.max(o,c)+0.25,l:Math.min(o,c)-0.25,
          v:signalDay?250:100,vw:(o+c)/2
        });
      }
    }
  }
  return {feed:"IEX",bars,events:{}};
}
test("Paper benchmark compares one qualified new breakout against baseline",()=>{
  const r=evaluatePaperBenchmark(fixture(),{tickers:["MU"]});
  assert.equal(r.researchOnly,true);
  assert.equal(r.validated,false);
  assert.equal(r.pilot.signalCount,1);
  assert.equal(r.pilot.filled,1);
  assert.equal(r.pilot.skipped,0);
  assert.equal(r.baseline.signalCount,1);
  assert.equal(r.baseline.filled,1);
  assert.equal(r.paperRows[0].outcome.execution,"PAPER_ONLY_NO_ORDER");
  assert.equal(r.paperRows[0].outcome.entryAt,"2026-11-10T15:05:00.000Z");
});
test("Timestamped negative news suppresses pilot buy but baseline remains a context control",()=>{
  const data=fixture();
  data.events.MU=[{publishedAt:"2026-11-09T22:00:00Z",
    direction:"negative",severity:"material",
    verification:"reported",sourceUrl:"https://example.org/governance"}];
  const r=evaluatePaperBenchmark(data,{tickers:["MU"]});
  assert.equal(r.pilot.signalCount,0);
  assert.equal(r.baseline.signalCount,1);
});
test("Cost assumptions apply symmetrically to paper fills",()=>{
  const data=fixture();
  const free=evaluatePaperBenchmark(data,{tickers:["MU"],costBpsPerSide:0});
  const costly=evaluatePaperBenchmark(data,{tickers:["MU"],costBpsPerSide:50});
  assert(free.pilot.meanNetReturnPct>costly.pilot.meanNetReturnPct);
});
test("No future events generate falsely prescient vetoes",()=>{
  const data=fixture();
  data.events.MU=[{publishedAt:"2026-11-11T22:00:00Z",
    direction:"negative",severity:"material",
    verification:"confirmed",sourceUrl:"https://example.org/late"}];
  const r=evaluatePaperBenchmark(data,{tickers:["MU"]});
  assert.equal(r.pilot.signalCount,1);
});
