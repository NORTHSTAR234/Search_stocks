// Retrospective scoring of genuinely PRE-RECORDED private paper observations.
// Inputs must be locally provided, licensed IEX 5m bars and sanitized journal JSON.
// Never creates an order; never invents a paper fill if the next candle already opened.
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {paperLong,summarizePaperLong} from "../lib/paper-long.mjs";
const NY="America/New_York";
const dateTime=ts=>{
 const time=Date.parse(ts);
 if(!Number.isFinite(time))return null;
 const a=Object.fromEntries(new Intl.DateTimeFormat("en-GB",{
  timeZone:NY,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",
  minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(time))
  .map(p=>[p.type,p.value]));
 return {date:a.year+"-"+a.month+"-"+a.day,clock:a.hour+":"+a.minute};
};
const missed=(why,extra={})=>({status:"UNSCORED",reason:why,...extra});
function reconstruct(record,bars){
 if(record?.schema!=="paper-research-v1"||
    record.researchSignal!=="BUY_CANDIDATE"||
    record.paperOnly!==true||record.unvalidated!==true)return missed("NOT_A_PROSPECTIVE_BUY");
 const m=typeof record.signalId==="string"?
   /^([A-Z]{1,5})\|(20\d\d-\d\d-\d\d)\|(\d\d:\d\d)\|UP$/.exec(record.signalId):null;
 if(!m||record.ticker!==m[1]||!dateTime(record.asOf)||
    !Number.isFinite(Date.parse(record.recordedAt))||
    Date.parse(record.recordedAt)<Date.parse(record.asOf)||
    Date.parse(record.recordedAt)-Date.parse(record.asOf)>10*60000)
   return missed("UNVERIFIABLE_OR_LATE_JOURNAL");
 if(!Array.isArray(bars))return missed("MISSING_LICENSED_BARS");
 const day=bars.filter(b=>dateTime(b?.t)?.date===m[2] &&
   dateTime(b?.t)?.clock>="09:30"&&dateTime(b?.t)?.clock<="15:55")
   .sort((a,b)=>Date.parse(a.t)-Date.parse(b.t));
 if(day.length!==78||dateTime(day[0].t)?.clock!=="09:30"||
    dateTime(day.at(-1).t)?.clock!=="15:55"||
    day.some((b,i)=>(i>0&&Date.parse(b.t)-Date.parse(day[i-1].t)!==300000)||
      !["o","h","l","c"].every(k=>Number.isFinite(b[k])&&b[k]>0)))
  return missed("INCOMPLETE_IEX_SESSION");
 const signalBar=day.find(b=>dateTime(b.t)?.clock===m[3]);
 if(!signalBar||Date.parse(signalBar.t)+300000>Date.parse(record.asOf)||
    Date.parse(record.asOf)-Date.parse(signalBar.t)-300000>10*60000)
   return missed("SIGNAL_TIME_MISMATCH");
 const hi=Math.max(...day.slice(0,6).map(b=>b.h));
 const lo=Math.min(...day.slice(0,6).map(b=>b.l));
 const ix=day.indexOf(signalBar);
 if(ix<6||ix>=77||day[ix-1].c>hi||signalBar.c<=hi)
   return missed("NOT_A_NEW_UPSIDE_BREAKOUT");
 const setup={ticker:record.ticker,signal:"BUY_CANDIDATE",
  execution:"RESEARCH_ONLY_NOT_EXECUTABLE",validated:false,
  signalId:record.signalId,asOf:record.asOf,triggerPrice:hi,
  invalidationPrice:lo,features:{barStart:signalBar.t}};
 return {status:"VALID_RECORDED_SETUP",setup,day};
}
export function scoreProspectivePaper(journal,bars,options={}){
 if(!Array.isArray(journal)||!bars||typeof bars!=="object")
   throw Error("Expected journal array and ticker-indexed IEX bars");
 const seen=new Set(),rows=[];
 for(const r of journal){
   if(!r||typeof r!=="object")continue;
   const k=r.ticker+"|"+r.signalId+"|"+r.asOf;
   if(seen.has(k))continue;
   seen.add(k);
   const found=reconstruct(r,bars[r.ticker]);
   const outcome=found.status==="VALID_RECORDED_SETUP"?
     paperLong(found.setup,found.day,options):found;
   rows.push({ticker:r.ticker,asOf:r.asOf,recordedSignal:r.researchSignal,
     outcome});
 }
 const scored=rows.map(x=>x.outcome);
 const overview=summarizePaperLong(scored);
 return {schema:"prospective-paper-score-v1",researchOnly:true,
   feed:"IEX",...overview,
   paperTradeCount:overview.filled,
   recordedObservations:rows.length,
   notPaperTradeCount:rows.filter(x=>x.recordedSignal!=="BUY_CANDIDATE").length,
   rows:rows.map(x=>({ticker:x.ticker,asOf:x.asOf,
     recordedSignal:x.recordedSignal,paperStatus:x.outcome.status,
     reason:x.outcome.reason||x.outcome.exitReason||null,
     netReturnPct:x.outcome.status==="PAPER_FILLED"?x.outcome.netReturnPct:null})),
   caveat:"Derived price levels reconstructed later from IEX historical bars, not stored point-in-time quotes; delays and impossible next-bar fills are excluded. No historical event corpus or real brokerage P&L."};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(!process.argv[2]||!process.argv[3])
   throw Error("Supply a PRIVATE sanitized journal JSON path and a LICENSED IEX bars JSON path");
  const journal=JSON.parse(readFileSync(process.argv[2],"utf8"));
  const data=JSON.parse(readFileSync(process.argv[3],"utf8"));
  console.log(JSON.stringify(scoreProspectivePaper(journal,data.bars||data),null,2));
 }catch(e){console.error(e.message);process.exitCode=1;}
}
