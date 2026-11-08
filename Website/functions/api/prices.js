// Private owner-only price gateway. Never returns quotes until Cloudflare Access and
// a bound, explicitly approved read-only price provider are configured.
// PRICE_PROVIDER is a Cloudflare Worker service binding, not a public URL.
const reply=(payload,status=200)=>new Response(JSON.stringify(payload),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
const b64url=value=>Uint8Array.from(atob(value.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(value.length/4)*4,"=")),c=>c.charCodeAt(0));
const json64=value=>JSON.parse(new TextDecoder().decode(b64url(value)));
async function authenticatedOwner(request,env) {
  if(!env.ACCESS_TEAM_DOMAIN||!env.ACCESS_AUD||!env.OWNER_EMAIL) return false;
  const team=String(env.ACCESS_TEAM_DOMAIN).toLowerCase().replace(/^https?:\/\//,"").replace(/\/.*$/,"");
  if(!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(team))return false;
  const token=request.headers.get("Cf-Access-Jwt-Assertion");
  if(!token)return false;
  const pieces=token.split(".");
  if(pieces.length!==3)return false;
  let header,claims;
  try{header=json64(pieces[0]);claims=json64(pieces[1]);}catch{return false;}
  const now=Math.floor(Date.now()/1000);
  if(header.alg!=="RS256"||typeof header.kid!=="string"||claims.iss!=="https://"+team||
     !Array.isArray(claims.aud)||!claims.aud.includes(env.ACCESS_AUD)||
     typeof claims.exp!=="number"||claims.exp<=now||typeof claims.nbf==="number"&&claims.nbf>now||
     typeof claims.email!=="string"||claims.email.toLowerCase()!==String(env.OWNER_EMAIL).trim().toLowerCase()) return false;
  try{
    const res=await fetch("https://"+team+"/cdn-cgi/access/certs");
    if(!res.ok)return false;
    const jwks=await res.json();
    const key=(jwks.keys||[]).find(key=>key.kid===header.kid&&key.kty==="RSA");
    if(!key)return false;
    const imported=await crypto.subtle.importKey("jwk",key,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
    return await crypto.subtle.verify("RSASSA-PKCS1-v1_5",imported,b64url(pieces[2]),new TextEncoder().encode(pieces[0]+"."+pieces[1]));
  }catch{return false;}
}
// latest_trade is an observed IEX transaction, not a certified regular-session closing price.
const within24h=(current,old)=>{
  const a=Date.parse(current),b=Date.parse(old);
  return Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b-86400000)<=1800000;
};
function validateQuote(symbol,raw) {
  if(!raw||typeof raw!=="object")return null;
  const price=Number(raw.price);
  if(!Number.isFinite(price)||price<=0||raw.currency!=="USD"||!Number.isFinite(Date.parse(raw.asOf)))return null;
  const feed=String(raw.feed||"").toUpperCase();
  const sessionScope=String(raw.sessionScope||"");
  const session=String(raw.session||"");
  const adjustment=String(raw.adjustment||"");
  if(!["IEX","SIP"].includes(feed)||!["regular","extended"].includes(sessionScope)||
     !["live","delayed","last_close","latest_trade"].includes(session)||!["raw","split_adjusted"].includes(adjustment))return null;
  let change24hPercent=null,reference24hAsOf=null;
  const old=raw.reference24h;
  if(old&&Number(old.price)>0&&old.currency===raw.currency&&old.feed===raw.feed&&
     old.sessionScope===raw.sessionScope&&old.adjustment===raw.adjustment&&within24h(raw.asOf,old.asOf)) {
    const oldPrice=Number(old.price);
    change24hPercent=Math.round((price/oldPrice-1)*100000)/1000;
    reference24hAsOf=old.asOf;
  }
  return {price,currency:"USD",asOf:raw.asOf,feed,session,sessionScope,adjustment,change24hPercent,reference24hAsOf};
}
export async function onRequestGet({request,env}) {
  if(!env.PRICE_PROVIDER||!env.ACCESS_TEAM_DOMAIN||!env.ACCESS_AUD||!env.OWNER_EMAIL)
    return reply({error:"PRICE_INTEGRATION_NOT_CONFIGURED",quotes:{}},503);
  if(!(await authenticatedOwner(request,env)))return reply({error:"NOT_AUTHORIZED",quotes:{}},403);
  const requestUrl=new URL(request.url);
  const symbols=(requestUrl.searchParams.get("symbols")||"").split(",").map(s=>s.trim().toUpperCase()).filter(Boolean);
  if(!symbols.length||symbols.length>40||new Set(symbols).size!==symbols.length||
     symbols.some(s=>!/^[A-Z][A-Z0-9.-]{0,11}$/.test(s)))return reply({error:"INVALID_SYMBOLS",quotes:{}},400);
  try{
    const upstream=new URL("https://price-provider.internal/quotes");
    upstream.searchParams.set("symbols",symbols.join(","));
    const response=await env.PRICE_PROVIDER.fetch(new Request(upstream.toString(),{method:"GET",headers:{"Accept":"application/json"}}));
    if(!response.ok){
      // Return only a documented upstream error code, not provider payloads,
      // credentials, or exception strings. Owner is already authenticated.
      let upstreamError="UNSPECIFIED";
      try{
        const upstreamBody=await response.json();
        const known=new Set(["ALPACA_NOT_CONFIGURED","ALPACA_DATA_UNAVAILABLE","INVALID_ALPACA_DATA","INVALID_SYMBOLS","NOT_FOUND"]);
        if(known.has(upstreamBody?.error))upstreamError=upstreamBody.error;
      }catch{}
      return reply({error:"PRICE_PROVIDER_HTTP_ERROR",upstreamStatus:response.status,upstreamError,quotes:{}},503);
    }
    const data=await response.json();
    const result={};
    for(const symbol of symbols){
      const q=validateQuote(symbol,data?.quotes?.[symbol]);
      if(q)result[symbol]=q;
    }
    return reply({quotes:result,source:"configured read-only price provider"});
  }catch(e){
    const allowed=new Set(["TypeError","NetworkError","InvalidStateError","AbortError"]);
    return reply({error:"PRICE_PROVIDER_SERVICE_ERROR",exceptionType:allowed.has(e?.name)?e.name:"Other",quotes:{}},503);
  }
}
