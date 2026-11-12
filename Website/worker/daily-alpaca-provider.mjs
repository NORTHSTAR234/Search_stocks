// Private named RPC on the pre-existing Alpaca-secret Worker. US IEX daily bars only.
// No public fetch route, no brokerage endpoints, no keys returned or logged.
import {WorkerEntrypoint} from "cloudflare:workers";
const origin="https://data.alpaca.markets";
const NY="America/New_York";
const nyDate=t=>new Intl.DateTimeFormat("en-CA",{timeZone:NY,year:"numeric",
 month:"2-digit",day:"2-digit"}).format(new Date(t));
const allowed=x=>typeof x==="string"&&/^[A-Z][A-Z0-9.-]{0,11}$/.test(x)&&
 !x.includes(".");
export class DailyHistoryProvider extends WorkerEntrypoint {
 async usBars(symbols){
  if(!Array.isArray(symbols)||!symbols.length||symbols.length>40||
      new Set(symbols).size!==symbols.length||!symbols.every(allowed))
    return {status:"INVALID_SYMBOLS"};
  const env=this.env;
  if(!env?.ALPACA_API_KEY_ID||!env?.ALPACA_SECRET_KEY)
    return {status:"DATA_UNAVAILABLE",error:"CREDENTIALS_NOT_CONFIGURED"};
  const now=Date.now(),start=new Date(now-350*86400000).toISOString();
  const data=Object.fromEntries(symbols.map(s=>[s,[]]));
  let token=null;
  for(let page=0;page<3;page++){
   const u=new URL(origin+"/v2/stocks/bars");
   const args={symbols:symbols.join(","),timeframe:"1Day",feed:"iex",
    sort:"asc",adjustment:"split",start,end:new Date(now).toISOString(),limit:"10000"};
   if(token)args.page_token=token;
   for(const [key,val] of Object.entries(args))u.searchParams.set(key,String(val));
   let json;
   try{
    const r=await fetch(u.toString(),{method:"GET",headers:{
     "APCA-API-KEY-ID":env.ALPACA_API_KEY_ID,
     "APCA-API-SECRET-KEY":env.ALPACA_SECRET_KEY,
     "Accept":"application/json"},signal:AbortSignal.timeout(18000)});
    if(!r.ok)return {status:"DATA_UNAVAILABLE",error:r.status===429?
     "RATE_LIMIT":r.status===403?"DATA_NOT_ENTITLED":r.status===401?
     "CREDENTIALS_REJECTED":"UPSTREAM_UNAVAILABLE"};
    const body=await r.text();
    if(body.length>4500000)return {status:"DATA_UNAVAILABLE",error:"OVERSIZED_UPSTREAM"};
    json=JSON.parse(body);
   }catch{return {status:"DATA_UNAVAILABLE",error:"UPSTREAM_NETWORK_OR_JSON_ERROR"};}
   if(!json?.bars||typeof json.bars!=="object")return {status:"DATA_UNAVAILABLE",error:"INVALID_BAR_SCHEMA"};
   for(const sym of symbols){
    const bars=json.bars[sym];
    if(!Array.isArray(bars))continue;
    for(const b of bars){
      if(!b?.t||!Number.isFinite(Date.parse(b.t))||!["o","h","l","c","v"].every(x=>
       typeof b[x]==="number"&&Number.isFinite(b[x])))continue;
      data[sym].push({d:nyDate(b.t),o:b.o,h:b.h,l:b.l,c:b.c,v:b.v});
    }
    if(data[sym].length>1000)return {status:"DATA_UNAVAILABLE",error:"TOO_MANY_BARS"};
   }
   token=json.next_page_token;
   if(!token)break;
   if(page===2)return {status:"DATA_UNAVAILABLE",error:"PAGINATION_INCOMPLETE"};
  }
  return {status:"OK",feed:"ALPACA_IEX_DAILY_SPLIT_ADJUSTED",
    asOf:new Date().toISOString(),symbols:data};
 }
}
