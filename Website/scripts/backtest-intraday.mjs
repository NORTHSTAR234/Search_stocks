// Offline, local-data-only replay of the research signal engine. Never sends orders.
// Usage: node Website/scripts/backtest-intraday.mjs ./private-5min-bars.json
// Input: {"feed":"IEX","bars":{"MU":[{"t":"...","o":1,"h":1,"l":1,
// "c":1,"v":1,"vw":1},...],"SOXX":[...],"QQQ":[...],"SPY":[...]},
// "events":{"MU":[{"publishedAt":"...","direction":"negative", ...}]}}
// Store licensed history locally, NOT in the public repository.
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {evaluateIntradaySignal} from "../lib/intraday-signals.mjs";
import {classifyNewsRisk} from "../lib/news-risk.mjs";
const dt=t=>{
  const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"America/New_York",
    year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",
    minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(t));
  const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
  return {day:p.year+"-"+p.month+"-"+p.day,hm:p.hour+":"+p.minute};
};
export function replay(input,{tickers=["MU","NVDA","AMD","AAPL"],
  sectorByTicker={MU:"SOXX",NVDA:"SOXX",AMD:"SOXX",AAPL:"SPY"},
  broadTicker="QQQ",requireNewsCoverage=false}={}){
  if(!["IEX","SIP"].includes(input?.feed)||!input.bars||
     typeof input.bars!=="object")throw Error("Requires explicitly identified IEX/SIP 5-minute bars");
  const byTicker={};
  for(const [symbol,bars] of Object.entries(input.bars)){
    if(!Array.isArray(bars))throw Error("Invalid bar array for "+symbol);
    const sessions={};
    for(const b of bars){
      if(!Number.isFinite(Date.parse(b?.t)))throw Error("Invalid timestamp");
      const {day,hm}=dt(b.t);
      if(hm<"09:30"||hm>"15:55")continue;
      (sessions[day]??=[]).push(b);
    }
    for(const a of Object.values(sessions))a.sort((x,y)=>Date.parse(x.t)-Date.parse(y.t));
    byTicker[symbol]=sessions;
  }
  const signals=[];
  for(const ticker of tickers){
    const sessions=byTicker[ticker]||{};
    const sector=byTicker[sectorByTicker[ticker]],broad=byTicker[broadTicker];
    if(!sector||!broad)continue;
    const days=Object.keys(sessions).sort();
    for(const day of days){
      const own=sessions[day];
      if(requireNewsCoverage&&input.newsCoverage?.[ticker]?.[day]!=="COMPLETE")continue;
      if(own.length<20)continue;
      const past=days.filter(d=>d<day).slice(-5);
      if(past.length<5)continue;
      const historicalDays=past.map(d=>({day:d,feed:input.feed,bars:sessions[d]}));
      let used=false;
      for(let i=6;i<own.length-1;i++){
        const bar=own[i],hm=dt(bar.t).hm;
        if(hm>"15:30")break; // Disallow entries with only a few minutes remaining.
        const at=new Date(Date.parse(bar.t)+300000).toISOString();
        // Source-created timestamps, never retrospective provider updates or later articles.
        const rawNews=Array.isArray(input.news?.[ticker])?input.news[ticker]:[];
        const reported=rawNews.slice(0,500).map(article=>classifyNewsRisk(article,ticker,at)).filter(Boolean);
        const events=[...(input.events?.[ticker]||[]),...reported];
        const result=evaluateIntradaySignal({ticker,asOf:at,feed:input.feed,
          sectorFeed:input.feed,broadFeed:input.feed,bars:own.slice(0,i+1),
          sectorBars:(sector[day]||[]).filter(x=>Date.parse(x.t)<=Date.parse(bar.t)),
          broadBars:(broad[day]||[]).filter(x=>Date.parse(x.t)<=Date.parse(bar.t)),
          historicalDays,events});
        if(["BUY_CANDIDATE","SELL_RISK"].includes(result.signal)){
          const last=own.at(-1);
          const direction=result.signal==="BUY_CANDIDATE"?1:-1;
          // Informational direction-of-move proxy, NOT a hypothetical executed P&L.
          const signedMovePct=(last.c/bar.c-1)*100*direction;
          signals.push({ticker,day,signal:result.signal,asOf:at,
            signalPrice:bar.c,sessionEndPrice:last.c,
            signedMovePct:Math.round(signedMovePct*1000)/1000,
            relativeVolume:result.features.relativeVolume,
            signalId:result.signalId});
          used=true;break;
        }
      }
      if(used)continue;
    }
  }
  const n=signals.length, wins=signals.filter(x=>x.signedMovePct>0).length;
  return {researchOnly:true,feeModel:"none",slippageModel:"none",
    requireNewsCoverage,providerCreatedTimestampsAreNotVerifiedFirstPublication:true,
    signalCount:n,positiveDirectionalMoves:wins,
    fractionPositive:n?wins/n:null,
    meanSignedMovePct:n?signals.reduce((a,x)=>a+x.signedMovePct,0)/n:null,
    // A positive signed move on SELL_RISK means the stock subsequently DECLINED;
    // it does not imply the investor shorted it or earned that percentage.
    signals};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  if(!process.argv[2]){console.error("Provide a local JSON path with licensed bars");process.exitCode=2;}
  else {
    try{
      const result=replay(JSON.parse(readFileSync(process.argv[2],"utf8")));
      console.log(JSON.stringify(result,null,2));
    }catch(e){console.error("Backtest failed:",e.message);process.exitCode=1;}
  }
}
