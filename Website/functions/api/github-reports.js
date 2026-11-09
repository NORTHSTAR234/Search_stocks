import {authenticatedOwner} from "./prices.js";
import {archiveInfo,latestArchive,parseHtmlReport} from "../../lib/report-archive.mjs";
import {githubTree,githubHtml,latestHtmlPaths} from "../../lib/github-archive.mjs";
const reply=(payload,status=200)=>new Response(JSON.stringify(payload),{status,headers:{
 "Content-Type":"application/json; charset=utf-8","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
export async function onRequestGet({request,env}){
 if(!await authenticatedOwner(request,env))return reply({error:"NOT_AUTHORIZED"},403);
 const known=(new URL(request.url)).searchParams.get("knownTree")||"";
 try{
  const source=await githubTree();
  if(known===source.treeSha)return reply({unchanged:true,treeSha:source.treeSha,checkedAt:new Date().toISOString(),source:"GitHub main"});
  const files=latestHtmlPaths(source.files,archiveInfo,latestArchive);
  const rows=[],errors=[];
  // Limited parallelism reduces GitHub burst load and prevents a single bad HTML
  // document from hiding the rest. Existing reports remain available on error.
  let next=0;
  await Promise.all(Array.from({length:Math.min(4,files.length)},async()=>{
   while(next<files.length){
    const item=files[next++];
    try{
     const raw=await githubHtml(item.path,item.sha);
     const parsed=parseHtmlReport(item,raw);
     parsed.conflictingBuckets=item.conflictingBuckets;
     rows.push(parsed);
    }catch(e){
     errors.push({ticker:item.ticker,reason:String(e?.message||"HTML unavailable").slice(0,90)});
    }
   }
  }));
  rows.sort((a,b)=>b.timestamp.localeCompare(a.timestamp)||a.ticker.localeCompare(b.ticker));
  return reply({unchanged:false,treeSha:source.treeSha,checkedAt:new Date().toISOString(),
    source:"GitHub main",htmlReportCount:files.length,rows,errors});
 }catch(e){
  // Fail closed. The browser will retain its most recently verified rows.
  return reply({error:"GITHUB_SYNC_UNAVAILABLE",detail:String(e?.message||"Upstream error").slice(0,120)},503);
 }
}
