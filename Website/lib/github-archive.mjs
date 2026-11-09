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
