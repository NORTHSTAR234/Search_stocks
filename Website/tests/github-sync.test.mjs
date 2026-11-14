import test from "node:test";
import assert from "node:assert/strict";
import {archiveInfo,latestArchive} from "../lib/report-archive.mjs";
import {latestHtmlPaths,validGitHubArchivePath,githubHtml,githubManifest} from "../lib/github-archive.mjs";
import {onRequestGet as viewReport} from "../functions/view-report.js";
import {onRequestGet as liveIndex} from "../functions/api/github-reports.js";
test("GitHub newest HTML scan includes new tickers and excludes unrelated repository files",()=>{
 const paths=[
 "halal/NVDA/NVDA_2026-11-08_20-58-00Z.md",
 "halal/NVDA/NVDA_2026-11-08_20-58-00Z_chat_response.html",
 "nonhalal/ZZZZ/ZZZZ_2026-11-09_05-00-00Z.html",
 "halal/NEW/NEW_2026-11-09_05-15-00Z.html",
 "halal/NEW/NEW_2026-11-09_05-20-00Z.html",
 "Website/index.html","halal/NVDA/NVDA_2026-11-08_20-58-00Z.html.bak"
 ];
 const result=latestHtmlPaths(paths.map((path,i)=>({type:"blob",path,sha:String(i).repeat(40)})),archiveInfo,latestArchive);
 assert.deepEqual(result.map(r=>r.ticker).sort(),["NEW","NVDA","ZZZZ"]);
 assert.equal(result.find(r=>r.ticker==="NEW").timestamp,"2026-11-09T05:20:00Z");
 assert.equal(result.find(r=>r.ticker==="NVDA").path,"halal/NVDA/NVDA_2026-11-08_20-58-00Z_chat_response.html");
});
test("HTML archive path validation blocks traversal, unexpected hosts and file types",()=>{
 assert(validGitHubArchivePath("halal/NEW/NEW_2026-11-09_01-02-03Z.html"));
 assert.equal(validGitHubArchivePath("AAOIFI/NVDA.NASDAQ.html"),false);
 for(const bad of ["../secrets","halal/A/A_2026-11-09_01-02-03Z.md",
  "halal/A/../A_2026-11-09_01-02-03Z.html","halal/A/A_2026-11-09_01-02-03Z.html?raw",
  "halal/B/A_2026-11-09_01-02-03Z.html"])assert.equal(validGitHubArchivePath(bad)&&!!archiveInfo(bad),false);
});
test("GitHub HTML fetch requests only a validated raw public archive path",async()=>{
 const path="halal/NEW/NEW_2026-11-09_05-00-00Z.html",requests=[];
 const fetcher=async(url,opts)=>{requests.push({url,opts});return new Response("<!DOCTYPE html><html><head></head><body>Test report</body></html>",{status:200});};
 const data=await githubHtml(path,"b".repeat(40),fetcher);
 assert(data.includes("Test report"));
 assert.equal(requests.length,1);
 assert.equal(requests[0].url,"https://raw.githubusercontent.com/NORTHSTAR234/Search_stocks/main/halal/NEW/NEW_2026-11-09_05-00-00Z.html");
 assert.equal(requests[0].opts.redirect,"manual");
});
test("dynamic GitHub report APIs reject unsigned requests",async()=>{
 const env={ACCESS_TEAM_DOMAIN:"team.cloudflareaccess.com",ACCESS_AUD:"aud",OWNER_EMAIL:"owner@example.com"};
 assert.equal((await liveIndex({request:new Request("https://test.example/api/github-reports"),env})).status,403);
 assert.equal((await viewReport({request:new Request("https://test.example/view-report?path=halal%2FNEW%2FNEW_2026-11-09_05-00-00Z.html"),env})).status,403);
});

