// Search_stock experimental intraday signals v1.
// Research / paper trading only. Never creates orders or claims live bookable prices.
// Requires completed, time-stamped 5-minute regular-session bars.
export const SIGNAL_VERSION = "1.0.0";
const NY="America/New_York";
const NO_ORDER="RESEARCH_ONLY_NOT_EXECUTABLE";
const finite=x=>typeof x==="number"&&Number.isFinite(x);
const localParts=iso=>{
  const p=new Intl.DateTimeFormat("en-GB",{timeZone:NY,year:"numeric",month:"2-digit",day:"2-digit",
    hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(iso));
  const obj=Object.fromEntries(p.map(x=>[x.type,x.value]));
  return {day:obj.year+"-"+obj.month+"-"+obj.day,clock:obj.hour+":"+obj.minute};
};
const dateValue=s=>Number.isFinite(Date.parse(s))?Date.parse(s):null;
const response=(signal,asOf,reasonCodes=[],features={},extra={})=>({
  version:SIGNAL_VERSION,signal,asOf,reasonCodes,features,...extra,
  execution: NO_ORDER,validated:false
});
function regularBars(input,day){
  if(!Array.isArray(input))return null;
  const out=[];
  for(const b of input){
    if(!b||typeof b.t!=="string"||dateValue(b.t)===null||!finite(b.o)||
       !finite(b.h)||!finite(b.l)||!finite(b.c)||!finite(b.v)||!finite(b.vw)||
       b.o<=0||b.h<=0||b.l<=0||b.c<=0||b.v<=0||b.vw<=0||
       b.l>b.h||Math.min(b.o,b.c)>b.h||Math.max(b.o,b.c)<b.l)return null;
    const {day:d,clock}=localParts(b.t);
    if(d!==day||clock<"09:30"||clock>"15:55")return null;
    out.push({...b,clock,ms:Date.parse(b.t)});
  }
  out.sort((a,b)=>a.ms-b.ms);
  if(out.some((b,i)=>i&&b.ms-out[i-1].ms!==300000))return null;
  return out;
}
const expected=["09:30","09:35","09:40","09:45","09:50","09:55"];
function anchored(bars){
  return bars&&bars.length>=7&&expected.every((s,i)=>bars[i]?.clock===s);
}
function referenceAt(bars,clock){
  if(!anchored(bars))return null;
  const b=bars.find(z=>z.clock===clock);
  return b??null;
}
function cumulativeVolume(bars,clock){
  let amount=0;
  for(const b of bars){if(b.clock>clock)break;amount+=b.v;}
  return amount;
}
function activeRisk(events,now){
  if(!Array.isArray(events))return [];
  return events.filter(e=>{
    if(!e||e.direction!=="negative"||e.severity!=="material"||
      !["confirmed","reported"].includes(e.verification)||
      typeof e.sourceUrl!=="string"||!/^https:\/\//.test(e.sourceUrl))return false;
    const ms=dateValue(e.publishedAt);
    return ms!==null&&ms<=now&&now-ms<=48*3600000;
  });
}
export function evaluateIntradaySignal({
  ticker,asOf,feed,bars,sectorBars,broadBars,sectorFeed,broadFeed,
  historicalDays,events=[],position=null
}={}){
  const now=dateValue(asOf);
  if(!ticker||!(/^[A-Z][A-Z0-9.-]{0,11}$/.test(ticker))||now===null)
    return response("NO_DATA",asOf,["BAD_IDENTITY_OR_TIME"]);
  const risk=activeRisk(events,now);
  // A material, attributable alert is valuable even when the exchange is closed.
  if(risk.length)return response("RISK_ALERT",asOf,["RECENT_MATERIAL_NEGATIVE_NEWS"],{},
    {ticker,news:risk.map(e=>({publishedAt:e.publishedAt,verification:e.verification,
      sourceUrl:e.sourceUrl})),tradeTrigger:null});
  if(!["IEX","SIP"].includes(feed)||sectorFeed!==feed||broadFeed!==feed)
    return response("NO_DATA",asOf,["MISMATCHED_OR_MISSING_FEEDS"],{},{ticker});
  const {day,clock}=localParts(asOf);
  if(clock<"09:35"||clock>="16:00")
    return response("MARKET_CLOSED",asOf,["OUTSIDE_REGULAR_SESSION"],{},{ticker});
  const own=regularBars(bars,day);
  const sector=regularBars(sectorBars,day);
  const broad=regularBars(broadBars,day);
  if(!anchored(own)||!anchored(sector)||!anchored(broad))
    return response("NO_DATA",asOf,["MISSING_CONTIGUOUS_OPENING_BARS"],{},{ticker});
  const last=own.at(-1),prev=own.at(-2);
  const timeSinceEnd=now-(last.ms+300000);
  if(timeSinceEnd<0||timeSinceEnd>10*60000)
    return response("NO_DATA",asOf,["INCOMPLETE_OR_STALE_BAR"],{},{ticker});
  if(last.clock<"10:00")
    return response("WAIT",asOf,["OPENING_RANGE_NOT_COMPLETE"],{},{ticker});
  const matchingSector=referenceAt(sector,last.clock);
  const matchingBroad=referenceAt(broad,last.clock);
  if(!matchingSector||!matchingBroad)
    return response("NO_DATA",asOf,["BENCHMARK_BAR_MISSING"],{},{ticker});
  const high=Math.max(...own.slice(0,6).map(x=>x.h));
  const low=Math.min(...own.slice(0,6).map(x=>x.l));
  const current=own.filter(x=>x.ms<=last.ms);
  const totalVolume=current.reduce((sum,b)=>sum+b.v,0);
  const vwap=current.reduce((sum,b)=>sum+b.v*b.vw,0)/totalVolume;
  const sectorMove=matchingSector.c/sector[0].o-1;
  const broadMove=matchingBroad.c/broad[0].o-1;
  const historical=(Array.isArray(historicalDays)?historicalDays:[])
    .filter(d=>d?.day<day&&d.feed===feed&&typeof d.day==="string")
    .map(d=>({day:d.day,bars:regularBars(d.bars,d.day)}))
    .filter(d=>anchored(d.bars)&&referenceAt(d.bars,last.clock))
    .sort((a,b)=>b.day.localeCompare(a.day))
    .slice(0,5);
  const profile=historical.length===5?
    historical.reduce((sum,d)=>sum+cumulativeVolume(d.bars,last.clock),0)/5:null;
  const relativeVolume=profile&&profile>0?totalVolume/profile:null;
  const f={openingRangeHigh:high,openingRangeLow:low,vwap,price:last.c,
    sectorMovePct:sectorMove*100,broadMovePct:broadMove*100,
    relativeVolume,barStart:last.t,feed,benchmarkTime:matchingSector.t};
  if(!finite(relativeVolume))
    return response("NO_DATA",asOf,["MISSING_FIVE_PRIOR_SAME_FEED_SESSIONS"],f,{ticker});
  if(position!==null){
    const p=position;
    if(p?.side==="long"&&finite(p.entryPrice)&&finite(p.stopPrice)&&
       finite(p.takeProfitPrice)&&p.entryPrice>p.stopPrice&&
       p.takeProfitPrice>p.entryPrice){
      if(last.c<=p.stopPrice)return response("EXIT_RISK",asOf,["POSITION_STOP_REACHED"],f,{ticker});
      if(last.c>=p.takeProfitPrice)return response("TAKE_PROFIT_REVIEW",asOf,["POSITION_TARGET_REACHED"],f,{ticker});
    }
  }
  // New event signals only: no repeated alerts for a breakout from hours earlier.
  const up=prev.c<=high&&last.c>high;
  const down=prev.c>=low&&last.c<low;
  const id=ticker+"|"+day+"|"+last.clock+"|"+(up?"UP":down?"DOWN":"NONE");
  if(up&&last.c>vwap&&relativeVolume>=1.5&&sectorMove>0&&broadMove>0)
    return response("BUY_CANDIDATE",asOf,["NEW_UPSIDE_BREAKOUT","VWAP_SUPPORT",
      "RELATIVE_VOLUME_CONFIRMED","SECTOR_AND_MARKET_ALIGNED"],f,
      {ticker,signalId:id,triggerPrice:high,invalidationPrice:low});
  if(down&&last.c<vwap&&relativeVolume>=1.5&&sectorMove<0&&broadMove<0)
    return response("SELL_RISK",asOf,["NEW_DOWNSIDE_BREAKOUT","VWAP_WEAKNESS",
      "RELATIVE_VOLUME_CONFIRMED","SECTOR_AND_MARKET_ALIGNED"],f,
      {ticker,signalId:id,triggerPrice:low,invalidationPrice:high});
  const why=up||down?"BREAKOUT_NOT_CONFIRMED":"NO_NEW_BREAKOUT";
  return response("WAIT",asOf,[why],f,{ticker,signalId:id});
}
