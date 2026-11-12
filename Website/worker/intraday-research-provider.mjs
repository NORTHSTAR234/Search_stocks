// Private, opt-in Cloudflare named RPC service entrypoint.
// DO NOT enable a public route for this Worker. This module NEVER places orders.
// Example binding: name INTRADAY_RESEARCH_PROVIDER; entrypoint IntradayResearchProvider.
import {WorkerEntrypoint} from "cloudflare:workers";
import {evaluateIntradaySignal} from "../lib/intraday-signals.mjs";
import {summarizeNewsRisk} from "../lib/news-risk.mjs";
import {runIntradayCredentialProbe} from "./intraday-readonly-probe.mjs";

const allow=new Set(["MU","NVDA","AMD","AAPL"]);
const mappings={MU:"SOXX",NVDA:"SOXX",AMD:"SOXX",AAPL:"SPY"};
const MS5=300000,MAX_RESPONSE=2000000;
const allowedSymbol=s=>allow.has(s);
const formattedParts=ts=>{
  const fields=new Intl.DateTimeFormat("en-GB",{timeZone:"America/New_York",year:"numeric",
    month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"})
    .formatToParts(new Date(ts));
  const p=Object.fromEntries(fields.map(x=>[x.type,x.value]));
  return {day:p.year+"-"+p.month+"-"+p.day,clock:p.hour+":"+p.minute};
};
function grouped(raw,asOf){
  const sessions={};
  for(const bar of Array.isArray(raw)?raw:[]){
    if(!bar||typeof bar.t!=="string"||!Number.isFinite(Date.parse(bar.t)))continue;
    if(Date.parse(bar.t)+MS5>Date.parse(asOf))continue; // no unfinished future bars
    const {day,clock}=formattedParts(bar.t);
    if(clock<"09:30"||clock>"15:55")continue;
    (sessions[day]??=[]).push(bar);
  }
  for(const rows of Object.values(sessions))rows.sort((a,b)=>a.t.localeCompare(b.t));
  return sessions;
}
async function alpacaJson(path,parameters,env){
  if(!env.ALPACA_API_KEY_ID||!env.ALPACA_SECRET_KEY)
    throw Error("ALPACA_SECRETS_MISSING");
  const url=new URL("https://data.alpaca.markets"+path);
  for(const [k,v] of Object.entries(parameters))url.searchParams.set(k,String(v));
  const r=await fetch(url.toString(),{headers:{
    "APCA-API-KEY-ID":env.ALPACA_API_KEY_ID,"APCA-API-SECRET-KEY":env.ALPACA_SECRET_KEY,
    "Accept":"application/json"},signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw Error(r.status===429?"UPSTREAM_RATE_LIMIT":r.status===403?
    "UPSTREAM_ENTITLEMENT":"UPSTREAM_UNAVAILABLE");
  const str=await r.text();
  if(str.length>MAX_RESPONSE)throw Error("UPSTREAM_RESPONSE_TOO_LARGE");
  try{return JSON.parse(str);}catch{throw Error("UPSTREAM_BAD_JSON");}
}
async function barsFor(symbols,now,env){
  const base={symbols:symbols.join(","),timeframe:"5Min",feed:"iex",
    adjustment:"raw",sort:"asc",limit:10000,start:new Date(now-18*86400000).toISOString(),
    end:new Date(now).toISOString()};
  const all=Object.fromEntries(symbols.map(s=>[s,[]]));
  let page=null;
  for(let k=0;k<3;k++){
    const resp=await alpacaJson("/v2/stocks/bars",
      page?{...base,page_token:page}:base,env);
    if(!resp?.bars||typeof resp.bars!=="object")throw Error("MISSING_BAR_DATA");
    for(const s of symbols){
      if(Array.isArray(resp.bars[s])){
        all[s].push(...resp.bars[s]);
        if(all[s].length>4000)throw Error("BAR_LIMIT_EXCEEDED");
      }
    }
    page=resp.next_page_token;
    if(!page)return all;
  }
  throw Error("BAR_PAGINATION_INCOMPLETE");
}
async function newsFor(symbols,now,env){
  const base={symbols:symbols.join(","),sort:"desc",limit:50,include_content:false,
    start:new Date(now-48*3600000).toISOString(),end:new Date(now).toISOString()};
  const items=[];
  let page=null;
  for(let k=0;k<2;k++){
    const resp=await alpacaJson("/v1beta1/news",page?{...base,page_token:page}:base,env);
    if(!Array.isArray(resp?.news))throw Error("MISSING_NEWS_DATA");
    items.push(...resp.news);
    page=resp.next_page_token;
    if(!page)return {articles:items,complete:true};
  }
  return {articles:items,complete:false}; // no "no risk" claim on partial feed
}
export class IntradayResearchProvider extends WorkerEntrypoint {
  async snapshot(tickers){
    if(this.env.INTRADAY_RESEARCH_ENABLED!=="read_only")
      return {status:"NOT_ACTIVE",reason:"RESEARCH_FLAG_DISABLED"};
    if(!Array.isArray(tickers)||!tickers.length||tickers.length>2||
       new Set(tickers).size!==tickers.length||!tickers.every(allowedSymbol))
      return {status:"INVALID_SYMBOLS"};
    const now=Date.now(),asOf=new Date(now).toISOString();
    const instruments=[...new Set([...tickers,...tickers.map(t=>mappings[t]),"QQQ"])];
    const [bars,news]=await Promise.allSettled([
      barsFor(instruments,now,this.env),newsFor(tickers,now,this.env)
    ]);
    // A failed NEWS feed blocks technical candidates, even if prices succeeded.
    // If news succeeded and bars failed, still show attributable risk reports.
    // Never promote the absence of bars/news to a bullish signal.
    if(news.status!=="fulfilled")
      return {status:"DATA_UNAVAILABLE",asOf,
        reasons:[bars.status!=="fulfilled"?"BARS_UNAVAILABLE":null,
          "NEWS_UNAVAILABLE"].filter(Boolean),signals:[]};
    const barsReady=bars.status==="fulfilled";
    const sessions=Object.fromEntries(instruments.map(s=>[
      s,barsReady?grouped(bars.value[s],asOf):{}
    ]));
    const today=formattedParts(asOf).day;
    const results=[];
    for(const ticker of tickers){
      const sector=mappings[ticker];
      const historicalDays=Object.keys(sessions[ticker]).filter(d=>d<today).sort()
        .slice(-5).map(day=>({day,feed:"IEX",bars:sessions[ticker][day]}));
      const newsView=summarizeNewsRisk(news.value.articles,ticker,asOf);
      const r=barsReady?evaluateIntradaySignal({ticker,asOf,feed:"IEX",sectorFeed:"IEX",
        broadFeed:"IEX",bars:sessions[ticker][today]||[],
        sectorBars:sessions[sector][today]||[],broadBars:sessions.QQQ[today]||[],
        historicalDays,events:newsView.events}):
        newsView.events.length?evaluateIntradaySignal({ticker,asOf,events:newsView.events}):
        {ticker,signal:"NO_DATA",asOf,reasonCodes:["BARS_UNAVAILABLE"],
          features:{},execution:"RESEARCH_ONLY_NOT_EXECUTABLE",validated:false};
      // Even if a keyword matched, a partial news feed is not safe for candidate generation.
      const partial=!news.value.complete;
      const isCandidate=["BUY_CANDIDATE","SELL_RISK"].includes(r.signal);
      const effective=partial&&isCandidate?{
        ...r,signal:"NO_DATA",reasonCodes:["PARTIAL_NEWS_COVERAGE"],
        triggerPrice:null,invalidationPrice:null}:r;
      const currentBars=sessions[ticker][today]||[];
      const last=currentBars.at(-1);
      results.push({ticker,assessment:effective,marketData:{
        feed:"IEX",currency:"USD",observationAsOf:last?.t||null,
        lagMinutes:last?Math.max(0,Math.round((now-Date.parse(last.t)-MS5)/60000)):null,
        priorCompleteSessions:historicalDays.length,
        barsAvailable:barsReady},
        newsCoverage:partial?"PARTIAL":"SAMPLED",
        riskHeadlines:newsView.events.map(e=>({
          headline:e.headline,publishedAt:e.publishedAt,verification:"reported",
          riskCode:e.riskCode,url:e.sourceUrl})).slice(0,5)});
    }
    return {status:"RESEARCH_ONLY",asOf,feed:"IEX",
      validated:false,execution:"RESEARCH_ONLY_NOT_EXECUTABLE",
      note:"Five-minute observation and sampled news: not a live trading instruction",
      sourceStatus:barsReady?"BARS_AND_NEWS":"NEWS_ONLY_BAR_FEED_UNAVAILABLE",
      signals:results};
  }
}
// No public HTTP data access, even if workers.dev is accidentally enabled.
export default {
  fetch(){return new Response("Not found",{status:404});},
  async scheduled(controller,env){
    // Deliberately one-shot. Never scheduled in ordinary deployments.
    // The investment-signal feature stays DISABLED even during this probe.
    if(env.INTRADAY_RESEARCH_ENABLED!=="disabled"||
      env.INTRADAY_DIAGNOSTIC_MODE!=="armed_20261112"||
      !env.PROBE_RESULTS)return;
    const key="intraday-smoke-20261112";
    if(await env.PROBE_RESULTS.get(key))return;
    await env.PROBE_RESULTS.put(key,JSON.stringify({status:"STARTED"}),
      {expirationTtl:3600});
    const result=await runIntradayCredentialProbe(env);
    // The helper exports only API success/failure codes, row counts, and times.
    await env.PROBE_RESULTS.put(key,JSON.stringify({status:"COMPLETE",...result}),
      {expirationTtl:86400});
  }
};
