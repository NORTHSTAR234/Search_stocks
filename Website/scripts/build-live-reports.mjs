// Generates a compact HTML-only report index for the protected Cloudflare website.
// It runs on GitHub Actions after report archives are saved; archive files are read-only.
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
import {archiveInfo,latestArchive,parseHtmlReport} from "../lib/report-archive.mjs";
import {loadEthicalDataset,applyEthicalDataset} from "../lib/ethical-dataset.mjs";
import {loadInvestigateDataset,applyInvestigateDataset} from "../lib/investigate-dataset.mjs";
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,"../..");
const target=path.resolve(here,"../live-reports.json");
const archives=[];
for(const bucket of ["halal","nonhalal"]){
 const base=path.join(root,bucket);
 if(!fs.existsSync(base))continue;
 for(const folder of fs.readdirSync(base,{withFileTypes:true})){
  if(!folder.isDirectory())continue;
  const directory=path.join(base,folder.name);
  for(const file of fs.readdirSync(directory,{withFileTypes:true})){
   if(!file.isFile()||!file.name.toLowerCase().endsWith(".html"))continue;
   const info=archiveInfo([bucket,folder.name,file.name].join("/"));
   if(info?.format==="html")archives.push(info);
  }
 }
}
const chosen=latestArchive(archives);
const rows=[];
const ethicalRegistry=loadEthicalDataset();
const investigateRegistry=loadInvestigateDataset();
const byBucket=new Map();
for(const report of archives){
 const key=report.ticker.toUpperCase();
 if(!byBucket.has(key))byBucket.set(key,new Set());
 byBucket.get(key).add(report.bucket);
}
for(const file of chosen){
 const raw=fs.readFileSync(path.join(root,file.path),"utf8");
 const parsed=parseHtmlReport(file,raw);
 parsed.conflictingBuckets=(byBucket.get(file.ticker)?.size||0)>1;
 rows.push(parsed);
}
for(const row of rows){
  // Current ethics is exclusively the owner-provided November 2026 table.
  Object.assign(row,applyInvestigateDataset(applyEthicalDataset(row,ethicalRegistry),investigateRegistry));
  for(const key of Object.keys(row))if(/^aaoifi/i.test(key))delete row[key];
}
const content=JSON.stringify(rows);
const revision=createHash("sha256").update(content).digest("hex").slice(0,32);
const document={
 schemaVersion:1,
 sourceRepository:"NORTHSTAR234/Search_stocks",
 latestHtmlReportAt:chosen[0]?.timestamp||null,
 htmlReportCount:archives.length,
 uniqueTickers:rows.length,
 revision,
 rows
};
fs.writeFileSync(target,JSON.stringify(document,null,2)+"\n");
console.log("Generated live HTML manifest for "+rows.length+" tickers from "+archives.length+" saved HTML reports (revision "+revision+").");
