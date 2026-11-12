// Cloudflare private scheduled daily research - NO brokerage access and NO public endpoint.
// Runs once after all tracked exchanges and US regular session close (22:50 UTC, Mon-Fri).
// Source portfolio list is the public report manifest, NOT account/position data.
import {WorkerEntrypoint} from "cloudflare:workers";
import {makeDailyReport} from "../lib/daily-signals.mjs";
const MANIFEST_URL="https://raw.githubusercontent.com/NORTHSTAR234/Search_stocks/main/Website/live-reports.json";
const FALLBACK=[{"ticker":"MU","company":"Micron Technology, Inc.","exchange":"US","nativeCurrency":"USD","sourceMarketTicker":"MU","musaffaClassification":"HALAL","musaffaGate":"PASS","musaffaAssessment":"GREEN_VERIFIED_HALAL","musaffaScreeningDate":"2026-10-03","musaffaScreeningPeriod":"FY2026 annual report","statusOnly":false,"action":"WATCH","reportPath":"/view-report?path=halal%2FMU%2FMU_2026-11-12_03-36-35Z.html"},{"ticker":"AMD","company":"Advanced Micro Devices, Inc.","exchange":"US","nativeCurrency":"USD","sourceMarketTicker":"AMD","musaffaClassification":"HALAL","musaffaGate":"PASS","musaffaAssessment":"GREEN_VERIFIED_HALAL","musaffaScreeningDate":"2026-08-07","musaffaScreeningPeriod":"2026 Q2","statusOnly":false,"action":"WATCH","reportPath":"/view-report?path=halal%2FAMD%2FAMD_2026-11-12_01-41-55Z.html"},{"ticker":"NVDA","company":"NVIDIA Corporation","exchange":"US","nativeCurrency":"USD","sourceMarketTicker":"NVDA","musaffaClassification":"HALAL","musaffaGate":"PASS","musaffaAssessment":"VERIFIED_HALAL","musaffaScreeningDate":"2026-09-19","musaffaScreeningPeriod":null,"statusOnly":false,"action":"WATCH","reportPath":"/view-report?path=halal%2FNVDA%2FNVDA_2026-11-12_01-24-59Z.html"},{"ticker":"2383.TWSE","company":"Elite Material Co., Ltd.","exchange":"TWSE","nativeCurrency":"TWD","sourceMarketTicker":"2383.TW","musaffaClassification":"HALAL","musaffaGate":"PASS","musaffaAssessment":"VERIFIED_HALAL","musaffaScreeningDate":null,"musaffaScreeningPeriod":"2026-10","statusOnly":false,"action":"WATCH","reportPath":"/view-report?path=halal%2F2383.TWSE%2F2383.TWSE_2026-11-11_13-14-44Z.html"},{"ticker":"2377.TWSE","company":"Micro-Star International Co., Ltd.","exchange":"TWSE","nativeCurrency":"TWD","sourceMarketTicker":"2377.TW","musaffaClassification":"HALAL","musaffaGate":"STALE","musaffaAssessment":"INCONCLUSIVE","musaffaScreeningDate":"2026-02-12","musaffaScreeningPeriod":null,"statusOnly":false,"action":"WATCH","reportPath":"/view-report?path=nonhalal%2F2377.TWSE%2F2377.TWSE_2026-11-11_13-06-04Z.html"},{"ticker":"2454.TWSE","company":"MediaTek Inc.","exchange":"TWSE","nativeCurrency":"TWD","sourceMarketTicker":"2454.TW","musaffaClassification":"HALAL","musaffaGate":"PASS","musaffaAssessment":"VERIFIED_HALAL","musaffaScreeningDate":null,"musaffaScreeningPeriod":"2026-10","statusOnly":false,"action":"WATCH","reportPath":"/view-report?path=halal%2F2454.TWSE%2F2454.TWSE_2026-11-11_13-05-57Z.html"},{"ticker":"2449.TWSE","company":"King Yuan Electronics Co., Ltd.","exchange":"TWSE","nativeCurrency":"TWD","sourceMarketTicker":"2449.TW","musaffaClassification":"HALAL","musaffaGate":"UNVERIFIED","musaffaAssessment":"INCONCLUSIVE","musaffaScreeningDate":null,"musaffaScreeningPeriod":"2026-09","statusOnly":false,"action":"WATCH","reportPath":"/view-report?path=nonhalal%2F2449.TWSE%2F2449.TWSE_2026-11-11_13-05-07Z.html"},{"ticker":"SU.PA","company":"Schneider Electric SE","exchange":"XPAR","nativeCurrency":"EUR","sourceMarketTicker":"SU.PA","musaffaClassification":"HALAL","musaffaGate":"PASS","musaffaAssessment":"VERIFIED_HALAL","musaffaScreeningDate":null,"musaffaScreeningPeriod":"2026-10","statusOnly":false,"action":"WATCH","reportPath":"/view-report?path=halal%2FSU.PA%2FSU.PA_2026-11-11_13-04-43Z.html"},{"ticker":"ASM.XAMS","company":"ASM International N.V.","exchange":"XAMS","nativeCurrency":"EUR","sourceMarketTicker":"ASM.AS","musaffaClassification":"HALAL","musaffaGate":"PASS","musaffaAssessment":"VERIFIED_HALAL","musaffaScreeningDate":"2026-11-04","musaffaScreeningPeriod":null,"statusOnly":false,"action":"WATCH","reportPath":"/view-report?path=halal%2FASM.XAMS%2FASM.XAMS_2026-11-11_13-01-25Z.html"},{"ticker":"APA.ASX","company":"APA Group","exchange":"ASX","nativeCurrency":"AUD","sourceMarketTicker":"APA.AX","musaffaClassification":null,"musaffaGate":"UNVERIFIED","musaffaAssessment":"INCONCLUSIVE","musaffaScreeningDate":null,"musaffaScreeningPeriod":null,"statusOnly":false,"action":"WATCH","reportPath":"/view-report?path=nonhalal%2FAPA.ASX%2FAPA.ASX_2026-11-11_13-00-04Z.html"},{"ticker":"LLY","company":"Eli Lilly and Company","exchange":"US","nativeCurrency":"USD","sourceMarketTicker":"LLY","musaffaClassification":"HALAL","musaffaGate":"PASS","musaffaAssessment":null,"musaffaScreeningDate":"2026-08-07","musaffaScreeningPeriod":null,"statusOnly":false,"action":"WATCH","reportPath":"/view-report?path=halal%2FLLY%2FLLY_2026-11-10_21-46-26Z.html"},{"ticker":"ABBN.SIX","company":"ABB Ltd","exchange":"SIX","nativeCurrency":"CHF","sourceMarketTicker":"ABBN.SW","musaffaClassification":"HALAL","musaffaGate":"PASS","musaffaAssessment":null,"musaffaScreeningDate":null,"musaffaScreeningPeriod":"2026-11","statusOnly":false,"action":"WATCH","reportPath":"/view-report?path=halal%2FABBN.SIX%2FABBN.SIX_2026-11-10_21-46-14Z.html"},{"ticker":"HD","company":"The Home Depot, Inc.","exchange":"US","nativeCurrency":"USD","sourceMarketTicker":"HD","musaffaClassification":"HALAL","musaffaGate":"PASS","musaffaAssessment":null,"musaffaScreeningDate":"2026-09-14","musaffaScreeningPeriod":null,"statusOnly":false,"action":"WATCH","reportPath":"/view-report?path=halal%2FHD%2FHD_2026-11-10_21-46-10Z.html"},{"ticker":"V","company":"Visa Inc.","exchange":"US","nativeCurrency":"USD","sourceMarketTicker":"V","musaffaClassification":"HALAL","musaffaGate":"PASS","musaffaAssessment":null,"musaffaScreeningDate":"2026-08-11","musaffaScreeningPeriod":null,"statusOnly":false,"action":"WATCH","reportPath":"/view-report?path=halal%2FV%2FV_2026-11-10_21-45-49Z.html"},{"ticker":"JNJ","company":"Johnson & Johnson","exchange":"US","nativeCurrency":"USD","sourceMarketTicker":"JNJ","musaffaClassification":"HALAL","musaffaGate":"PASS","musaffaAssessment":null,"musaffaScreeningDate":"2026-08-04","musaffaScreeningPeriod":null,"statusOnly":false,"action":"WATCH","reportPath":"/view-report?path=halal%2FJNJ%2FJNJ_2026-11-10_21-45-27Z.html"},{"ticker":"PG","company":"The Procter & Gamble Company","exchange":"US","nativeCurrency":"USD","sourceMarketTicker":"PG","musaffaClassification":"HALAL","musaffaGate":"PASS","musaffaAssessment":null,"musaffaScreeningDate":"2026-08-10","musaffaScreeningPeriod":null,"statusOnly":false,"action":"WATCH","reportPath":"/view-report?path=halal%2FPG%2FPG_2026-11-10_21-45-15Z.html"},{"ticker":"AAPL","company":"Apple Inc.","exchange":"US","nativeCurrency":"USD","sourceMarketTicker":"AAPL","musaffaClassification":"HALAL","musaffaGate":"PASS","musaffaAssessment":null,"musaffaScreeningDate":"2026-08-20","musaffaScreeningPeriod":null,"statusOnly":false,"action":"WATCH","reportPath":"/view-report?path=halal%2FAAPL%2FAAPL_2026-11-10_21-45-01Z.html"},{"ticker":"XOM","company":"ExxonMobil Holdings Corporation","exchange":"US","nativeCurrency":"USD","sourceMarketTicker":"XOM","musaffaClassification":"HALAL","musaffaGate":"PASS","musaffaAssessment":null,"musaffaScreeningDate":"2026-08-04","musaffaScreeningPeriod":null,"statusOnly":false,"action":"WATCH","reportPath":"/view-report?path=halal%2FXOM%2FXOM_2026-11-10_21-44-59Z.html"},{"ticker":"3034.TWSE","company":"Novatek Microelectronics Corporation","exchange":"TWSE","nativeCurrency":"TWD","sourceMarketTicker":"3034.TW","musaffaClassification":"HALAL","musaffaGate":"PASS","musaffaAssessment":null,"musaffaScreeningDate":null,"musaffaScreeningPeriod":"2026-09","statusOnly":false,"action":"WATCH","reportPath":"/view-report?path=halal%2F3034.TWSE%2F3034.TWSE_2026-11-10_21-44-58Z.html"},{"ticker":"ORG.ASX","company":"Origin Energy Limited","exchange":"ASX","nativeCurrency":"AUD","sourceMarketTicker":"ORG.AX","musaffaClassification":"HALAL","musaffaGate":"PASS","musaffaAssessment":null,"musaffaScreeningDate":null,"musaffaScreeningPeriod":null,"statusOnly":false,"action":"WATCH","reportPath":"/view-report?path=halal%2FORG.ASX%2FORG.ASX_2026-11-10_21-44-40Z.html"},{"ticker":"KO","company":"The Coca-Cola Company","exchange":"US","nativeCurrency":"USD","sourceMarketTicker":"KO","musaffaClassification":"HALAL","musaffaGate":"PASS","musaffaAssessment":null,"musaffaScreeningDate":"2026-08-03","musaffaScreeningPeriod":null,"statusOnly":false,"action":"WATCH","reportPath":"/view-report?path=halal%2FKO%2FKO_2026-11-10_21-44-29Z.html"},{"ticker":"CSCO","company":"Cisco Systems, Inc.","exchange":"US","nativeCurrency":"USD","sourceMarketTicker":"CSCO","musaffaClassification":"HALAL","musaffaGate":"PASS","musaffaAssessment":null,"musaffaScreeningDate":"2026-10-07","musaffaScreeningPeriod":null,"statusOnly":false,"action":"WATCH","reportPath":"/view-report?path=halal%2FCSCO%2FCSCO_2026-11-10_21-43-30Z.html"},{"ticker":"MA","company":"Mastercard Incorporated","exchange":"US","nativeCurrency":"USD","sourceMarketTicker":"MA","musaffaClassification":"HALAL","musaffaGate":"PASS","musaffaAssessment":null,"musaffaScreeningDate":"2026-08-03","musaffaScreeningPeriod":null,"statusOnly":false,"action":"WATCH","reportPath":"/view-report?path=halal%2FMA%2FMA_2026-11-10_21-43-08Z.html"},{"ticker":"CVX","company":"Chevron Corporation","exchange":"US","nativeCurrency":"USD","sourceMarketTicker":"CVX","musaffaClassification":"HALAL","musaffaGate":"PASS","musaffaAssessment":null,"musaffaScreeningDate":"2026-08-19","musaffaScreeningPeriod":null,"statusOnly":false,"action":"WATCH","reportPath":"/view-report?path=halal%2FCVX%2FCVX_2026-11-10_21-43-03Z.html"},{"ticker":"AMAT","company":"Applied Materials, Inc.","exchange":"US","nativeCurrency":"USD","sourceMarketTicker":"AMAT","musaffaClassification":"HALAL","musaffaGate":"PASS","musaffaAssessment":null,"musaffaScreeningDate":"2026-09-14","musaffaScreeningPeriod":null,"statusOnly":false,"action":"WATCH","reportPath":"/view-report?path=halal%2FAMAT%2FAMAT_2026-11-10_21-42-44Z.html"},{"ticker":"TSLA","company":"Tesla, Inc.","exchange":"US","nativeCurrency":"USD","sourceMarketTicker":"TSLA","musaffaClassification":"HALAL","musaffaGate":"UNVERIFIED","musaffaAssessment":null,"musaffaScreeningDate":null,"musaffaScreeningPeriod":null,"statusOnly":true,"action":"SCREENING ONLY — NO INVESTMENT REPORT","reportPath":"/view-report?path=nonhalal%2FTSLA%2FTSLA_2026-11-10_21-41-55Z.html"},{"ticker":"MRK","company":"Merck & Co., Inc.","exchange":"US","nativeCurrency":"USD","sourceMarketTicker":"MRK","musaffaClassification":"HALAL","musaffaGate":"PASS","musaffaAssessment":null,"musaffaScreeningDate":"2026-08-13","musaffaScreeningPeriod":null,"statusOnly":false,"action":"WATCH","reportPath":"/view-report?path=halal%2FMRK%2FMRK_2026-11-10_21-41-51Z.html"},{"ticker":"CBHB.MYX","company":"CBH Engineering Holding Berhad","exchange":"BURSA","nativeCurrency":"MYR","sourceMarketTicker":"0339.KL","musaffaClassification":null,"musaffaGate":"UNVERIFIED","musaffaAssessment":null,"musaffaScreeningDate":null,"musaffaScreeningPeriod":null,"statusOnly":true,"action":"SCREENING ONLY — NO INVESTMENT REPORT","reportPath":"/view-report?path=nonhalal%2FCBHB.MYX%2FCBHB.MYX_2026-11-10_21-40-00Z.html"},{"ticker":"1519.TWSE","company":"Fortune Electric Co., Ltd.","exchange":"TWSE","nativeCurrency":"TWD","sourceMarketTicker":null,"musaffaClassification":"HALAL in both available versions","musaffaGate":"RECENCY UNVERIFIED","musaffaAssessment":null,"musaffaScreeningDate":null,"musaffaScreeningPeriod":null,"statusOnly":true,"action":"SCREENING ONLY — NO INVESTMENT REPORT","reportPath":"/view-report?path=nonhalal%2F1519.TWSE%2F1519.TWSE_2026-11-09_05-23-30Z.html"}];
const valid=rows=>Array.isArray(rows)&&rows.length>0&&rows.length<=120&&rows.every(r=>
 r&&typeof r.ticker==="string"&&/^[A-Z0-9][A-Z0-9.-]{0,24}$/.test(r.ticker)&&
 typeof r.exchange==="string"&&r.exchange.length<=12);
