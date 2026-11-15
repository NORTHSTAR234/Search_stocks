// New Search_stock research archive QA. Historical reports are immutable and are
// not retroactively failed: these acceptance checks apply only to NEW full HTML
// report filenames after the 15 Nov 2026 owner-approved analysis gate.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,readdirSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=fileURLToPath(new URL("../../",import.meta.url));
const cutover="2026-11-14T20-00-00Z"; // owner morning Sun 15 Nov, Melbourne time
const findReports=()=>{
  const result=[];
  for(const bucket of ["halal","nonhalal"]){
    const dir=path.join(root,bucket);
    for(const ticker of readdirSync(dir,{withFileTypes:true}).filter(x=>x.isDirectory())){
      for(const file of readdirSync(path.join(dir,ticker.name))){
        if(!file.endsWith(".html"))continue;
        const marker=file.match(/_(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}Z)\.html$/);
        if(!marker)continue;
        const date=marker[1].replace("_","T");
        if(date>=cutover.replace("T","T"))
          result.push(path.join(dir,ticker.name,file));
      }
    }
  }
  return result;
};
function visibleText(html){
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ")
    .replace(/<[^>]+>/g," ").replace(/&[a-zA-Z]+;/g," ")
    .replace(/\s+/g," ").toLowerCase();
}
const slots=[
  ["what matters now",/what matters now/],
  ["why the stock moved",/why\s+(?:the\s+)?(?:share|stock|price|share price|stock price)\s+(?:price\s+)?(?:rose|fell|dropped|declined|moved|is rising|is falling|is dropping)|why it (?:rose|fell|moved)/],
  ["near-future events calendar",/upcoming events (?:that could move|to watch|calendar)|events that could move the price/],
  ["bearish, mixed and bullish possible reactions",null],
  ["downside stress",/how much further could it fall|downside stress/],
  ["constructive versus caution",null]
];
export function missingDepthSlots(html){
  const v=visibleText(html);
  const miss=[];
  for(const [name,regex] of slots){
    if(regex&&!regex.test(v))miss.push(name);
  }
  if(!(/bearish/.test(v)&&/mixed/.test(v)&&/bullish/.test(v)))miss.push("bearish, mixed and bullish possible reactions");
  if(!(/mild/.test(v)&&/moderate/.test(v)&&/severe/.test(v)))miss.push("mild, moderate and severe stress rows");
  if(!(/reasons to remain constructive/.test(v)&&/reasons for caution/.test(v)))miss.push("constructive versus caution");
  return miss;
}
test("master Aya rules require real news and catalyst coverage, not generic risk prose",()=>{
  const prompt=readFileSync(path.join(root,"Aya_Prompt.md"),"utf8");
  assert.match(prompt,/### 17A\. NEWS-DRIVEN PRICE MOVES/);
  assert.match(prompt,/### 17B\. PRE-PUBLICATION PRICE-DRIVER \/ EVENT-CALENDAR ACCEPTANCE GATE/);
  assert.match(prompt,/Hard QA — DO NOT PUBLISH/i);
});
test("report depth validator detects absent event calendar, scenario and driver sections",()=>{
  const good=["What matters now","Why the price moved","Upcoming events that could move the price",
    "Bearish","Mixed","Bullish","How much further could it fall?","Mild","Moderate",
    "Severe","Reasons to remain constructive","Reasons for caution"].join(" ");
  assert.deepEqual(missingDepthSlots("<main>"+good+"</main>"),[]);
  const bad="<main><h2>F · Risks, events, why shares are volatile</h2>"+
    "<p>Semiconductor market prices could rise or fall due to macro risks.</p></main>";
  assert(missingDepthSlots(bad).length>=5);
  const hidden="<script type=\"application/json\">{\"What matters now\":\"Why the price moved\"}</script>";
  assert(missingDepthSlots(hidden).includes("what matters now"),"hidden JSON cannot satisfy visible report gate");
});
test("new dated full HTML reports meet mandatory six visible analysis slots",()=>{
  for(const file of findReports()){
    const html=readFileSync(file,"utf8");
    // The research-depth rule is only for complete full reports.
    const snapshot=html.match(/<script\b[^>]*id=["']aya-report-snapshot["'][^>]*>([\s\S]*?)<\/script>/i);
    assert(snapshot,"Missing canonical snapshot "+file);
    const data=JSON.parse(snapshot[1]);
    if(data.report_type!=="full")continue; // legacy screening-only parser compatibility
    assert.deepEqual(missingDepthSlots(html),[],
      "Price/news/event research depth missing from "+path.relative(root,file));
  }
});
