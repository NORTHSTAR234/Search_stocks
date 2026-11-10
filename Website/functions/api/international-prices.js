import { authenticatedOwner } from "./prices.js";

// Owner-only delayed Yahoo Finance personal quote cache.
// This endpoint NEVER requests Yahoo/EODHD and NEVER returns data without
// verifying the exact owner identity through signed Cloudflare Access JWT.
const reply=(body,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{"Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}
});
export async function onRequestGet({request,env}) {
  if(!(await authenticatedOwner(request,env)))
    return reply({error:"NOT_AUTHORIZED",quotes:{}},403);
  if(!env.INTERNATIONAL_QUOTES)
    return reply({error:"PRIVATE_INTERNATIONAL_CACHE_UNAVAILABLE",quotes:{}},503);
  try {
    const raw=await env.INTERNATIONAL_QUOTES.get("latest","json");
    if(!raw||raw.schemaVersion!==1||!raw.quotes||typeof raw.quotes!=="object")
      return reply({quotes:{},updatedAt:null,source:"private yfinance cache",status:"NOT_YET_COLLECTED"});
    const params=new URL(request.url).searchParams;
    const symbols=(params.get("symbols")||"").split(",").map(s=>s.toUpperCase().trim()).filter(Boolean);
    if(symbols.length>250||symbols.some(s=>!/^[A-Z0-9][A-Z0-9.-]{0,25}$/.test(s)))
      return reply({error:"INVALID_SYMBOLS",quotes:{}},400);
    const quotes={};
    for(const [ticker,q] of Object.entries(raw.quotes)){
      if(symbols.length&&!symbols.includes(ticker))continue;
      if(!q||typeof q.price!=="number"||!Number.isFinite(q.price)||q.price<=0||
        typeof q.asOf!=="string"||!Number.isFinite(Date.parse(q.asOf))||
        Date.parse(q.asOf)>Date.now()+120000||typeof q.currency!=="string"||
        q.feed!=="YFINANCE_YAHOO_5M_BAR_DELAYED")continue;
      quotes[ticker]=q;
    }
    return reply({quotes,updatedAt:raw.updatedAt||null,source:"private yfinance cache",status:"OK"});
  }catch {
    return reply({error:"INTERNATIONAL_CACHE_READ_FAILED",quotes:{}},503);
  }
}