test("five-minute GitHub sync reads generated raw manifest, never rate-limited REST directory API",async()=>{
 const path="halal/FRESH/FRESH_2026-11-09_05-31-00Z.html";
 const info=archiveInfo(path);
 const row={ticker:"FRESH",bucket:"halal",timestamp:info.timestamp,
    sourceFormat:"html",reportPath:"/view-report?path="+encodeURIComponent(path)};
 const requests=[];
 const fetcher=async(url,opts)=>{
   requests.push({url,opts});
   return new Response(JSON.stringify({schemaVersion:1,
     sourceRepository:"NORTHSTAR234/Search_stocks",
     revision:"test-revision",htmlReportCount:1,rows:[row]}),{status:200});
 };
 const manifest=await githubManifest(fetcher,1794198500000);
 assert.equal(manifest.rows[0].ticker,"FRESH");
 assert.equal(manifest.revision,"test-revision");
 assert.equal(requests.length,1);
 assert(requests[0].url.startsWith("https://raw.githubusercontent.com/NORTHSTAR234/Search_stocks/main/Website/live-reports.json?poll="));
 assert(!requests[0].url.includes("api.github.com"));
});

test("private read-only GitHub API retrieves manifest and HTML without raw.github access",async()=>{
  // Simulate an entirely private repo; these authenticated REST responses are
  // intentionally unavailable to anonymous visitors.
  const token="github_pat_"+"A".repeat(40);
  const manifestPath="Website/live-reports.json";
  const reportPath="halal/PRIVATE/PRIVATE_2026-11-11_03-00-00Z.html";
  const indexSha="c".repeat(40),reportSha="d".repeat(40),treeSha="e".repeat(40);
  const info=archiveInfo(reportPath);
  const row={ticker:info.ticker,bucket:info.bucket,timestamp:info.timestamp,
     sourceFormat:"html",reportPath:"/view-report?path="+encodeURIComponent(reportPath)};
  const index={schemaVersion:1,sourceRepository:"NORTHSTAR234/Search_stocks",
    revision:"private-manifest",htmlReportCount:1,rows:[row]};
  const report="<!DOCTYPE html><html><head></head><body>Private repo report</body></html>";
  const calls=[];
  const fetcher=async(url,opts)=>{
    calls.push({url,opts});
    assert(url.startsWith("https://api.github.com/repos/NORTHSTAR234/Search_stocks/"));
    assert.equal(opts.headers.Authorization,"Bearer "+token);
    assert.equal(opts.redirect,"manual");
    if(url.includes("/git/trees/main"))return Response.json({sha:treeSha,truncated:false,
      tree:[{path:manifestPath,type:"blob",sha:indexSha},
            {path:reportPath,type:"blob",sha:reportSha}]});
    const data=url.endsWith(indexSha)?JSON.stringify(index):url.endsWith(reportSha)?report:null;
    if(!data)return Response.json({error:"Not Found"},{status:404});
    return Response.json({encoding:"base64",size:Buffer.byteLength(data),
      content:Buffer.from(data).toString("base64")});
  };
  const result=await githubManifest(fetcher,Date.now(),token);
  assert.equal(result.rows[0].ticker,"PRIVATE");
  const html=await githubHtml(reportPath,"",fetcher,token);
  assert(html.includes("Private repo report"));
  assert.equal(calls.filter(x=>x.url.includes("/git/blobs/")).length,2);
  assert(calls.every(x=>!x.url.includes("raw.githubusercontent.com")));
});
test("private reports fail closed on 404 and never retry through public GitHub",async()=>{
  const token="github_pat_"+"B".repeat(40),calls=[];
  const fake=async(url,opts)=>{calls.push({url,opts});return Response.json({message:"Not Found"},{status:404});};
  await assert.rejects(()=>githubManifest(fake,Date.now(),token),/GitHub tree HTTP 404/);
  assert.equal(calls.length,1);
  assert(calls[0].url.startsWith("https://api.github.com/"));
  assert.equal(calls[0].opts.headers.Authorization,"Bearer "+token);
});
test("invalid server-side token is rejected rather than downgraded to public",async()=>{
  const fake=async()=>{throw Error("No network permitted")};
  await assert.rejects(()=>githubManifest(fake,Date.now(),"invalid"),/credential configuration/);
});
