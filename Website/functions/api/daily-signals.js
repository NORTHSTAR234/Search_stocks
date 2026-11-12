// Owner-authenticated DAILY signals RPC. The Worker has no HTTP endpoint.
// Production and wildcard deployment domains remain protected by Cloudflare Access.
// JWT signed issuer/audience/owner identity validated by existing prices gateway.
import {authenticatedOwner} from "./prices.js";
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{
 "Content-Type":"application/json; charset=utf-8","Cache-Control":"private, no-store",
 "X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"}});
export async function onRequestGet({request,env}){
 if(!env?.DAILY_SIGNALS||typeof env.DAILY_SIGNALS.latest!=="function")
  return reply({status:"NOT_CONFIGURED",rows:[]},503);
 if(!await authenticatedOwner(request,env))
  return reply({status:"NOT_AUTHORIZED",rows:[]},403);
 const u=new URL(request.url);
 const mode=u.searchParams.get("view");
 if(mode&&mode!=="history")return reply({status:"INVALID_VIEW"},400);
 try{
  if(mode==="history"){
   if(typeof env.DAILY_SIGNALS.history!=="function")return reply({status:"NOT_CONFIGURED"},503);
   const rows=await env.DAILY_SIGNALS.history(30);
   return reply({status:"OK",days:Array.isArray(rows)?rows.slice(0,30):[]});
  }
  const snapshot=await env.DAILY_SIGNALS.latest();
  if(!snapshot||typeof snapshot!=="object"||Array.isArray(snapshot))
    return reply({status:"INVALID_SNAPSHOT",rows:[]},503);
  if(snapshot.status==="AWAITING_FIRST_DAILY_RUN")
    return reply({status:"AWAITING_FIRST_DAILY_RUN",rows:[]});
  if(snapshot.schemaVersion!==1||snapshot.kind!=="DAILY_TECHNICAL_SIGNALS"||
    !Array.isArray(snapshot.rows)||snapshot.rows.length>120||
    snapshot.execution!=="RESEARCH_ONLY_NO_ORDERS"||
    !Number.isFinite(Date.parse(snapshot.generatedAt))||
    Date.parse(snapshot.generatedAt)>Date.now()+120000||
    JSON.stringify(snapshot).length>220000)
    return reply({status:"INVALID_SNAPSHOT",rows:[]},503);
  return reply(snapshot);
 }catch{return reply({status:"DATA_SERVICE_ERROR",rows:[]},503);}
}
