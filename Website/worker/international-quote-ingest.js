// Personal read-only market-data cache. No GET route and no public quote access.
// Accepts signed OIDC tokens ONLY from the exact production GitHub Actions
// workflow on main. No long-lived GitHub or Cloudflare secret is needed.
const AUDIENCE = "search-stocks-personal-yfinance-v1";
const ISSUER = "https://token.actions.githubusercontent.com";
const REPOSITORY = "NORTHSTAR234/Search_stocks";
const REPOSITORY_ID = "1446841331";
const REF = "refs/heads/main";
const WORKFLOW_REF = REPOSITORY + "/.github/workflows/refresh-international-prices.yml@" + REF;
const reply = (value,status=200) => new Response(JSON.stringify(value),{
  status,headers:{"Content-Type":"application/json; charset=utf-8",
  "Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}
});
function decoded(s) {
  const bytes=Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(s.length/4)*4,"=")),x=>x.charCodeAt(0));
  return bytes;
}
async function verifyGithubOIDC(token) {
  if(typeof token!=="string"||token.length>12000)return false;
  const parts=token.split(".");
  if(parts.length!==3)return false;
  let header,claims;
  try {
    header=JSON.parse(new TextDecoder().decode(decoded(parts[0])));
    claims=JSON.parse(new TextDecoder().decode(decoded(parts[1])));
  }catch{return false;}
  const now=Math.floor(Date.now()/1000);
  if(header.alg!=="RS256"||!header.kid||typeof header.kid!=="string"||
    claims.iss!==ISSUER||claims.aud!==AUDIENCE||
    claims.repository!==REPOSITORY||String(claims.repository_id)!==REPOSITORY_ID||
    claims.ref!==REF||claims.sub!=="repo:NORTHSTAR234@349787488/Search_stocks@1446841331:ref:"+REF||
    claims.workflow_ref!==WORKFLOW_REF||
    !["schedule","workflow_dispatch","push"].includes(claims.event_name)||
    !Number.isInteger(claims.exp)||claims.exp<=now||
    !Number.isInteger(claims.iat)||claims.iat>now+60||now-claims.iat>900||
    typeof claims.nbf==="number"&&claims.nbf>now+60)return false;
  try {
    const response=await fetch(ISSUER+"/.well-known/jwks",{
      headers:{"Accept":"application/json"},redirect:"manual"});
    if(!response.ok)return false;
    const doc=await response.json();
    const key=doc.keys?.find(k=>k.kid===header.kid&&k.kty==="RSA"&&(!k.alg||k.alg==="RS256"));
    if(!key)return false;
    const cryptoKey=await crypto.subtle.importKey("jwk",key,
      {name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
    return crypto.subtle.verify("RSASSA-PKCS1-v1_5",cryptoKey,decoded(parts[2]),
      new TextEncoder().encode(parts[0]+"."+parts[1]));
  }catch{return false;}
}
/* Actual one-month Yahoo 1h closes are only accepted for the already verified
   exact quote identity. Reject stale, future or synthetic history points. */
function cleanHourly(raw,q,now){
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||
    raw.feed!=="YFINANCE_YAHOO_1H_BAR_DELAYED"||raw.interval!=="1h"||
    raw.sourceSymbol!==q.sourceSymbol||raw.currency!==q.currency||
    raw.exchange!==q.exchange||!Array.isArray(raw.bars)||
    raw.bars.length<2||raw.bars.length>200)return null;
  const bars=[];let previous=-Infinity;
  for(const point of raw.bars){
    if(!Array.isArray(point)||point.length!==2||
       !Number.isInteger(point[0])||
       point[0]*1000>now+120000||point[0]*1000<now-35*86400000||
       point[0]<=previous||
       typeof point[1]!=="number"||!Number.isFinite(point[1])||
       point[1]<=0||point[1]>1e9)return null;
    previous=point[0];bars.push([point[0],point[1]]);
  }
  return {feed:"YFINANCE_YAHOO_1H_BAR_DELAYED",interval:"1h",
    sourceSymbol:q.sourceSymbol,exchange:q.exchange,currency:q.currency,bars};
}
/* Verified weekly Yahoo closes for a 1Y chart, never generated in browser. */
function cleanAnnual(raw,q,now){
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||
    raw.feed!=="YFINANCE_YAHOO_1W_BAR_DELAYED"||raw.interval!=="1wk"||
    raw.sourceSymbol!==q.sourceSymbol||raw.currency!==q.currency||
    raw.exchange!==q.exchange||!Array.isArray(raw.bars)||
    raw.bars.length<2||raw.bars.length>64)return null;
  const bars=[];let previous=-Infinity;
  for(const point of raw.bars){
    if(!Array.isArray(point)||point.length!==2||
       !Number.isInteger(point[0])||
       point[0]*1000>now+120000||point[0]*1000<now-380*86400000||
       point[0]<=previous||
       typeof point[1]!=="number"||!Number.isFinite(point[1])||
       point[1]<=0||point[1]>1e9)return null;
    previous=point[0];bars.push([point[0],point[1]]);
  }
  return {feed:"YFINANCE_YAHOO_1W_BAR_DELAYED",interval:"1wk",
    sourceSymbol:q.sourceSymbol,exchange:q.exchange,currency:q.currency,bars};
}
export function cleanQuote(ticker,q,now) {
  if(!/^[A-Z0-9][A-Z0-9.-]{0,18}\.(?:[A-Z]{2,12}|T)$/.test(ticker)||
    !q||typeof q!=="object"||Array.isArray(q)||typeof q.exchange!=="string"||
    !/^[A-Z0-9]{2,12}$/.test(q.exchange)||
    typeof q.sourceSymbol!=="string"||!/^[-A-Z0-9.^]{1,25}$/.test(q.sourceSymbol)||
    // A canonical archive suffix might be the Yahoo country suffix rather than
    // the ISO exchange abbreviation: SU.PA is XPAR, not "PA".
    !(ticker.endsWith("."+q.exchange)||ticker===q.sourceSymbol||
      // Stockholm canonical archive .STO differs from Yahoo .ST; require
      // exact shared class/base identifier and verified XSTO exchange.
      (q.exchange==="XSTO"&&ticker.endsWith(".STO")&&
       q.sourceSymbol===ticker.replace(/\.STO$/,".ST")))||
    // Only Tokyo's exact native JPY listing may use the single-letter .T suffix.
    (ticker.endsWith(".T")&&(q.exchange!=="TSE"||q.currency!=="JPY"||
      q.sourceSymbol!==ticker))||
    typeof q.currency!=="string"||!/^[A-Z]{3}$/.test(q.currency)||
    typeof q.price!=="number"||!Number.isFinite(q.price)||q.price<=0||
    !Number.isFinite(Date.parse(q.asOf))||Date.parse(q.asOf)>now+120000||
    now-Date.parse(q.asOf)>8*86400000||
    q.feed!=="YFINANCE_YAHOO_5M_BAR_DELAYED")return null;
  const prev=(typeof q.previousClose==="number"&&Number.isFinite(q.previousClose)&&q.previousClose>0)?q.previousClose:null;
  const normalized={price:q.price,currency:q.currency,asOf:new Date(q.asOf).toISOString(),
    exchange:q.exchange,sourceSymbol:q.sourceSymbol,
    feed:"YFINANCE_YAHOO_5M_BAR_DELAYED",previousClose:prev,
    previousCloseChangePercent:prev===null?null:Math.round((q.price/prev-1)*100000)/1000};
  const hourly=cleanHourly(q.hourly,normalized,now);
  if(hourly)normalized.hourly=hourly;
  const annual=cleanAnnual(q.annual,normalized,now);
  if(annual)normalized.annual=annual;
  return normalized;
}
export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    if(request.method!=="POST"||url.pathname!=="/ingest")
      return reply({error:"NOT_FOUND"},404);
    if(!env.INTERNATIONAL_QUOTES)return reply({error:"CACHE_NOT_CONFIGURED"},503);
    const header=request.headers.get("Authorization")||"";
    if(!header.startsWith("Bearer ")||!(await verifyGithubOIDC(header.slice(7))))
      return reply({error:"UNAUTHORIZED"},403);
    if(Number(request.headers.get("Content-Length")||0)>200000)
      return reply({error:"OVERSIZED_PAYLOAD"},413);
    let data;
    try {data=await request.json();}catch{return reply({error:"INVALID_JSON"},400);}
    const now=Date.now();
    if(data?.schemaVersion!==1||data?.source!=="yfinance"||
      !Number.isFinite(Date.parse(data.collectedAt))||
      Math.abs(now-Date.parse(data.collectedAt))>600000||
      !data.quotes||typeof data.quotes!=="object"||Array.isArray(data.quotes)||
      Object.keys(data.quotes).length>250)return reply({error:"INVALID_PAYLOAD"},400);
    const incoming={};
    for(const [ticker,raw] of Object.entries(data.quotes)) {
      const quote=cleanQuote(ticker,raw,now);
      if(quote)incoming[ticker]=quote;
    }
    if(!Object.keys(incoming).length)return reply({error:"NO_VALID_QUOTE"},422);
    let prior={};
    try{prior=await env.INTERNATIONAL_QUOTES.get("latest","json")||{};}catch{}
    const existing=(prior.quotes&&typeof prior.quotes==="object")?prior.quotes:{};
    const all={...existing};
    for(const [ticker,q] of Object.entries(incoming)) {
      const old=all[ticker];
      if(!old||Date.parse(q.asOf)>=Date.parse(old.asOf||0)){
        // A 5-minute quote collection may occur between hourly chart loads.
        // Retain only valid history for the SAME provider, market and currency.
        if(old&&old.sourceSymbol===q.sourceSymbol&&
           old.exchange===q.exchange&&old.currency===q.currency){
          if(!q.hourly){
            const kept=cleanHourly(old.hourly,q,now);
            if(kept)q.hourly=kept;
          }
          if(!q.annual){
            const kept=cleanAnnual(old.annual,q,now);
            if(kept)q.annual=kept;
          }
        }
        all[ticker]=q;
      }
    }
    // Bound retained size; remove entries older than eight days.
    for(const [ticker,q] of Object.entries(all))
      if(!Number.isFinite(Date.parse(q.asOf))||now-Date.parse(q.asOf)>8*86400000)delete all[ticker];
    try {
      await env.INTERNATIONAL_QUOTES.put("latest",JSON.stringify({
        schemaVersion:1,updatedAt:new Date(now).toISOString(),quotes:all
      }));
    }catch{return reply({error:"CACHE_WRITE_FAILED"},503);}
    return reply({status:"UPDATED",accepted:Object.keys(incoming).length,total:Object.keys(all).length});
  }
};
