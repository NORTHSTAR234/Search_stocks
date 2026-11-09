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
