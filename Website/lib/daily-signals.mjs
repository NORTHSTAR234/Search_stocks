// Daily, end-of-session TECHNICAL research; not a broker instruction.
// The same indicators work for separately identified US IEX and non-US Yahoo daily bars.
// Never infer missing prices, market sessions, dividends, halal status or order fills.
export const DAILY_SIGNAL_SCHEMA=1;
const round=(n,p=2)=>Number(Number(n).toFixed(p));
const number=n=>typeof n==="number"&&Number.isFinite(n);
const dateValid=d=>typeof d==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&
  Number.isFinite(Date.parse(d+"T00:00:00Z"));
const mean=xs=>xs.reduce((a,b)=>a+b,0)/xs.length;
const avg=(xs,n)=>mean(xs.slice(-n));
function rsi(closes,n=14){
 let up=0,down=0;
 for(let i=closes.length-n;i<closes.length;i++){
  const d=closes[i]-closes[i-1];up+=Math.max(0,d);down+=Math.max(0,-d);
 }
 if(!down)return up?100:50;
 return 100-100/(1+up/down);
}
function atr(rows,n=14){
 let total=0;
 for(let i=rows.length-n;i<rows.length;i++){
  const r=rows[i],prev=rows[i-1].c;
  total+=Math.max(r.h-r.l,Math.abs(r.h-prev),Math.abs(r.l-prev));
 }
 return total/n;
}
function cleanedBars(raw){
 if(!Array.isArray(raw))return [];
 const distinct=new Map();
 for(const b of raw){
  if(!dateValid(b?.d)||!["o","h","l","c","v"].every(k=>number(b[k])&&b[k]>=0)||
    b.o<=0||b.h<=0||b.l<=0||b.c<=0||b.h<b.l||
    Math.max(b.o,b.c)>b.h||Math.min(b.o,b.c)<b.l)continue;
  distinct.set(b.d,{d:b.d,o:b.o,h:b.h,l:b.l,c:b.c,v:b.v});
 }
 return [...distinct.values()].sort((a,b)=>a.d.localeCompare(b.d));
}
function halalStatus(r,day){
 if(r?.musaffaClassification!=="HALAL"||r?.musaffaGate!=="PASS"||
    !/VERIFIED_HALAL/.test(String(r.musaffaAssessment||"")))return "UNVERIFIED";
 const d=r.musaffaScreeningDate||(/^\d{4}-\d\d$/.test(r.musaffaScreeningPeriod||"")?
   r.musaffaScreeningPeriod+"-01":null);
 const diff=d?Date.parse(day+"T00:00:00Z")-Date.parse(d+"T00:00:00Z"):NaN;
 return Number.isFinite(diff)&&diff>=0&&diff<=125*86400000?"VERIFIED_HALAL":"STALE_SCREENING";
}
function unavailable(row,why,latest=null){
 return {ticker:row.ticker,company:row.company||row.ticker,exchange:row.exchange||"UNKNOWN",
  currency:row.nativeCurrency||"UNKNOWN",technicalSignal:"NO_SIGNAL",status:why,
  sessionDate:latest,close:null,changePct:null,score:null,entryLow:null,entryHigh:null,
  stop:null,target:null,riskReward:null,rsi:null,atr:null,sma20:null,sma50:null,
  reasons:[why],feed:null,shariah:halalStatus(row,latest||new Date().toISOString().slice(0,10)),
  archivedReportAction:String(row.action||"NOT RATED").slice(0,160),
  reportUrl:typeof row.reportPath==="string"?row.reportPath:null};
}
export function evaluateDailyTicker(row,raw,options={}){
 const now=options.asOf||new Date().toISOString();
 const today=options.evaluationDay||new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",
  year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(now));
 const h=cleanedBars(raw);
 const last=h.at(-1);
 const feed=options.feed||null;
 if(!last)return unavailable(row,"NO_HISTORY");
 // Older than seven calendar days is unsuitable for a daily investment signal.
 const age=(Date.parse(today+"T00:00:00Z")-Date.parse(last.d+"T00:00:00Z"))/86400000;
 if(!Number.isFinite(age)||age<0||age>7)return unavailable(row,"STALE_DAILY_HISTORY",last.d);
 if(h.length<65)return unavailable(row,"INSUFFICIENT_DAILY_HISTORY",last.d);
 // No fabricated forward-looking session: duplicates and recent invalid bars are refused.
 const prev=h.at(-2), closes=h.map(x=>x.c);
 const [s20,s50,r14,a14]=[avg(closes,20),avg(closes,50),rsi(closes),atr(h)];
 if(![s20,s50,r14,a14].every(number)||a14<=0)return unavailable(row,"INVALID_INDICATORS",last.d);
 const oldS20=mean(closes.slice(-25,-5));
 const bullish=last.c>s20&&s20>s50&&s20>oldS20;
 const bearish=last.c<s50&&s20<s50&&s20<oldS20;
 const proximity=(last.c-s20)/a14;
 const momentum=(last.c/prev.c-1)*100;
 const slope=(s20/oldS20-1)*100;
 // "SELL" describes a holder-risk warning, never a short-sale or actual order.
 let signal="HOLD",reason="MIXED_TREND";
 if(bearish&&r14<48){signal="SELL";reason="BEARISH_TREND_AND_MOMENTUM";}
 else if(bullish&&r14>=45&&r14<=72&&proximity>=-0.1&&proximity<=0.8&&momentum>=-3){
  signal="BUY";reason="BULLISH_TREND_NEAR_20_DAY_AVERAGE";
 }else if(bullish){signal="WATCH";reason=proximity>0.8?"PRICE_EXTENDED_ABOVE_ENTRY":
  r14>72?"RSI_OVERBOUGHT":"AWAIT_TREND_CONFIRMATION";}
 else if(last.c>s50&&s20>s50){signal="WATCH";reason="PULLBACK_WATCH";}
 const score=round(Math.max(0,Math.min(100,50+(last.c>s50?15:-15)+
  (s20>s50?12:-12)+(s20>oldS20?8:-8)+(r14>=45&&r14<=70?10:-5)+
  (momentum>0?5:-5))),0);
 const halal=halalStatus(row,last.d);
 if(signal==="BUY"&&halal!=="VERIFIED_HALAL"){
  signal="WATCH";reason="SHARIAH_SCREEN_NOT_CURRENT_FOR_BUY";
 }
 if(row.statusOnly===true){signal="NO_SIGNAL";reason="ARCHIVE_SCREENING_ONLY";}
 const entryLow=round(Math.max(0.01,s20-0.5*a14));
 const entryHigh=round(s20+0.25*a14);
 const stop=round(Math.max(0.01,Math.min(s50-0.65*a14,s20-1.5*a14,last.c-1.3*a14)));
 const target=round(last.c+2.5*a14);
 const rr=stop<entryHigh?round((target-entryHigh)/(entryHigh-stop),2):null;
 const entryAcceptable=last.c<=entryHigh+0.8*a14;
 if(signal==="BUY"&&(!entryAcceptable||!number(rr)||rr<1.6)){
  signal="WATCH";reason="ENTRY_OR_REWARD_RISK_NOT_CONFIRMED";
 }
 const pct=(last.c/prev.c-1)*100;
 return {ticker:row.ticker,company:row.company||row.ticker,exchange:row.exchange||"UNKNOWN",
   currency:row.nativeCurrency||"USD",technicalSignal:signal,status:"OK",sessionDate:last.d,
   close:round(last.c),changePct:round(pct),score,entryLow,entryHigh,stop,target,
   riskReward:rr,rsi:round(r14,1),atr:round(a14),sma20:round(s20),sma50:round(s50),
   reasons:[reason,slope>0?"SMA20_RISING":"SMA20_NOT_RISING",
    momentum>0?"POSITIVE_LAST_SESSION":"NONPOSITIVE_LAST_SESSION"],
   feed,shariah:halal,
   archivedReportAction:String(row.action||"NOT RATED").slice(0,160),
   reportUrl:typeof row.reportPath==="string"?row.reportPath:null};
}
export function makeDailyReport(rows,history,asOf=new Date().toISOString()){
 if(!Array.isArray(rows)||!history||typeof history!=="object")throw Error("Invalid report inputs");
 const usDate=new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",
  year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(asOf));
 const seen=new Set(),all=[];
 for(const row of rows){
  if(!row||!(/^[A-Z0-9][A-Z0-9.-]{0,24}$/.test(row.ticker||""))||seen.has(row.ticker))continue;
  seen.add(row.ticker);
  const entry=history[row.ticker];
  all.push(evaluateDailyTicker(row,entry?.bars||[],{asOf,evaluationDay:usDate,feed:entry?.feed||null}));
  if(all.length>=120)break;
 }
 return {schemaVersion:DAILY_SIGNAL_SCHEMA,kind:"DAILY_TECHNICAL_SIGNALS",
   generatedAt:asOf,usRunDate:usDate,source:"Alpaca IEX US daily / owner-only yfinance international daily",
   execution:"RESEARCH_ONLY_NO_ORDERS",model:"EOD SMA20/SMA50 RSI14 ATR14 v1",
   count:all.length,marketDataCaution:"IEX is exchange-limited, not consolidated SIP. Yahoo values are delayed and not independently verified. Signals are technical research, not valuations or broker orders.",
   rows:all};
}
