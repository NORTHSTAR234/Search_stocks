// Owner-only, opt-in read-only intraday research access.
// An independent named Cloudflare service binding is mandatory;
// never use the existing PRICE_PROVIDER latest-trade binding as a 5m-bar feed.
import {authenticatedOwner} from "./prices.js";

const json=(payload,status=200)=>new Response(JSON.stringify(payload),{
  status,headers:{"Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
const allow=new Set(["MU","NVDA","AMD","AAPL"]);
export async function onRequestGet({request,env}){
  if(!(await authenticatedOwner(request,env)))
    return json({status:"NOT_AUTHORIZED",signals:[]},403);
  if(env.INTRADAY_RESEARCH_ENABLED!=="read_only"||
     !env.INTRADAY_RESEARCH_PROVIDER||
     typeof env.INTRADAY_RESEARCH_PROVIDER.snapshot!=="function")
    return json({status:"NOT_ACTIVE",signals:[],reason:"NOT_CONFIGURED"},503);
  const url=new URL(request.url);
  const raw=url.searchParams.get("symbols")||"";
  const tickers=raw.split(",").map(s=>s.trim().toUpperCase());
  if(!raw||tickers.length>2||tickers.length===0||
      new Set(tickers).size!==tickers.length||!tickers.every(s=>allow.has(s)))
    return json({status:"INVALID_SYMBOLS",signals:[]},400);
  try{
    const data=await env.INTRADAY_RESEARCH_PROVIDER.snapshot(tickers);
    if(!data||typeof data!=="object"||!["RESEARCH_ONLY","DATA_UNAVAILABLE","NOT_ACTIVE"].includes(data.status))
      return json({status:"DATA_UNAVAILABLE",signals:[]},503);
    if(data.status!=="RESEARCH_ONLY")return json({
      status:data.status,signals:[],reasons:Array.isArray(data.reasons)?data.reasons:[]},503);
    if(data.validated!==false||
       data.execution!=="RESEARCH_ONLY_NOT_EXECUTABLE"||
       !Array.isArray(data.signals)||data.signals.length!==tickers.length)
      return json({status:"DATA_UNAVAILABLE",signals:[]},503);
    // Metadata is for research display only and is not an order trigger.
    return json(data);
  }catch{
    return json({status:"DATA_UNAVAILABLE",signals:[]},503);
  }
}
