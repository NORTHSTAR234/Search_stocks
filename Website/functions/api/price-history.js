// Owner-only 1-month Alpaca IEX daily bar gateway. No API secrets reach browser.
import {authenticatedOwner} from "./prices.js";
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
export function validateSeries(raw,now=Date.now()){
  if(!raw||raw.feed!=="IEX"||raw.currency!=="USD"||raw.adjustment!=="raw"||raw.timeframe!=="1Day"||!Array.isArray(raw.bars)||!raw.bars.length||raw.bars.length>32)return null;
  const dates=new Set(),bars=[];
  for(const b of raw.bars){
    const t=Date.parse(b?.asOf),p=Number(b?.close),d=b?.date;
    if(!Number.isFinite(t)||t>now+120000||now-t>35*86400000||!Number.isFinite(p)||p<=0||typeof d!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(d)||dates.has(d))return null;
    dates.add(d);bars.push({date:d,asOf:new Date(t).toISOString(),close:p});
  }
  bars.sort((a,b)=>a.date.localeCompare(b.date));
  return {feed:"IEX",currency:"USD",adjustment:"raw",timeframe:"1Day",bars};
}
export async function onRequestGet({request,env}){
  if(!env.PRICE_PROVIDER||!env.ACCESS_TEAM_DOMAIN||!env.ACCESS_AUD||!env.OWNER_EMAIL)return json({error:"PRICE_INTEGRATION_NOT_CONFIGURED",series:{}},503);
  if(!(await authenticatedOwner(request,env)))return json({error:"NOT_AUTHORIZED",series:{}},403);
  const symbols=(new URL(request.url).searchParams.get("symbols")||"").split(",").map(s=>s.trim().toUpperCase()).filter(Boolean);
  if(!symbols.length||symbols.length>40||new Set(symbols).size!==symbols.length||symbols.some(s=>!/^[A-Z][A-Z0-9.-]{0,11}$/.test(s)))return json({error:"INVALID_SYMBOLS",series:{}},400);
  try{
    const upstream=new URL("https://price-provider.internal/history");
    upstream.searchParams.set("symbols",symbols.join(","));
    const response=await env.PRICE_PROVIDER.fetch(new Request(upstream.toString(),{method:"GET",headers:{"Accept":"application/json"}}));
    if(!response.ok)return json({error:"HISTORY_PROVIDER_UNAVAILABLE",upstreamStatus:response.status,series:{}},503);
    const data=await response.json(),series={};
    for(const s of symbols){const validated=validateSeries(data?.series?.[s]);if(validated)series[s]=validated;}
    return json({series,source:"Alpaca IEX raw daily closes",updatedAt:data?.updatedAt||null});
  }catch{return json({error:"HISTORY_PROVIDER_SERVICE_ERROR",series:{}},503);}
}
