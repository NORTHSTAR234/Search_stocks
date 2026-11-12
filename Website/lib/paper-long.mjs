// Offline paper simulation: long-only, not an execution system.
// An opening-range alert is observed only after its 5-minute candle completes.
// No attempt to model fill quality beyond explicit, user-adjustable assumptions.
const ok=x=>typeof x==="number"&&Number.isFinite(x);
const stamp=x=>typeof x==="string"&&Number.isFinite(Date.parse(x))?Date.parse(x):null;
const rounding=x=>Math.round(x*1e5)/1e5;
export const PAPER_DEFAULTS=Object.freeze({
  costBpsPerSide:8, maxChasePct:0.75, maxRiskPct:3,
  rewardRisk:1.5, maximumHoldMinutes:330
});
function assumptions(options={}){
  const v={...PAPER_DEFAULTS,...options};
  for(const k of Object.keys(PAPER_DEFAULTS)){
    if(!ok(v[k])||v[k]<0)throw Error("Invalid paper assumption: "+k);
  }
  if(v.maxChasePct>10||v.maxRiskPct>20||v.rewardRisk>10||
     v.maximumHoldMinutes>390)throw Error("Out-of-bounds paper assumption");
  return v;
}
const skip=(why,meta={})=>({status:"SKIP",reason:why,execution:"PAPER_ONLY_NO_ORDER",...meta});
export function paperLong(candidate,fullSession,overrides={}){
  const a=assumptions(overrides);
  if(!candidate||candidate.signal!=="BUY_CANDIDATE"||
     candidate.execution!=="RESEARCH_ONLY_NOT_EXECUTABLE"||
     candidate.validated!==false)return skip("NOT_UNVALIDATED_LONG_CANDIDATE");
  const at=stamp(candidate.asOf),start=stamp(candidate.features?.barStart);
  if(at===null||start===null||at<start+300000||
     !ok(candidate.triggerPrice)||!ok(candidate.invalidationPrice)||
     candidate.invalidationPrice<=0)return skip("MISSING_OR_INVALID_SIGNAL");
  if(!Array.isArray(fullSession)||fullSession.length<8)return skip("INSUFFICIENT_FUTURE_BARS");
  const bars=fullSession.map(b=>({t:stamp(b?.t),o:b?.o,h:b?.h,l:b?.l,c:b?.c}))
    .sort((x,y)=>x.t-y.t);
  if(bars.some((b,i)=>b.t===null||!["o","h","l","c"].every(k=>ok(b[k])&&b[k]>0)||
    b.h<Math.max(b.o,b.c)||b.l>Math.min(b.o,b.c)||
    (i>0&&b.t-bars[i-1].t!==300000)))
    return skip("INVALID_OR_GAPPED_SESSION");
  const bar=bars.find(b=>b.t===start);
  const next=bars.find(b=>b.t===start+300000);
  if(!bar||!next||next.t<at)return skip("NEXT_BAR_UNAVAILABLE");
  // New risk veto as of the candidate's next bar must be handled upstream.
  // A long is never filled from a SELL_RISK signal, avoiding short-sales.
  if(next.o<=candidate.triggerPrice)return skip("OPEN_BACK_BELOW_TRIGGER");
  const chase=(next.o/bar.c-1)*100;
  if(chase>a.maxChasePct)return skip("GAP_UP_NO_CHASE",{gapPct:rounding(chase)});
  const stop=candidate.invalidationPrice;
  if(next.o<=stop)return skip("OPEN_AT_OR_BELOW_STOP");
  const risk=(next.o-stop)/next.o*100;
  if(risk<=0||risk>a.maxRiskPct)
    return skip("RISK_BAND_TOO_WIDE",{plannedRiskPct:rounding(risk)});
  const target=next.o+a.rewardRisk*(next.o-stop);
  const expire=next.t+a.maximumHoldMinutes*60000;
  const period=bars.filter(b=>b.t>=next.t&&b.t<=expire);
  if(!period.length)return skip("NO_EXIT_BAR");
  let exit=period.at(-1).c,kind="TIME_EXIT",time=period.at(-1).t;
  for(const b of period){
    if(b.o<=stop){exit=b.o;kind="STOP_GAP";time=b.t;break;}
    // If stop and target are both touched in the same five-minute bar,
    // assume the WORSE (stop) without pretending intrabar sequencing is known.
    if(b.l<=stop){exit=stop;kind="STOP";time=b.t;break;}
    if(b.o>=target){exit=b.o;kind="TARGET_GAP";time=b.t;break;}
    if(b.h>=target){exit=target;kind="TARGET";time=b.t;break;}
  }
  const entryCost=next.o*(1+a.costBpsPerSide/10000);
  const exitNet=exit*(1-a.costBpsPerSide/10000);
  const gross=(exit/next.o-1)*100;
  return {status:"PAPER_FILLED",execution:"PAPER_ONLY_NO_ORDER",
    ticker:candidate.ticker,signalId:candidate.signalId,
    asOf:new Date(at).toISOString(),entryAt:new Date(next.t).toISOString(),
    exitAt:new Date(time).toISOString(),entryPrice:rounding(next.o),
    exitPrice:rounding(exit),stopPrice:rounding(stop),targetPrice:rounding(target),
    plannedRiskPct:rounding(risk),grossReturnPct:rounding(gross),
    netReturnPct:rounding((exitNet/entryCost-1)*100),
    exitReason:kind,costBpsPerSide:a.costBpsPerSide,
    assumptions:{...a},validated:false};
}
export function summarizePaperLong(rows){
  if(!Array.isArray(rows))throw Error("Expected paper rows array");
  const filled=rows.filter(x=>x?.status==="PAPER_FILLED");
  const net=filled.map(x=>x.netReturnPct);
  const n=filled.length,winning=net.filter(x=>x>0).length;
  const mean=n?net.reduce((s,v)=>s+v,0)/n:null;
  const sorted=[...net].sort((a,b)=>a-b);
  return {researchOnly:true,autoExecution:false,signalCount:rows.length,
    filled:n,skipped:rows.length-n,profitable:winning,
    hitRate:n?winning/n:null,
    meanNetReturnPct:mean,medianNetReturnPct:n?sorted[Math.floor((n-1)/2)]:null,
    totalNetPercentNotCompounded:n?net.reduce((a,b)=>a+b,0):null,
    caveat:"Idealized next-bar-open paper fills; no brokerage execution, queue, halt, partial fills, market impact, portfolio constraints, taxes, or actual trading P&L."};
}
