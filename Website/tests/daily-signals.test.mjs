import test from "node:test";
import assert from "node:assert/strict";
import {evaluateDailyTicker,makeDailyReport} from "../lib/daily-signals.mjs";
const row={ticker:"AAPL",company:"Apple",exchange:"US",nativeCurrency:"USD",
 musaffaClassification:"HALAL",musaffaGate:"PASS",musaffaAssessment:"VERIFIED_HALAL",
 musaffaScreeningDate:"2026-11-01",action:"HOLD",reportPath:"/reports/AAPL/"};
function data(count=100){
 const start=Date.parse("2026-08-05T00:00:00Z"),bars=[];
 for(let i=0;i<count;i++){
  const d=new Date(start+i*86400000).toISOString().slice(0,10);
  const c=100+i*0.07+Math.sin(i*1.8)*0.38;
  bars.push({d,o:c-0.15,h:c+0.9,l:c-1.05,c,v:20000+i});
 }
 return bars;
}
const ctx={evaluationDay:"2026-11-12",asOf:"2026-11-12T22:50:00Z",
 feed:"ALPACA_IEX_DAILY_SPLIT_ADJUSTED"};
test("Daily model has finite indicator, technical levels and exact proof-of-data labels",()=>{
 const x=evaluateDailyTicker(row,data(),ctx);
 assert.equal(x.ticker,"AAPL");
 assert.equal(x.status,"OK");
 assert(["BUY","WATCH","HOLD","SELL"].includes(x.technicalSignal));
 assert(x.atr>0&&x.sma20>0&&x.sma50>0);
 assert(x.stop<x.close&&x.target>x.close);
 assert.equal(x.shariah,"VERIFIED_HALAL");
 assert.equal(x.feed,"ALPACA_IEX_DAILY_SPLIT_ADJUSTED");
});
test("Missing and stale data must never emit BUY or SELL",()=>{
 for(const input of [[],data(12),data(100).slice(0,60)]){
  const x=evaluateDailyTicker(row,input,ctx);
  assert.equal(x.technicalSignal,"NO_SIGNAL");
 }
 const old=evaluateDailyTicker(row,data(),{...ctx,evaluationDay:"2026-12-10"});
 assert.equal(old.status,"STALE_DAILY_HISTORY");
 assert.equal(old.technicalSignal,"NO_SIGNAL");
});
test("Non-halal and unverified screens block technical BUY recommendation",()=>{
 const bars=data();const eligible=evaluateDailyTicker(row,bars,ctx);
 const blocked=evaluateDailyTicker({...row,musaffaGate:"UNKNOWN"},bars,ctx);
 if(eligible.technicalSignal==="BUY"){
  assert.equal(blocked.technicalSignal,"WATCH");
  assert.equal(blocked.reasons[0],"SHARIAH_SCREEN_NOT_CURRENT_FOR_BUY");
 }else{assert.notEqual(blocked.shariah,"VERIFIED_HALAL");}
});
test("Screening-only archived reports never produce financial recommendations",()=>{
 const x=evaluateDailyTicker({...row,statusOnly:true},data(),ctx);
 assert.equal(x.technicalSignal,"NO_SIGNAL");
 assert.equal(x.reasons[0],"ARCHIVE_SCREENING_ONLY");
});
test("Daily report includes all tickers once, including unsupported markets",()=>{
 const records=[row,row,{...row,ticker:"SU.PA",exchange:"XPAR",nativeCurrency:"EUR",
  sourceMarketTicker:"SU.PA"}];
 const out=makeDailyReport(records,{AAPL:{bars:data(),feed:"ALPACA_IEX_DAILY_SPLIT_ADJUSTED"}},
  "2026-11-12T22:50:00Z");
 assert.equal(out.count,2);
 assert.equal(out.rows[1].ticker,"SU.PA");
 assert.equal(out.rows[1].technicalSignal,"NO_SIGNAL");
 assert.equal(out.execution,"RESEARCH_ONLY_NO_ORDERS");
});
