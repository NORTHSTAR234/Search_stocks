import {archiveInfo} from "./report-archive.mjs";
// Same owner-only Pages routes support two modes:
// - PUBLIC current mode: read public GitHub raw assets without a credential.
// - PRIVATE cutover mode: strictly read authenticated GitHub REST blobs using
//   a Cloudflare Pages encrypted GITHUB_READ_TOKEN. No browser, redirects,
//   raw.githubusercontent.com, or static asset ever receives the credential.
const REPOSITORY="NORTHSTAR234/Search_stocks";
const API="https://api.github.com/repos/"+REPOSITORY;
const TREE=API+"/git/trees/main?recursive=1";
const RAW="https://raw.githubusercontent.com/"+REPOSITORY+"/main/";
const commonHeaders={"Accept":"application/vnd.github+json",
  "X-GitHub-Api-Version":"2022-11-28","User-Agent":"StockResearchReports/1.0"};
const trees=new Map(),blobCache=new Map(),manifests=new Map();

function privateToken(token){
  if(token===undefined||token===null||token==="")return null;
  if(typeof token!=="string"||!/^[A-Za-z0-9_\-]{20,512}$/.test(token))
    throw Error("Invalid server-side GitHub credential configuration");
  return token;
}
function headers(token){return token?{...commonHeaders,Authorization:"Bearer "+token}:{...commonHeaders};}
function scope(token){return token?"private":"public";}
function safeSha(sha){return /^[a-f0-9]{40}$/i.test(String(sha||""));}
function decodeGithubBlob(data,max){
  if(!data||data.encoding!=="base64"||typeof data.content!=="string"||
     (typeof data.size==="number"&&data.size>max))
    throw Error("Invalid or oversized GitHub blob");
  const b64=data.content.replace(/\s/g,"");
  if(b64.length>Math.ceil(max/3)*4+16||!/^[A-Za-z0-9+/]*={0,2}$/.test(b64))
    throw Error("Invalid or oversized GitHub blob encoding");
  const bytes=Uint8Array.from(atob(b64),x=>x.charCodeAt(0));
  if(bytes.length>max)throw Error("GitHub blob exceeds size limit");
  return new TextDecoder("utf-8",{fatal:true}).decode(bytes);
}
async function gitBlob(sha,token,fetcher,max){
  if(!safeSha(sha)||!token)throw Error("Private report GitHub blob reference unavailable");
  const response=await fetcher(API+"/git/blobs/"+sha,{
    method:"GET",headers:headers(token),redirect:"manual",signal:AbortSignal.timeout(16000)});
  if(!response.ok)throw Error("Private GitHub blob HTTP "+response.status);
  return decodeGithubBlob(await response.json(),max);
}
export function validGitHubArchivePath(path){
 const value=String(path||"");
 return /^(?:halal|nonhalal)\/[A-Za-z0-9.-]+\/[A-Za-z0-9.-]+_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}Z(?:_chat_response)?\.html$/i.test(value)||
   /^AAOIFI\/[A-Za-z0-9.-]+\.html$/i.test(value);
}
export function latestHtmlPaths(tree,parseArchiveInfo,chooseLatest){
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
export async function githubTree(fetcher=fetch,now=Date.now(),credential=null){
 const token=privateToken(credential),mode=scope(token),cached=trees.get(mode);
 if(!token&&cached&&now-cached.checkedAt<240000)return cached.value;
 const response=await fetcher(TREE,{method:"GET",headers:headers(token),
    redirect:"manual",signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error("GitHub tree HTTP "+response.status);
 const json=await response.json();
 if(json.truncated||!Array.isArray(json.tree)||json.tree.length>30000||
    typeof json.sha!=="string"||!safeSha(json.sha))
   throw Error("GitHub tree incomplete");
 const value={treeSha:json.sha,files:json.tree};
 if(!token)trees.set(mode,{value,checkedAt:now});
 return value;
}
export async function githubHtml(path,sha="",fetcher=fetch,credential=null){
 if(!validGitHubArchivePath(path))throw Error("Not an allowed HTML report path");
 const token=privateToken(credential),mode=scope(token);
 if(token){
   const tree=await githubTree(fetcher,Date.now(),token);
   const item=tree.files.find(x=>x.path===path&&x.type==="blob"&&safeSha(x.sha));
   if(!item)throw Error("Private archive path absent in GitHub main");
   // Ignore supplied sha unless it agrees with live tree; deleted or replaced
   // archived reports must not be fetched using an obsolete blob ref.
   if(sha&&sha!==item.sha)throw Error("Private archived report ref mismatch");
   const cacheKey=mode+":"+item.sha;
   // Never share auth-mode private blobs between credentials or requests.
   // Private reads remain lightweight and fail closed on token revocation.
   const raw=await gitBlob(item.sha,token,fetcher,2200000);
   if(!/<html\b/i.test(raw)||!/<body\b/i.test(raw))
      throw Error("Invalid GitHub HTML archive");
   if(blobCache.size>220)blobCache.clear();
   // No cross-credential private cache.

   return raw;
 }
 const key=mode+":"+(safeSha(sha)?sha:path);
 if(blobCache.has(key))return blobCache.get(key);
 const url=RAW+path.split("/").map(encodeURIComponent).join("/");
 const response=await fetcher(url,{method:"GET",headers:{
     "Accept":"text/html","User-Agent":"StockResearchReports/1.0"},
   redirect:"manual",signal:AbortSignal.timeout(16000)});
 if(!response.ok)throw Error("GitHub HTML HTTP "+response.status);
 const size=Number(response.headers.get("content-length"));
 if(Number.isFinite(size)&&size>2200000)throw Error("HTML exceeds safe maximum size");
 const raw=await response.text();
 if(raw.length>2200000||!/<html\b/i.test(raw)||!/<body\b/i.test(raw))
    throw Error("Invalid GitHub HTML archive");
 if(blobCache.size>220)blobCache.clear();
 blobCache.set(key,raw);
 return raw;
}
export async function githubManifest(fetcher=fetch,now=Date.now(),credential=null){
 const token=privateToken(credential),mode=scope(token);
 const cached=manifests.get(mode);
 if(!token&&cached&&now-cached.checkedAt<210000)return cached.data;
 let data;
 if(token){
   const tree=await githubTree(fetcher,now,token);
   const item=tree.files.find(x=>x.path==="Website/live-reports.json"&&
       x.type==="blob"&&safeSha(x.sha));
   if(!item)throw Error("Private GitHub report manifest missing");
   const raw=await gitBlob(item.sha,token,fetcher,2000000);
   data=JSON.parse(raw);
 }else{
   const url=RAW+"Website/live-reports.json?poll="+Math.floor(now/300000);
   const response=await fetcher(url,{method:"GET",headers:{"Accept":"application/json"},
       redirect:"manual",signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw Error("GitHub report manifest HTTP "+response.status);
   const length=Number(response.headers.get("content-length"));
   if(Number.isFinite(length)&&length>2000000)throw Error("Oversized HTML report manifest");
   data=await response.json();
 }
 if(data?.schemaVersion!==1||data.sourceRepository!==REPOSITORY||
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
 if(!token)manifests.set(mode,{data:next,checkedAt:now});
 return next;
}
