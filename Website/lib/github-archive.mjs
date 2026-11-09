import {archiveInfo} from "./report-archive.mjs";
// Read-only public GitHub archive access for owner-authorized Pages Functions.
// The source repo is public. This adapter never writes to GitHub or uses credentials.
const TREE="https://api.github.com/repos/NORTHSTAR234/Search_stocks/git/trees/main?recursive=1";
const RAW="https://raw.githubusercontent.com/NORTHSTAR234/Search_stocks/main/";
let cachedTree=null,treeCheckedAt=0;
const cachedBlobs=new Map();
export function validGitHubArchivePath(path) {
 return /^(?:halal|nonhalal)\/[A-Za-z0-9.-]+\/[A-Za-z0-9.-]+_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}Z(?:_chat_response)?\.html$/i.test(String(path||""));
}
export function latestHtmlPaths(tree,parseArchiveInfo,chooseLatest) {
 if(!Array.isArray(tree)||tree.length>30000)throw Error("Invalid or unbounded GitHub tree");
 const found=[],buckets=new Map();
 for(const item of tree){
  if(item?.type!=="blob")continue;
  const info=parseArchiveInfo(item.path);
  if(!info)continue;
  const key=info.ticker.toUpperCase();
  if(!buckets.has(key))buckets.set(key,new Set());
  buckets.get(key).add(info.bucket);
  if(info.format==="html")found.push({...info,sha:item.sha||""});
 }
 const selected=chooseLatest(found).slice(0,200);
 return selected.map(x=>({...x,conflictingBuckets:(buckets.get(x.ticker)||new Set()).size>1}));
}
export async function githubTree(fetcher=fetch,now=Date.now()){
 if(cachedTree&&now-treeCheckedAt<240000)return cachedTree;
 const r=await fetcher(TREE,{method:"GET",headers:{
  "Accept":"application/vnd.github+json","User-Agent":"StockResearchReports/1.0"},
  redirect:"manual",signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw Error("GitHub tree HTTP "+r.status);
 const json=await r.json();
 if(json.truncated||!Array.isArray(json.tree)||json.tree.length>30000||typeof json.sha!=="string")
   throw Error("GitHub tree incomplete");
 const value={treeSha:json.sha,files:json.tree};
 cachedTree=value;treeCheckedAt=now;
 return value;
}
export async function githubHtml(path,sha="",fetcher=fetch){
 if(!validGitHubArchivePath(path))throw Error("Not an allowed HTML report path");
 const key=/^[0-9a-f]{40}$/i.test(sha)?sha:path;
 if(cachedBlobs.has(key))return cachedBlobs.get(key);
 const url=RAW+path.split("/").map(encodeURIComponent).join("/");
 const r=await fetcher(url,{method:"GET",headers:{"Accept":"text/html","User-Agent":"StockResearchReports/1.0"},
  redirect:"manual",signal:AbortSignal.timeout(16000)});
 if(!r.ok)throw Error("GitHub HTML HTTP "+r.status);
 const size=Number(r.headers.get("content-length"));
 if(Number.isFinite(size)&&size>2200000)throw Error("HTML exceeds safe maximum size");
 const raw=await r.text();
 if(raw.length>2200000||!/<html\b/i.test(raw)||!/<body\b/i.test(raw))throw Error("Invalid GitHub HTML archive");
 if(cachedBlobs.size>220)cachedBlobs.clear();
 cachedBlobs.set(key,raw);
 return raw;
}

const MANIFEST=RAW+"Website/live-reports.json";
let manifestCache=null,manifestCheckedAt=0;
// The GitHub Actions workflow rebuilds this small public JSON file whenever a
// new HTML report is committed. Raw GitHub URLs do not incur REST API quotas.
export async function githubManifest(fetcher=fetch,now=Date.now()){
 if(manifestCache&&now-manifestCheckedAt<210000)return manifestCache;
 const url=MANIFEST+"?poll="+Math.floor(now/300000);
 const r=await fetcher(url,{method:"GET",headers:{"Accept":"application/json"},
   redirect:"manual",signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error("GitHub report manifest HTTP "+r.status);
 const length=Number(r.headers.get("content-length"));
 if(Number.isFinite(length)&&length>2000000)throw Error("Oversized HTML report manifest");
 const data=await r.json();
 if(data?.schemaVersion!==1||data.sourceRepository!=="NORTHSTAR234/Search_stocks"||
    typeof data.revision!=="string"||data.revision.length>100||
    !Array.isArray(data.rows)||data.rows.length>200||!Number.isInteger(data.htmlReportCount))
   throw Error("Invalid GitHub HTML report manifest");
 const verified=[];
 for(const row of data.rows){
  if(!row||typeof row.reportPath!=="string"||!row.reportPath.startsWith("/view-report?path="))
    throw Error("Invalid dynamic HTML report URL");
  const reportPath=new URL(row.reportPath,"https://private.invalid").searchParams.get("path");
  const match=archiveInfo(reportPath);
  if(!match||match.format!=="html"||match.ticker!==row.ticker||match.bucket!==row.bucket||
    match.timestamp!==row.timestamp||row.sourceFormat!=="html"||
    !validGitHubArchivePath(reportPath))
    throw Error("HTML manifest report identity mismatch");
  verified.push(row);
 }
 const next={revision:data.revision,rows:verified,htmlReportCount:data.htmlReportCount,
   latestHtmlReportAt:data.latestHtmlReportAt||null};
 manifestCache=next;manifestCheckedAt=now;
 return next;
}
