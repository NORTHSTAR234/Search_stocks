import {authenticatedOwner} from "./prices.js";
import {githubManifest} from "../../lib/github-archive.mjs";
const reply=(payload,status=200)=>new Response(JSON.stringify(payload),{status,headers:{
 "Content-Type":"application/json; charset=utf-8","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
export async function onRequestGet({request,env}){
 if(!await authenticatedOwner(request,env))return reply({error:"NOT_AUTHORIZED"},403);
 const known=new URL(request.url).searchParams.get("knownTree")||"";
 try{
  const data=await githubManifest();
  if(known===data.revision)return reply({unchanged:true,treeSha:data.revision,checkedAt:new Date().toISOString(),source:"GitHub HTML manifest"});
  return reply({unchanged:false,treeSha:data.revision,checkedAt:new Date().toISOString(),
    source:"GitHub HTML manifest",htmlReportCount:data.htmlReportCount,rows:data.rows,errors:[]});
 }catch(e){
  return reply({error:"GITHUB_SYNC_UNAVAILABLE",detail:String(e?.message||"Upstream error").slice(0,120)},503);
 }
}