const nyDay=iso=>Object.fromEntries(new Intl.DateTimeFormat("en-GB",{
 timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"
}).formatToParts(new Date(iso)).map(x=>[x.type,x.value]));
const isoDate=iso=>{const p=nyDay(iso);return p.year+"-"+p.month+"-"+p.day};
const weekdays=date=>{const p=new Date(date+"T12:00:00Z").getUTCDay();return p>=1&&p<=5};
async function manifest(env){
 try{
  const r=await fetch(MANIFEST_URL,{method:"GET",headers:{"Accept":"application/json"},
   signal:AbortSignal.timeout(10000),cache:"no-store"});
  if(!r.ok)return {rows:FALLBACK,source:"EMBEDDED_FALLBACK"};
  const raw=await r.text();if(raw.length>350000)return {rows:FALLBACK,source:"EMBEDDED_FALLBACK"};
  const data=JSON.parse(raw);
  if(!valid(data.rows))return {rows:FALLBACK,source:"EMBEDDED_FALLBACK"};
  // Explicitly copy only allowed metadata. This public manifest is untrusted input.
  return {rows:data.rows.map(r=>({
    ticker:r.ticker,company:typeof r.company==="string"?r.company.slice(0,120):r.ticker,
    exchange:r.exchange,nativeCurrency:r.nativeCurrency,sourceMarketTicker:r.sourceMarketTicker,
    musaffaClassification:r.musaffaClassification,musaffaGate:r.musaffaGate,
    musaffaAssessment:r.musaffaAssessment,musaffaScreeningDate:r.musaffaScreeningDate,
    musaffaScreeningPeriod:r.musaffaScreeningPeriod,statusOnly:r.statusOnly,
    action:typeof r.action==="string"?r.action.slice(0,160):"NOT RATED",
    reportPath:typeof r.reportPath==="string"&&r.reportPath.startsWith("/")?r.reportPath:null
  })),source:"GITHUB_LIVE_REPORTS"};
 }catch{return {rows:FALLBACK,source:"EMBEDDED_FALLBACK"};}
}
async function internationalHistory(env){
 try{
  const raw=await env.INTERNATIONAL_QUOTES.get("daily-history","json");
  if(!raw||raw.schemaVersion!==1||raw.source!=="yfinance-daily"||
     !raw.symbols||typeof raw.symbols!=="object"||
     !Number.isFinite(Date.parse(raw.collectedAt))||
     Date.now()-Date.parse(raw.collectedAt)>8*86400000)return {};
  return raw.symbols;
 }catch{return {};}
}
async function generate(env){
 if(!env?.DAILY_STORE||!env?.US_DAILY_HISTORY||!env.INTERNATIONAL_QUOTES)
  return {status:"NOT_CONFIGURED"};
 const at=new Date().toISOString(),date=isoDate(at);
 if(!weekdays(date))return {status:"SKIPPED_WEEKEND",date};
 const tracked=await manifest(env);
 const symbols=[...new Set(tracked.rows.filter(r=>r.exchange==="US"&&
  /^[A-Z][A-Z0-9.-]{0,11}$/.test(r.ticker)&&!r.ticker.includes("."))
  .map(r=>r.ticker))];
 let us={status:"NOT_REQUESTED",symbols:{}};
 try{if(symbols.length)us=await env.US_DAILY_HISTORY.usBars(symbols);}
 catch{us={status:"DATA_UNAVAILABLE",symbols:{}};}
 const intl=await internationalHistory(env),hist={};
 for(const row of tracked.rows){
   const isUS=row.exchange==="US";
   const bars=isUS?us.symbols?.[row.ticker]:intl[row.ticker]?.bars;
   hist[row.ticker]={bars:Array.isArray(bars)?bars:[],
     feed:isUS?us.status==="OK"?"ALPACA_IEX_DAILY_SPLIT_ADJUSTED":null:
       intl[row.ticker]?.feed==="YFINANCE_DAILY_ADJUSTED"?
       "YFINANCE_DAILY_ADJUSTED":null};
 }
 const report=makeDailyReport(tracked.rows,hist,at);
 report.manifestSource=tracked.source;
 report.dataStatus={alpaca:us.status,international: Object.keys(intl).length?"AVAILABLE":"NO_RECENT_HISTORY"};
 report.signalCounts=report.rows.reduce((a,r)=>(a[r.technicalSignal]=(a[r.technicalSignal]||0)+1,a),{});
 report.ready=report.rows.some(r=>r.status==="OK");
 if(!report.ready)return {status:"NO_SUITABLE_MARKET_DATA",date,counts:report.signalCounts,
   us:us.status,manifest:tracked.source};
 // No customer data written: only research and public ticker metadata in private KV.
 await env.DAILY_STORE.put("snapshot:"+date,JSON.stringify(report),{expirationTtl:400*86400});
 const prior=await env.DAILY_STORE.get("latest","json");
 if(!prior?.usRunDate||prior.usRunDate<=date)
  await env.DAILY_STORE.put("latest",JSON.stringify(report));
 return {status:"SAVED",date,tickers:report.rows.length,counts:report.signalCounts,
   source:tracked.source,feed:us.status,generatedAt:report.generatedAt};
}
export class DailySignalsRead extends WorkerEntrypoint {
 async latest(){
  if(!this.env.DAILY_STORE)return {status:"NOT_CONFIGURED"};
  return await this.env.DAILY_STORE.get("latest","json")||
    {status:"AWAITING_FIRST_DAILY_RUN",rows:[]};
 }
 async history(limit=14){
  if(!this.env.DAILY_STORE)return [];
  const n=Number.isInteger(limit)?Math.min(40,Math.max(1,limit)):14;
  const keys=await this.env.DAILY_STORE.list({prefix:"snapshot:",limit:100});
  const names=(keys.keys||[]).map(k=>k.name).sort().reverse().slice(0,n);
  const rows=await Promise.all(names.map(async key=>{
   const r=await this.env.DAILY_STORE.get(key,"json");
   return r?{usRunDate:r.usRunDate,generatedAt:r.generatedAt,count:r.count,
     signalCounts:r.signalCounts,ready:r.ready,manifestSource:r.manifestSource}:null;
  }));
  return rows.filter(Boolean);
 }
}
export class DailySignalsRunner extends WorkerEntrypoint {
 async runOnce(purpose){
  if(purpose!=="DAILY_ACCEPTANCE_20261112"||
     this.env.DAILY_MANUAL_ARMED!=="one_shot")return {status:"NOT_ARMED"};
  return generate(this.env);
 }
}
export default {
 fetch(){return new Response("Not found",{status:404});},
 async scheduled(event,env){await generate(env);}
};
