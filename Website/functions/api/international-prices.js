import { authenticatedOwner } from "./prices.js";
// Owner-only EODHD delayed quotes. Provider key stays in FRED Worker encrypted secrets.
const expected=Object.freeze({
 "ORG":{symbol:"ORG.AU",currency:"AUD",exchange:"ASX"},
 "APA.AX":{symbol:"APA.AU",currency:"AUD",exchange:"ASX"},
 "1519.TW":{symbol:"1519.TW",currency:"TWD",exchange:"TWSE"},
 "2330.TW":{symbol:"2330.TW",currency:"TWD",exchange:"TWSE"},
 "2377.TW":{symbol:"2377.TW",currency:"TWD",exchange:"TWSE"},
 "2379.TW":{symbol:"2379.TW",currency:"TWD",exchange:"TWSE"},
 "2383.TW":{symbol:"2383.TW",currency:"TWD",exchange:"TWSE"},
 "2449.TW":{symbol:"2449.TW",currency:"TWD",exchange:"TWSE"},
 "2454.TW":{symbol:"2454.TW",currency:"TWD",exchange:"TWSE"},
 "3034.TW":{symbol:"3034.TW",currency:"TWD",exchange:"TWSE"},
 "CBHB":{symbol:"0339.KLSE",currency:"MYR",exchange:"BURSA"}
});
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"private, no-store","x-content-type-options":"nosniff"}});
export function validateInternationalQuote(ticker,quote,now=Date.now()){
 const listing=expected[ticker];
 if(!listing||!quote||typeof quote!=="object")return null;
 const price=Number(quote.price),observedAt=Date.parse(quote.asOf);
 if(!Number.isFinite(price)||price<=0||!Number.isFinite(observedAt)||
    observedAt>now+120000||now-observedAt>7*86400000||
    quote.providerSymbol!==listing.symbol||quote.currency!==listing.currency||
    quote.exchange!==listing.exchange||quote.feed!=="EODHD"||
    quote.session!=="delayed"||quote.change24hPercent!==null)return null;
 const change=quote.previousCloseChangePercent;
 const previous=typeof quote.previousClose==="number"&&Number.isFinite(quote.previousClose)&&quote.previousClose>0?quote.previousClose:null;
 const previousPercent=typeof change==="number"&&Number.isFinite(change)&&Math.abs(change)<=1000&&
   previous!==null&&Math.abs((price/previous-1)*100-change)<=0.35?change:null;
 return {price,currency:listing.currency,asOf:quote.asOf,feed:"EODHD",session:"delayed",
   providerSymbol:listing.symbol,sessionScope:"regular",adjustment:"raw",
   change24hPercent:null,reference24hAsOf:null,
   previousClose:previous,previousCloseChangePercent:previousPercent};
}
export async function onRequestGet({request,env}){
 if(!env.INTERNATIONAL_PRICE_PROVIDER||!env.ACCESS_TEAM_DOMAIN||!env.ACCESS_AUD||!env.OWNER_EMAIL)
   return reply({error:"INTERNATIONAL_PROVIDER_NOT_CONFIGURED",quotes:{}},503);
 if(!(await authenticatedOwner(request,env)))return reply({error:"NOT_AUTHORIZED",quotes:{}},403);
 const url=new URL(request.url);
 const symbols=(url.searchParams.get("symbols")||"").split(",").map(x=>x.trim().toUpperCase());
 if(!symbols.length||symbols.length>11||new Set(symbols).size!==symbols.length||
    symbols.some(x=>!Object.hasOwn(expected,x)))return reply({error:"INVALID_SYMBOLS",quotes:{}},400);
 try{
  const upstream=new URL("https://price-provider.internal/international");
  upstream.searchParams.set("symbols",symbols.join(","));
  const response=await env.INTERNATIONAL_PRICE_PROVIDER.fetch(new Request(upstream.toString(),{
    method:"GET",headers:{"accept":"application/json"}
  }));
  if(!response.ok)return reply({error:"INTERNATIONAL_PROVIDER_UNAVAILABLE",quotes:{}},503);
  const data=await response.json();
  if(!data||typeof data.quotes!=="object")return reply({error:"INVALID_PROVIDER_RESPONSE",quotes:{}},503);
  const quotes={};
  for(const symbol of symbols){
   const q=validateInternationalQuote(symbol,data.quotes[symbol]);
   if(q)quotes[symbol]=q;
  }
  return reply({quotes,source:"EODHD",verified:Object.keys(quotes).length,
    unavailable:symbols.filter(x=>!quotes[x])});
 }catch{return reply({error:"INTERNATIONAL_PROVIDER_UNAVAILABLE",quotes:{}},503);}
}
