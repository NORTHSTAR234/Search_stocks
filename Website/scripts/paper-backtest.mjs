// Offline point-in-time research benchmark: signal engine vs basic 30-minute
// upside breakout, both run through identical next-bar-open paper fill rules.
// No brokerage, API keys, real accounts, or cloud storage.
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {replay} from "./backtest-intraday.mjs";
import {paperLong,summarizePaperLong,PAPER_DEFAULTS} from "../lib/paper-long.mjs";
const NY="America/New_York";
const dayTime=stamp=>{
  const p=new Intl.DateTimeFormat("en-GB",{timeZone:NY,year:"numeric",
    month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"})
    .formatToParts(new Date(stamp));
  const v=Object.fromEntries(p.map(x=>[x.type,x.value]));
  return [v.year+"-"+v.month+"-"+v.day,v.hour+":"+v.minute];
};
const key=(ticker,day)=>ticker+"|"+day;
function sessionsOf(input){
  const map=new Map();
  for(const [ticker,bars] of Object.entries(input.bars||{})){
    if(!Array.isArray(bars))throw Error("Invalid bar array");
    for(const b of bars){
      const [day,clock]=dayTime(b.t);
      if(clock<"09:30"||clock>"15:55")continue;
      const k=key(ticker,day);
      if(!map.has(k))map.set(k,[]);
      map.get(k).push(b);
    }
  }
  for(const a of map.values())a.sort((a,b)=>a.t.localeCompare(b.t));
  return map;
}
function anchored(rows){
  const expected=["09:30","09:35","09:40","09:45","09:50","09:55"];
  return rows.length>=8&&expected.every((v,i)=>dayTime(rows[i].t)[1]===v)&&
    rows.every((b,i)=>!i||Date.parse(b.t)-Date.parse(rows[i-1].t)===300000);
}
function longCandidate(ticker,rows,at,kind="BUY_CANDIDATE"){
  const start=new Date(Date.parse(at)-300000).toISOString();
  const high=Math.max(...rows.slice(0,6).map(x=>x.h));
  const low=Math.min(...rows.slice(0,6).map(x=>x.l));
  return {ticker,signal:kind,asOf:at,validated:false,
    execution:"RESEARCH_ONLY_NOT_EXECUTABLE",
    triggerPrice:high,invalidationPrice:low,
    features:{barStart:start}};
}
function baselineCandidates(map,tickers){
  const out=[];
  for(const [keyName,rows] of map){
    const i=keyName.indexOf("|");
    const ticker=keyName.slice(0,i),day=keyName.slice(i+1);
    if(!tickers.includes(ticker)||!anchored(rows))continue;
    const high=Math.max(...rows.slice(0,6).map(x=>x.h));
    for(let n=6;n<rows.length-1;n++){
      const clock=dayTime(rows[n].t)[1];
      if(clock>"15:30")break;
      if(rows[n-1].c<=high&&rows[n].c>high){
        const at=new Date(Date.parse(rows[n].t)+300000).toISOString();
        out.push({ticker,day,asOf:at,signal:"BUY_CANDIDATE"});
        break;
      }
    }
  }
  return out;
}
function wilson(successes,n,z=1.96){
  if(!n)return null;
  const p=successes/n,z2=z*z,mid=(p+z2/(2*n))/(1+z2/n);
  const half=z*Math.sqrt(p*(1-p)/n+z2/(4*n*n))/(1+z2/n);
  return {low:mid-half,high:mid+half};
}
export function evaluatePaperBenchmark(input,{tickers=["MU","NVDA","AMD","AAPL"],costBpsPerSide=8,
  maxChasePct=0.75,maxRiskPct=3,rewardRisk=1.5}={}){
  const options={costBpsPerSide,maxChasePct,maxRiskPct,rewardRisk};
  const prices=sessionsOf(input);
  const technical=replay(input,{tickers});
  const filtered=technical.signals.filter(s=>s.signal==="BUY_CANDIDATE");
  const warnings=technical.signals.filter(s=>s.signal==="SELL_RISK");
  const run=signals=>signals.map(s=>{
    const rows=prices.get(key(s.ticker,s.day))||[];
    return {ticker:s.ticker,day:s.day,asOf:s.asOf,
      outcome:paperLong(longCandidate(s.ticker,rows,s.asOf),rows,options)};
  });
  const primary=run(filtered);
  const baseline=run(baselineCandidates(prices,tickers));
  const summary=arr=>{
    const p=summarizePaperLong(arr.map(x=>x.outcome));
    return {...p,positiveInterval95:wilson(p.profitable,p.filled),
      sampleDays:new Set(arr.map(x=>x.day)).size,
      maxSingleLossPct:Math.min(0,...arr.filter(x=>x.outcome.status==="PAPER_FILLED")
        .map(x=>x.outcome.netReturnPct))};
  };
  const days=[...new Set([...primary,...baseline].map(x=>x.day))].sort();
  const cut=days[Math.max(0,Math.floor(days.length*.7))]||null;
  const outOfSample=arr=>summary(arr.filter(x=>x.day>=cut));
  return {researchOnly:true,validated:false,dataFeed:input.feed,
    simulator:"LONG_ONLY_NEXT_BAR_OPEN",
    assumptions:{...PAPER_DEFAULTS,...options},
    eligibleSymbols:tickers,coveredDays:days.length,holdoutStart:cut,
    pilot:{...summary(primary),holdout:outOfSample(primary)},
    baseline:{...summary(baseline),holdout:outOfSample(baseline)},
    downsideWarnings: {count:warnings.length,meanSignedMoveToClosePct:warnings.length?
      warnings.reduce((a,x)=>a+x.signedMovePct,0)/warnings.length:null,
      note:"Downside warnings are NOT simulated short sales or profits."},
    paperRows:primary,
    caveat:"Rule was examined before the holdout was defined: a chronological 30% tail is NOT a truly unseen prospective test. Data are IEX-only and no historical news events were supplied unless explicitly included."};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    if(!process.argv[2])throw Error("Provide private licensed local OHLCV JSON file path");
    const data=JSON.parse(readFileSync(process.argv[2],"utf8"));
    console.log(JSON.stringify(evaluatePaperBenchmark(data),null,2));
  }catch(e){console.error(e.message);process.exitCode=1;}
}
