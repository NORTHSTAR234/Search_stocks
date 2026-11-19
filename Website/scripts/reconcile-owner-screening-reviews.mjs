// Physically park ANY explicitly owner-reviewed stock in nonhalal/, preserving old
// GitHub reports. This is an administrative archive copy, NOT fresh market research.
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {archiveInfo,latestArchive,parseHtmlReport} from "../lib/report-archive.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const registry=JSON.parse(fs.readFileSync(path.join(root,"Website/data/shariah-user-reviews.json"),"utf8"));
if(registry.schema_version!==1||registry.provenance!=="USER_REQUEST"||
    !Array.isArray(registry.rows))throw Error("Invalid owner review registry");

const reports=[];
for(const bucket of ["halal","nonhalal"]){
  const base=path.join(root,bucket);
  if(!fs.existsSync(base))continue;
  for(const folder of fs.readdirSync(base,{withFileTypes:true})){
    if(!folder.isDirectory())continue;
    for(const file of fs.readdirSync(path.join(base,folder.name))){
      if(!file.endsWith(".html"))continue;
      const info=archiveInfo([bucket,folder.name,file].join("/"));
      if(info?.format==="html")reports.push(info);
    }
  }
}
const chosen=latestArchive(reports);
const safe=v=>String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;")
  .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const requiredDepth=[
  /what matters now/,
  /why\s+(?:the\s+)?(?:share|stock|price|share price|stock price)\s+(?:price\s+)?(?:rose|fell|dropped|declined|moved|is rising|is falling|is dropping)|why it (?:rose|fell|moved)/,
  /upcoming events (?:that could move|to watch|calendar)|events that could move the price/,
  /how much further could it fall|downside stress/,
  /bearish/,/mixed/,/bullish/,/mild/,/moderate/,/severe/,
  /reasons to remain constructive/,/reasons for caution/
];
// Validate ALL requested moves before writing ANY new file.
const tasks=[];
const seen=new Set();
for(const review of registry.rows){
  if(!review||!/^[A-Z0-9]+(?:[.-][A-Z0-9]+)*$/.test(review.ticker)||
    !["DOUBTFUL","NON_HALAL"].includes(review.label)||review.bucket!=="nonhalal"||
    typeof review.company!=="string"||!review.company.trim()||
    typeof review.reason!=="string"||!review.reason.trim()||
    seen.has(review.ticker))throw Error("Invalid or duplicate explicit owner designation");
  seen.add(review.ticker);
  const info=chosen.find(x=>x.ticker===review.ticker);
  if(!info)throw Error("No HTML archive for "+review.ticker+"; create a full Search_stock report first");
  const source=fs.readFileSync(path.join(root,info.path),"utf8");
  const parsed=parseHtmlReport(info,source);
  const norm=x=>String(x).trim().replace(/\s+/g," ").toUpperCase();
  if(norm(parsed.company)!==norm(review.company))
    throw Error("Owner designation issuer mismatch: "+review.ticker);
  if(info.bucket==="nonhalal")continue;
  const match=source.match(/<script\b(?=[^>]*\bid\s*=\s*["']aya-report-snapshot["'])[^>]*>([\s\S]*?)<\/script\s*>/i);
  if(!match)throw Error("No canonical snapshot: "+review.ticker);
  let snap;
  try{snap=JSON.parse(match[1]);}catch{throw Error("Unparseable archive snapshot: "+review.ticker)}
  if(snap.schema_version!==2||snap.ticker!==review.ticker||
      snap.canonical_archive_ticker!==review.ticker)
    throw Error("Canonical issuer security metadata mismatch: "+review.ticker);
  if(snap.report_type==="full"){
    const visible=source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ")
      .replace(/<[^>]+>/g," ").replace(/&[a-zA-Z]+;/g," ")
      .replace(/\s+/g," ").toLowerCase();
    if(requiredDepth.some(rx=>!rx.test(visible)))
      throw Error("Older full report lacks mandatory depth: "+review.ticker+
        ". Create new full research in nonhalal/ instead of falsifying depth");
  }
  tasks.push({info,source,snap,review,parsed});
}
let created=0;
for(const {info,source,snap,review,parsed} of tasks){
  const utc=new Date().toISOString().replace(/\.\d{3}Z$/,"Z");
  if(!(Date.parse(utc)>Date.parse(snap.report_utc)))
    throw Error("New timestamp is not after original report: "+review.ticker);
  const oldDate=snap.report_utc;
  const destFolder=path.join(root,"nonhalal",review.ticker);
  const filename=review.ticker+"_"+utc.replace("T","_").replace(/:/g,"-")+".html";
  const newPath="nonhalal/"+review.ticker+"/"+filename;
  const dest=path.join(destFolder,filename);
  if(fs.existsSync(dest))throw Error("Refusing to overwrite existing report "+newPath);
  snap.report_utc=utc;
  snap.owner_review={status:review.label,source:"USER_REQUEST",
    reason:review.reason,original_report_utc:oldDate,administrative_copy:true};
  const oldSnap=source.match(/<script\b(?=[^>]*\bid\s*=\s*["']aya-report-snapshot["'])[^>]*>([\s\S]*?)<\/script\s*>/i);
  const serialized=JSON.stringify(snap).replace(/<\//g,"<\\/");
  let updated=source.replace(oldSnap[0],oldSnap[0].replace(oldSnap[1],serialized));
  const banner='<aside role="note" style="padding:16px;margin:12px;border:2px solid #bd9229;'+
    'border-radius:10px;background:#fff3ce;color:#271e0c;font:15px/1.6 system-ui">'+
    '<strong>OWNER REVIEW: '+safe(review.label==="NON_HALAL"?"NON-HALAL (owner only)":"DOUBTFUL")+
    '</strong> — '+safe(review.reason)+'<p>Administrative copy created '+safe(utc)+
    '. Original research dated '+safe(oldDate)+
    '. Financial prices, business analysis and original Musaffa screening have NOT been updated. '+
    'The owner label is not an independent Musaffa non-compliance determination.</p></aside>';
  updated=updated.replace(/<body\b[^>]*>/i,tag=>tag+banner);
  const newInfo=archiveInfo(newPath);
  const check=parseHtmlReport(newInfo,updated);
  if(check.ticker!==review.ticker||check.company!==parsed.company||
      check.bucket!=="nonhalal"||
      check.musaffaClassification!==parsed.musaffaClassification)
    throw Error("Administrative report verification failed for "+review.ticker);
  fs.mkdirSync(destFolder,{recursive:true});
  fs.writeFileSync(dest,updated,{flag:"wx"});
  console.log("Created new owner-reviewed nonhalal/ HTML: "+newPath+" from "+info.path);
  created++;
}
console.log("Reconciled "+registry.rows.length+" owner-designated exact securities; "+
  created+" new immutable nonhalal/ copies.");
