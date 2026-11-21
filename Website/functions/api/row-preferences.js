// Private per-owner stock row preferences, synchronised via Cloudflare D1.
// The existing signed Cloudflare Access JWT + exact owner email is mandatory.
// Nothing here writes to public GitHub, quote caches, research or Shariah data.
import {authenticatedOwner} from "./prices.js";

const reply=(body,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{"Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}
});
export const validTicker=t=>typeof t==="string"&&/^[A-Z0-9][A-Z0-9.-]{0,29}$/.test(t);
export const validState=s=>["normal","favourite","minimized"].includes(s);
export const validVersion=v=>Number.isSafeInteger(v)&&v>=0&&v<=1e9;

export async function readRowPreferences(db){
  const result=await db.prepare(
    "SELECT ticker, state, version FROM stock_row_preferences ORDER BY ticker LIMIT 501"
  ).all();
  if(!result?.success||!Array.isArray(result.results)||result.results.length>500)
    throw Error("PREFERENCES_READ_FAILED");
  return result.results.map(r=>({ticker:r.ticker,state:r.state,version:r.version}));
}
export async function setRowPreference(db,{ticker,state,version}){
  if(!validTicker(ticker)||!validState(state)||!validVersion(version))
    return {status:400,body:{error:"INVALID_ROW_PREFERENCE"}};
  const updated=version===0?
    await db.prepare(
      "INSERT INTO stock_row_preferences(ticker,state,version) VALUES(?,?,1) "+
      "ON CONFLICT(ticker) DO NOTHING RETURNING ticker,state,version"
    ).bind(ticker,state).first():
    await db.prepare(
      "UPDATE stock_row_preferences SET state=?,version=version+1,updated_at=CURRENT_TIMESTAMP "+
      "WHERE ticker=? AND version=? RETURNING ticker,state,version"
    ).bind(state,ticker,version).first();
  if(updated)return {status:200,body:{record:updated}};
  const existing=await db.prepare(
    "SELECT ticker,state,version FROM stock_row_preferences WHERE ticker=?"
  ).bind(ticker).first();
  // A tombstone state 'normal' is retained so an older device cannot
  // re-upload a cleared favourite on its first migration.
  return {status:409,body:{error:"VERSION_CONFLICT",record:existing||null}};
}
export async function onRequestGet({request,env}){
  if(!(await authenticatedOwner(request,env)))return reply({error:"NOT_AUTHORIZED"},403);
  if(!env.ROW_PREFERENCES_DB)return reply({error:"ROW_PREFERENCES_STORAGE_UNAVAILABLE"},503);
  try{return reply({schemaVersion:1,records:await readRowPreferences(env.ROW_PREFERENCES_DB)});}
  catch{return reply({error:"ROW_PREFERENCES_READ_FAILED"},503);}
}
export async function onRequestPost({request,env}){
  if(!(await authenticatedOwner(request,env)))return reply({error:"NOT_AUTHORIZED"},403);
  if(!env.ROW_PREFERENCES_DB)return reply({error:"ROW_PREFERENCES_STORAGE_UNAVAILABLE"},503);
  // Only accept same-origin JSON writes; browser Access cookies alone aren't
  // sufficient to authorize any cross-site request.
  const origin=request.headers.get("Origin");
  if(origin&&origin!==new URL(request.url).origin)return reply({error:"CROSS_ORIGIN_REJECTED"},403);
  if(request.headers.get("Sec-Fetch-Site")==="cross-site")return reply({error:"CROSS_ORIGIN_REJECTED"},403);
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get("Content-Type")||""))
    return reply({error:"JSON_REQUIRED"},415);
  let body;
  try{
    const raw=await request.text();
    if(raw.length>1024)return reply({error:"INVALID_ROW_PREFERENCE"},400);
    body=JSON.parse(raw);
  }catch{return reply({error:"INVALID_ROW_PREFERENCE"},400);}
  const input={ticker:body?.ticker,state:body?.state,version:body?.version};
  if(!validTicker(input.ticker)||!validState(input.state)||!validVersion(input.version))
    return reply({error:"INVALID_ROW_PREFERENCE"},400);
  try{
    const outcome=await setRowPreference(env.ROW_PREFERENCES_DB,input);
    return reply(outcome.body,outcome.status);
  }catch{return reply({error:"ROW_PREFERENCES_WRITE_FAILED"},503);}
}
