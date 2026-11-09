import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import MarkdownIt from "markdown-it";
import {parseHtmlReport,safeHtmlDocument} from "./lib/report-archive.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const output = path.join(here, "dist");
const markdown = new MarkdownIt({ html: false, linkify: true, typographer: true, breaks: false });
const github = "https://github.com/NORTHSTAR234/Search_stocks/blob/main/";
const archivePattern = /^(halal|nonhalal)\/([A-Za-z0-9.-]+)\/([A-Za-z0-9.-]+)_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})Z(?:(_chat_response))?\.(md|html)$/i;

export function archiveInfo(relative) {
  const match = relative.match(archivePattern);
  if (!match || match[2].toUpperCase() !== match[3].toUpperCase()) return null;
  const iso = match[4] + "T" + match[5].replaceAll("-", ":") + "Z";
  if (!Number.isFinite(Date.parse(iso))) return null;
  return {bucket:match[1].toLowerCase(),ticker:match[2].toUpperCase(),timestamp:iso,path:relative,format:match[7].toLowerCase(),legacyHtmlSuffix:Boolean(match[6])};
}
function scan(bucket) {
  const base = path.join(root,bucket);
  if (!fs.existsSync(base)) return [];
  const found=[];
  for (const ticker of fs.readdirSync(base,{withFileTypes:true})) {
    if (!ticker.isDirectory()) continue;
    for (const file of fs.readdirSync(path.join(base,ticker.name),{withFileTypes:true})) {
      if (!file.isFile()) continue;
      const relative=[bucket,ticker.name,file.name].join("/");
      const info=archiveInfo(relative);
      if (info) found.push(info);
    }
  }
  return found;
}
export function latestArchive(files) {
  const byTicker=new Map();
  for (const item of files) {
    const key=item.ticker.toUpperCase();
    const older=byTicker.get(key);
    if (!older || item.timestamp>older.timestamp || item.timestamp===older.timestamp &&
      (item.format==="html"&&older.format!=="html" ||
       item.format===older.format&&older.legacyHtmlSuffix&&!item.legacyHtmlSuffix ||
       item.format===older.format&&item.legacyHtmlSuffix===older.legacyHtmlSuffix&&item.path<older.path)) byTicker.set(key,item);
  }
  return [...byTicker.values()].sort((a,b)=>b.timestamp.localeCompare(a.timestamp)||a.ticker.localeCompare(b.ticker));
}
function clean(text) {
  return String(text ?? "").replace(/!\[[^\]]*\]\([^)]*\)/g,"").replace(/\[([^\]]+)\]\([^)]+\)/g,"$1")
    .replace(/<[^>]+>/g,"").replace(/[*~]/g,"").replace(/(^|\s)_{1,2}|_{1,2}(?=\s|$)/g,"").replace(/\s+/g," ").trim();
}
function short(text,n=165) {const value=clean(text);return value.length>n?value.slice(0,n-1).trimEnd()+"…":value;}
function rows(raw) {
  const rows=[];
  let insideCode=false;
  for(const line of raw.split(/\r?\n/)) {
    if (/^\s*(`{3,}|~{3,})/.test(line)) {insideCode=!insideCode;continue;}
    if(insideCode || !/^\s*\|/.test(line)) continue;
    const cells=line.trim().replace(/^\|/,"").replace(/\|$/,"").split("|").map(v=>v.trim());
    if (cells.length<2 || /^:?-+:?$/.test(cells[0])) continue;
    rows.push({label:clean(cells[0]),value:cells.slice(1).join(" / ").trim()});
  }
  return rows;
}
function first(rows,regex) {
  const found=rows.find(item=>regex.test(item.label));
  return found?short(found.value):"";
}
function score(raw,name) {
  const match=raw.match(new RegExp("\\b"+name+"\\s*(?:Score)?\\s*[:=]?\\s*(?:\\*\\*)?\\s*(\\d{1,3})\\s*\\/\\s*100","i"));
  return match && Number(match[1])<=100 ? match[1]+"/100" : "";
}
function companyName(raw,ticker) {
  const title=(raw.match(/^#\s+(.+)$/m)||[])[1]||"";
  const leading=title.match(/^(.+?)\s*\((?:NASDAQ|NYSE|ASX|TWSE|Bursa|NYSEARCA):[A-Z0-9.-]+\)/i);
  if(leading)return short(leading[1],95);
  const bracket=title.match(/(?:—|–)\s*(.*?)\s*\((?:NASDAQ|NYSE|ASX|TWSE|NYSEARCA|Bursa|[A-Z]{2,}):/i);
  if (bracket) return short(bracket[1],95);
  const general=title.match(/(?:Research\s*[—–-]\s*|—\s*)(.*?)\s*\((?:NASDAQ|NYSE|ASX|TWSE|Bursa|[A-Z]{2,}):/i);
  if (general) return short(general[1],95);
  const after=title.match(/(?:Search_stock|Research|Report)\s*[—–-]\s*(.*?)\s*\(/i);
  if (after) return short(after[1],95);
  return ticker;
}
function bands(raw) {
  const found=[...clean(raw).matchAll(/(?:US\$|USD\s*|\$)\s*([\d,]+(?:\.\d+)?)\s*[–—-]\s*(?:(?:US\$|USD\s*|\$)\s*)?([\d,]+(?:\.\d+)?)/gi)];
  return found.slice(0,2).map(x=>[Number(x[1].replaceAll(",","")),Number(x[2].replaceAll(",",""))]);
}
export function parseReport(info,raw) {
  const header=raw.slice(0,18000);
  const rs=rows(header);
  const firstHeading=(raw.match(/^#\s+(.+)$/m)||[])[1]||"";
  const screeningOnly=/HALAL STATUS ONLY|STATUS ONLY|FINANCIAL RESEARCH SKIPPED|RESEARCH SKIPPED/i.test(firstHeading);
  const newAction=first(rs,/^(Action if I don.t own|New investor action|New buyer action|New investor|Action \/ risk|Action for new)/i)||
     short((header.match(/(?:Action if I don.t own any|New investor|New buyer)\s*:\s*([^\n]{3,150})/i)||[])[1]);
  const holdAction=first(rs,/^(Action if I own|Existing holder action|Existing shareholder action)/i)||
     short((header.match(/(?:Action if I own|Existing holder)\s*:\s*([^\n]{3,130})/i)||[])[1]);
  const combinedScore=first(rs,/^(Investment\s*\/\s*Entry|Investment\s*Score\s*\/\s*Entry|Investment\s*&\s*Entry)/i);
  const combinedNumbers=[...clean(combinedScore).matchAll(/(\d{1,3})\s*\/\s*100/g)].map(m=>m[1]+"/100");
  const investment=combinedNumbers[0]||first(rs,/^Investment Score$/i)||score(header,"Investment");
  const entry=combinedNumbers[1]||first(rs,/^Entry Score$/i)||score(header,"Entry");
  const musaffa=first(rs,/^Musaffa$/i)||short((header.match(/(?:Classification|Musaffa classification)\s*:\s*([^\n]{2,150})/i)||[])[1])||"NOT VERIFIED";
  const earnings=first(rs,/^(Confirmed next earnings|Next earnings|Upcoming earnings)/i)||"NOT VERIFIED";
  const zones=first(rs,/^(Preferred\s*\/\s*acceptable|Preferred\s*\/\s*acceptable\s*zone|Preferred\s*\/\s*acceptable\s*entry|Preferred \/ acceptable zone)/i)||"NOT RATED";
  const stops=first(rs,/^Initial stop\s*\/\s*no_?chase/i)||"NOT RATED";
  const risk=first(rs,/^Risk(?:\s*\/.*)?$/i)||short((first(rs,/^Action\s*\/\s*risk$/i).match(/\s\/\s((?:VERY )?(?:LOW|MODERATE|MEDIUM|HIGH)[^/]*)$/i)||[])[1])||"NOT RATED";
  const exchange=info.ticker.toUpperCase().endsWith(".AX")?"ASX":info.ticker.toUpperCase().endsWith(".TW")?"TWSE":
    /\.(KL|MY)$/.test(info.ticker.toUpperCase())?"BURSA":/\./.test(info.ticker)?"OTHER":
    /(?:Bursa|Malaysia|ACE Market)/i.test(header.slice(0,800))?"BURSA":
    /(?:\bASX\s*:\s*[A-Z]{2,6}\b|\bAustralian Securities Exchange\b|\b[A-Z]{2,6}\.AX\b)/i.test(header.slice(0,800))?"ASX":"US";
  const values={
    company:screeningOnly?short((header.match(/Exact user-confirmed security:\*\*\s*([^,\n]+)/i)||[])[1]||info.ticker,95):companyName(header,info.ticker),ticker:info.ticker,exchange,
    bucket:info.bucket,timestamp:info.timestamp,statusOnly:screeningOnly,sourceFormat:"md",
    action:screeningOnly?"SCREENING ONLY — NO INVESTMENT REPORT":(newAction||"NOT RATED"),
    ownerAction:screeningOnly?"RESEARCH SKIPPED":(holdAction||"NOT RATED"),
    risk:screeningOnly?"NOT RATED":risk,
    investment:screeningOnly?"NOT RATED":(investment||"NOT RATED"),
    entry:screeningOnly?"NOT RATED":(entry||"NOT RATED"),
    musaffa,earnings:screeningOnly?"NOT RATED":earnings,
    zones:screeningOnly?"NOT RATED":zones,
    stops:screeningOnly?"NOT RATED":stops,
    nativeCurrency:exchange==="US"?"USD":exchange==="ASX"?"AUD":exchange==="TWSE"?"TWD":exchange==="BURSA"?"MYR":"UNKNOWN",
    zoneBands:exchange==="US" && !screeningOnly?bands(zones):[],
    reportUrl:github+info.path.split("/").map(encodeURIComponent).join("/"),
    reportPath:"/reports/"+encodeURIComponent(info.ticker)+"/",
    conflictingBuckets:false
  };
  return values;
}
function esc(input) {return String(input).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");}
function page(title,body,child=false) {
  const prefix=child?"/":"";
  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'+
  '<meta name="robots" content="noindex,nofollow"><meta name="color-scheme" content="dark light">'+
  '<title>'+esc(title)+' · Stock Research</title><link rel="stylesheet" href="'+prefix+'/assets/style.css"></head><body>'+
  body+'<footer>Archived research is historical, not a current investment recommendation. Verify market data, Shariah screening and risk independently.</footer></body></html>';
}
function mainPage() {
  const labels=["Company / ticker","Last report (AEDT/AEST)","Latest price / 24h change","Action / Risk","Investment / Entry","Musaffa status / grade / screening date","Next earnings / confirmation","Preferred / acceptable buy zone","Initial stop / no_chase","Report"];
  const head=labels.map(label=>'<th scope="col">'+esc(label)+'</th>').join("");
  const body='<header class="top"><a class="brand" href="/">◈ Stock Research</a><span class="top-note">PRIVATE-READY • HISTORICAL REPORTS</span></header>'+
  '<main><section class="hero"><p class="eyebrow">SEARCH_STOCK · GITHUB ARCHIVE</p><h1>Latest Research Reports</h1><p>One latest archived report per exact ticker, with separate time-stamped market observations when available.</p>'+
  '<div class="metrics"><div><span id="count">—</span><small>Latest reports</small></div><div><span id="halalCount">—</span><small>Halal-folder reports</small></div><div><span id="quoteCount">—</span><small>Verified quotes</small></div></div></section>'+
  '<section class="panel"><div class="toolbar"><label class="search"><span>Search</span><input id="search" type="search" placeholder="Ticker or company" aria-label="Search ticker or company"></label>'+
  '<label><span>Category</span><select id="bucket"><option value="all">All</option><option value="halal">Halal folder</option><option value="nonhalal">Nonhalal / unverified folder</option></select></label>'+
  '<label><span>Exchange</span><select id="exchange"><option value="all">All markets</option><option value="US">US</option><option value="ASX">ASX</option><option value="TWSE">Taiwan</option><option value="BURSA">Malaysia</option><option value="OTHER">Other</option></select></label>'+
  '<label><span>Order</span><select id="order"><option value="newest">Newest report</option><option value="ticker">Ticker A–Z</option><option value="entry">Entry score ↓</option><option value="investment">Investment score ↓</option></select></label>'+
  '<button id="refresh" type="button">Refresh data</button></div><div class="notice" id="marketNotice" role="status">Loading archived reports…</div><div class="notice report-sync" id="reportSyncNotice" role="status">Checking GitHub for newer HTML reports…</div>'+
  '<div class="table-wrap"><table><thead><tr>'+head+'</tr></thead><tbody id="rows"><tr><td colspan="10">Loading…</td></tr></tbody></table></div>'+
  '<div class="table-footer"><span id="shown"></span><span>Prices and GitHub HTML archives checked every 5 minutes while open</span></div></section>'+
  '<p class="note">Storage buckets are administrative, not Shariah determinations. Unverified or stale screening does not mean haram. A 24h percentage is shown only when a comparable observation approximately 24 elapsed hours earlier exists. Non-US quotes require a separate licensed provider.</p></main>'+
  '<script src="/assets/app.js" defer></script>';
  return page("Latest Research Reports",body);
}
function reportPage(r,body) {
  return page(r.ticker+" report",'<header class="top"><a class="brand" href="/">◈ Stock Research</a><a href="/" class="back">← All reports</a></header>'+
    '<main class="report-layout"><section class="report-head"><p class="eyebrow">'+esc(r.bucket.toUpperCase())+' / '+esc(r.exchange)+'</p><h1>'+esc(r.company)+'</h1><p>'+
    esc(r.ticker)+' · Report archived '+esc(r.timestamp)+' · <a href="'+esc(r.reportUrl)+'" rel="noopener noreferrer">View original Markdown on GitHub</a></p>'+
    '<p class="note">Archived analysis only. Latest market prices on the dashboard are separate and do not update this report.</p></section>'+
    '<article class="markdown">'+body+'</article></main>',true);
}
export function build() {
  // Fail closed: the initial Cloudflare Pages deployment must not publish reports.
  // Activate only after Cloudflare Access protects production, preview and custom hostnames.
  if(process.env.PUBLISH_REPORTS!=="yes"){
    fs.rmSync(output,{recursive:true,force:true});
    fs.mkdirSync(path.join(output,"assets"),{recursive:true});
    fs.copyFileSync(path.join(here,"assets","style.css"),path.join(output,"assets","style.css"));
    fs.copyFileSync(path.join(here,"_headers"),path.join(output,"_headers"));
    fs.writeFileSync(path.join(output,"robots.txt"),"User-agent: *\nDisallow: /\n");
    fs.writeFileSync(path.join(output,"index.html"),page("Setup in progress",'<header class="top"><span class="brand">◈ Stock Research</span></header><main class="report-layout"><section class="hero"><p class="eyebrow">PRIVATE SITE · SETUP</p><h1>Website setup in progress</h1><p>Research reports have not been published to this domain. Enable and verify Cloudflare Access for all hostnames before activating the reports build.</p></section></main>'));
    console.log("Safe placeholder deployed. PUBLISH_REPORTS=yes required for report publication.");
    return;
  }
  const archives=[...scan("halal"),...scan("nonhalal")];
  if(!archives.length) throw new Error("No valid archived stock reports were found. Build stopped.");
  fs.rmSync(output,{recursive:true,force:true});
  fs.mkdirSync(output,{recursive:true});
  const latest=latestArchive(archives);
  const rows=[];
  const bucketsByTicker=new Map();
  for(const item of archives) {
    const key=item.ticker.toUpperCase();
    if(!bucketsByTicker.has(key)) bucketsByTicker.set(key,new Set());
    bucketsByTicker.get(key).add(item.bucket);
  }
  for(const info of latest) {
    const raw=fs.readFileSync(path.join(root,info.path),"utf8");
    const row=info.format==="html"?parseHtmlReport(info,raw):parseReport(info,raw);
    row.conflictingBuckets=bucketsByTicker.get(info.ticker.toUpperCase()).size>1;
    rows.push(row);
    const target=path.join(output,"reports",info.ticker,"index.html");
    fs.mkdirSync(path.dirname(target),{recursive:true});
    fs.writeFileSync(target,info.format==="html"?safeHtmlDocument(info,raw):reportPage(row,markdown.render(raw)));
  }
  const jsonDir=path.join(output,"data");
  fs.mkdirSync(jsonDir,{recursive:true});
  fs.writeFileSync(path.join(jsonDir,"reports.json"),JSON.stringify({generatedAt:new Date().toISOString(),totalFiles:archives.length,rows},null,2));
  fs.writeFileSync(path.join(output,"index.html"),mainPage());
  fs.mkdirSync(path.join(output,"assets"),{recursive:true});
  for (const name of ["app.js","style.css"]) fs.copyFileSync(path.join(here,"assets",name),path.join(output,"assets",name));
  fs.copyFileSync(path.join(here,"_headers"),path.join(output,"_headers"));
  fs.writeFileSync(path.join(output,"robots.txt"),"User-agent: *\nDisallow: /\n");
  console.log("Built "+rows.length+" current ticker reports from "+archives.length+" archived HTML/Markdown files.");
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) build();
