// Account-authenticated, REST-triggered research PREVIEW + prospective paper journal.
// No public URLs, live signals or brokerage orders; one request only, zero retries.
// Any BUY_CANDIDATE is informational/unvalidated, not an instruction to trade.
import {WorkflowEntrypoint} from "cloudflare:workers";
const allowed=new Set(["MU","NVDA","AMD","AAPL"]);
const statuses=new Set(["RISK_ALERT","BUY_CANDIDATE","SELL_RISK","WAIT",
  "NO_DATA","MARKET_CLOSED","EXIT_RISK","TAKE_PROFIT_REVIEW"]);
const cleanCode=x=>typeof x==="string"&&/^[A-Z][A-Z0-9_]{0,63}$/.test(x)?x:null;
const iso=x=>typeof x==="string"&&Number.isFinite(Date.parse(x))?
  new Date(x).toISOString():null;
function sanitize(raw,tickers){
  if(!raw||raw.status!=="RESEARCH_ONLY"||
    raw.validated!==false||raw.execution!=="RESEARCH_ONLY_NOT_EXECUTABLE"||
    raw.feed!=="IEX"||!iso(raw.asOf)||!Array.isArray(raw.signals)||
    raw.signals.length!==tickers.length)return {status:"NO_VALID_RESEARCH_DATA"};
  const seen=new Set(),out=[];
  for(const item of raw.signals){
    const a=item?.assessment;
    if(!item||!tickers.includes(item.ticker)||seen.has(item.ticker)||
      !statuses.has(a?.signal)||a?.validated!==false||
      a?.execution!=="RESEARCH_ONLY_NOT_EXECUTABLE"||
      !Array.isArray(a?.reasonCodes)||!item.marketData||item.marketData.feed!=="IEX")
      return {status:"NO_VALID_RESEARCH_DATA"};
    seen.add(item.ticker);
    out.push({
      ticker:item.ticker,
      // Deliberately call setups "unvalidated" to prevent a trading instruction.
      researchSignal:a.signal,
      paperOnly:true,
      unvalidated:true,
      signalId:typeof a.signalId==="string"&&/^[A-Z]{1,5}\|20\d\d-\d\d-\d\d\|\d\d:\d\d\|(?:UP|DOWN|NONE)$/.test(a.signalId)?
        a.signalId:null,
      reasonCodes:a.reasonCodes.map(cleanCode).filter(Boolean).slice(0,10),
      observedBarAt:iso(item.marketData.observationAsOf),
      feed:"IEX",
      priorCompleteSessions:Number.isInteger(item.marketData.priorCompleteSessions)?
        Math.max(0,Math.min(5,item.marketData.priorCompleteSessions)):0,
      newsCoverage:["PARTIAL","SAMPLED"].includes(item.newsCoverage)?
        item.newsCoverage:"UNKNOWN",
      // Never include raw headlines, URL, per-tick prices or any account info.
      materialReportedRiskCodes:Array.isArray(item.riskHeadlines)?
        [...new Set(item.riskHeadlines.map(x=>cleanCode(x?.riskCode)).filter(Boolean))].slice(0,5):[]
    });
  }
  return {status:"PRIVATE_RESEARCH_PREVIEW",sourceStatus:raw.sourceStatus===
      "NEWS_ONLY_BAR_FEED_UNAVAILABLE"?"NEWS_ONLY_BAR_FEED_UNAVAILABLE":"BARS_AND_NEWS",
    asOf:iso(raw.asOf),unvalidated:true,execution:"RESEARCH_ONLY_NOT_EXECUTABLE",
    feed:"IEX",signals:out};
}
export class IntradayResearchPreviewOnce extends WorkflowEntrypoint {
 async run(event,step){
   const params=event?.payload||{};
   const syms=params.symbols;
   if(params.purpose!=="private_intraday_preview_20261112"||
      !Array.isArray(syms)||!syms.length||syms.length>2||
      new Set(syms).size!==syms.length||!syms.every(x=>allowed.has(x)))
     return {status:"INVALID_PREVIEW_REQUEST"};
   return step.do("private-research-and-journal",{
     retries:{limit:0,delay:"1 second",backoff:"constant"},timeout:"75 seconds"
   },async()=>{
     let raw;
     try{raw=await this.env.PRIVATE_RESEARCH_PREVIEW.snapshot(syms);}
     catch{return {status:"DATA_UNAVAILABLE",reason:"RPC_UNAVAILABLE"};}
     if(raw?.status!=="RESEARCH_ONLY")return {
       status:["NOT_ACTIVE","DATA_UNAVAILABLE","INVALID_SYMBOLS"].includes(raw?.status)?
         raw.status:"DATA_UNAVAILABLE",
       reason:"PRIVATE_PREVIEW_NOT_READY"
     };
     const result=sanitize(raw,syms);
     if(result.status!=="PRIVATE_RESEARCH_PREVIEW")return result;
     // This is a prospective (after-not-before) record, never a retrospective P&L.
     // Only sanitized markers, zero prices/quotes/news bodies. Private KV, max 90 days.
     const records=result.signals.map(x=>({schema:"paper-research-v1",
       recordedAt:new Date().toISOString(),asOf:result.asOf,...x}));
     if(!this.env.PAPER_JOURNAL)return {status:"JOURNAL_NOT_CONFIGURED"};
     try{
       for(const record of records){
         const key="paper:"+record.asOf+":"+record.ticker;
         // Idempotent for reruns of the same observation.
         await this.env.PAPER_JOURNAL.put(key,JSON.stringify(record),{
           expirationTtl:90*86400
         });
       }
     }catch{return {status:"JOURNAL_WRITE_FAILED"};}
     return {...result,journaled:records.length,
       caution:"No price/position/order data; no trading advice or expected performance."};
   });
 }
}
export default {fetch(){return new Response("Not found",{status:404});}};
