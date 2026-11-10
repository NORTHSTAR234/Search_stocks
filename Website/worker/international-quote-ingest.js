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
    !["schedule","workflow_dispatch"].includes(claims.event_name)||
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
function cleanQuote(ticker,q,now) {
  if(!/^[A-Z0-9][A-Z0-9.-]{0,18}\.[A-Z]{2,12}$/.test(ticker)||
    !q||typeof q!=="object"||Array.isArray(q)||typeof q.exchange!=="string"||
    !ticker.endsWith("."+q.exchange)||
    typeof q.sourceSymbol!=="string"||!/^[-A-Z0-9.^]{1,25}$/.test(q.sourceSymbol)||
    typeof q.currency!=="string"||!/^[A-Z]{3}$/.test(q.currency)||
    typeof q.price!=="number"||!Number.isFinite(q.price)||q.price<=0||
    !Number.isFinite(Date.parse(q.asOf))||Date.parse(q.asOf)>now+120000||
    now-Date.parse(q.asOf)>8*86400000||
    q.feed!=="YFINANCE_YAHOO_5M_BAR_DELAYED")return null;
  const prev=(typeof q.previousClose==="number"&&Number.isFinite(q.previousClose)&&q.previousClose>0)?q.previousClose:null;
  return {price:q.price,currency:q.currency,asOf:new Date(q.asOf).toISOString(),
    exchange:q.exchange,sourceSymbol:q.sourceSymbol,
    feed:"YFINANCE_YAHOO_5M_BAR_DELAYED",previousClose:prev,
    previousCloseChangePercent:prev===null?null:Math.round((q.price/prev-1)*100000)/1000};
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
      if(!all[ticker]||Date.parse(q.asOf)>=Date.parse(all[ticker].asOf||0))
        all[ticker]=q;
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
