import {authenticatedOwner} from "./api/prices.js";
import {archiveInfo,safeHtmlDocument,REPORT_CSP} from "../lib/report-archive.mjs";
import {githubHtml,validGitHubArchivePath} from "../lib/github-archive.mjs";
export async function onRequestGet({request,env}){
 if(!await authenticatedOwner(request,env))return new Response("Not authorized",{status:403,headers:{"Cache-Control":"no-store"}});
 const path=new URL(request.url).searchParams.get("path");
 if(!validGitHubArchivePath(path))return new Response("Invalid report path",{status:400});
 const info=archiveInfo(path);
 if(!info||info.format!=="html")return new Response("Invalid report identity",{status:400});
 try{
  const raw=await githubHtml(path);
  const safe=safeHtmlDocument(info,raw);
  return new Response(safe,{status:200,headers:{
   "Content-Type":"text/html; charset=utf-8","Cache-Control":"private, no-store",
   "Content-Security-Policy":REPORT_CSP,"X-Content-Type-Options":"nosniff",
   "Referrer-Policy":"no-referrer","Cross-Origin-Resource-Policy":"same-origin"}});
 }catch{return new Response("Report not currently available from GitHub",{status:503,headers:{"Cache-Control":"no-store"}});}
}
