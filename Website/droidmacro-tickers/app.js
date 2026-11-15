(()=>{"use strict";
const $=id=>document.getElementById(id);
const baseLinks=[
["AMAT","SI4DKeXAKEeu",0],["SU.PA","AGqRtvYQbSwe",0],["MU","kSkEYClo6Dlq",0],["MA","N7TEnTWUhH_N",0],
["ABBN.SIX","H3zB-ZeLIiWh",1],["CSCO","isV8yq9d1K2O",1],["HD","i3HwsDQrn6eE",0],
["CVX","Axl8msM5XSZX",1],["ASM.XAMS","o4g85Nk_N0a8",0],["NVDA","V1IujAmtkX7-",1],
["TSLA","Td_by4w_WNSl",1],["2379.TWSE","LQOoJxRpzke6",0],["2449.TWSE","CRt2pTFpAhu6",0],
["MRK","2ZLBnJG532DG",0],["1519.TWSE","9-AU87vCgPn9",0],["2330.TWSE","1LyIJ40PCA_V",0],
["AMD","Otxh5DvX85KE",0],["2383.TWSE","ZUNJLUmbf6rw",0],["2377.TWSE","8PLyue6jBF33",0],
["2454.TWSE","d8hUq2bDd3xg",0],["LLY","gbmGEF6suojh",0],["V","4W_rGien_V9k",1],
["JNJ","EVMk-PlVmI7G",0],["PG","LoXLQm22EBVr",1],["AAPL","3aLmXgz8Td7o",1],
["XOM","ZuJsAtynUa5m",0],["3034.TWSE","8ye57TVXhIrT",0],["ORG.ASX","bkCPHtPbvxBw",0],
["KO","nXHPExw8dUiB",1]
];
const links=new Map(baseLinks.map(([ticker,token,flag])=>[ticker,{
 url:"https://macrodroidlink.com/m/"+token,
 flagged:Boolean(flag),
 expires:flag?"2026-11-22T00:00:00Z":"2026-11-21T00:00:00Z"
}]));
const negativeMusaffa=/(?:NOT\s+HALAL|NON[\s-]?COMPLIANT|NON[\s-]?HALAL|HARAM)/;
let rows=[];
let objectUrls=[];
const make=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=String(text);return el;};
const norm=s=>String(s||"").toLocaleLowerCase();
function flagged(r){
 // Same final RizqInvests-first, Investigate-second status and explicit
 // Musaffa negative classification used by the homepage's table split.
 const finalStatus=String(r.ethicalFinalStatus||"").toUpperCase();
 const red=String(r.ethicalFinalColor||"").toUpperCase()==="RED"||
   finalStatus==="UNETHICAL"||finalStatus==="BDS_LISTED";
 const classification=String(r.musaffaClassification||
   String(r.musaffa||"").split(" · ")[0]||"").trim().toUpperCase();
 return red||negativeMusaffa.test(classification);
}
function macroFor(r){
 const ticker=String(r.ticker);
 const macroName=(flagged(r)?"#NH-":"")+ticker+" searchstock";
 const delayVar={description:"Time delay for execution of chatGPT search actions",
  dictionary:{entries:[],isArray:false,variableType:4,type:"Dictionary"},
  isActionBlockWorkingVar:true,isLocalVar:false,isSecure:false,m_booleanValue:false,
  m_decimalValue:0.5,m_intValue:0,m_name:"Chatgpt_timedelay_Sec",
  m_stringValue:"",m_type:3,supportsInput:false,supportsOutput:true};
 const pause=()=>({m_classType:"PauseAction",m_SIGUID:0,
  m_delayInMilliSeconds:0,m_delayInSeconds:1,m_useAlarm:false,
  m_variable:{...delayVar,m_decimalValue:0},unitForVariables:0});
 const ui=(action,uiInteractionConfiguration)=>({m_classType:"UIInteractionAction",m_SIGUID:0,action,uiInteractionConfiguration});
 return {macroExportVersion:1,globalVariables:[delayVar],macro:{
  aiGenerated:1,m_GUID:0,m_name:macroName,
  m_description:"Launch ChatGPT and replace composer text with @search_stock "+ticker+
    ", tap send at 91% x / 55% y, then return Home. Launch via shortcut while device is unlocked.",
  m_category:"Uncategorized",m_completed:true,m_enabled:true,
  m_triggerList:[{m_classType:"ShortcutTrigger",m_SIGUID:0}],
  m_constraintList:[{m_classType:"DeviceLockedConstraint",m_SIGUID:0,m_locked:false}],
  localVariables:[],m_actionList:[
  {m_classType:"LaunchActivityAction",m_SIGUID:0,m_applicationName:"ChatGPT",
   m_packageToLaunch:"com.openai.chatgpt",m_startNew:true,m_excludeFromRecents:false,
   m_userSerial:-1,m_workProfile:false,option:0},
  pause(),pause(),
  ui(4,{forceClear:true,text:"@search_stock "+ticker,useClipboard:false,
    useNewClipboardPasteMechanism:false,type:"Paste"}),
  pause(),
  ui(0,{blocking:false,checkOverlays:false,clickOption:2,contentDescription:"",
    contextClick:false,longClick:false,showTouchLocation:true,skipCount:"0",
    textContent:"",textMatchOption:0,useRegex:false,viewId:"",xyPercentages:true,
    xyPoint:{x:91,y:55},type:"Click"}),
  pause(),{m_classType:"LaunchHomeScreenAction",m_SIGUID:0,useAccessibilityService:false}
 ]}};
}
function tdWith(...nodes){const cell=make("td");nodes.forEach(n=>cell.append(n));return cell;}
function showMacroName(fullName){
 const dialog=$("macroNameDialog");
 const value=$("fullMacroName");
 if(!dialog || !value)return;
 value.textContent=fullName;
 if(!dialog.open)dialog.showModal();
}
function renderRow(r){
 const tr=make("tr"),ticker=String(r.ticker);
 const company=make("span","company",r.company||ticker);
 const tickerLink=make("a","ticker",ticker);
 tickerLink.href="/reports/"+encodeURIComponent(ticker)+"/";
 const fullMacroName=(flagged(r)?"#NH-":"")+ticker+" searchstock";
 const name=make("span","macro-name",fullMacroName);
 name.title=fullMacroName;
 const reveal=make("button","macro-name-reveal","View");
 reveal.type="button";
 reveal.setAttribute("aria-label","View full MacroDroid macro name for "+ticker);
 reveal.addEventListener("click",()=>showMacroName(fullMacroName));
 const linkArea=make("div","link-actions");
 const current=links.get(ticker);
 if(current&&current.flagged===flagged(r)&&Date.now()<Date.parse(current.expires)){
   const link=make("a","macro-link","Install");
   link.setAttribute("aria-label","Install "+ticker+" macro in MacroDroid");
   link.href=current.url;link.target="_blank";link.rel="noopener noreferrer";
   linkArea.append(link);
 }
 const macro=macroFor(r);
 const fileURL=URL.createObjectURL(new Blob([JSON.stringify(macro,null,2)],
   {type:"application/json"}));
 objectUrls.push(fileURL);
 const download=make("a","macro-link download","Download");
 download.setAttribute("aria-label","Download "+ticker+" MacroDroid macro file");
 download.href=fileURL;
 download.download=((flagged(r)?"#NH-":"")+ticker+"_searchstock").replace(/[^#\w.-]/g,"_")+".macro";
 linkArea.append(download);
 const hint=make("small","status-copy"+(current&&Date.now()>=Date.parse(current.expires)?" expired":""),
  !current?"Permanent download available; no one-tap share link yet":
  current.flagged!==flagged(r)?"Classification changed: use the updated .macro download":
  Date.now()>=Date.parse(current.expires)?"One-tap link expired; use Download .macro":
  "One-tap sharing is temporary; the .macro download does not expire");
 tr.append(tdWith(company,tickerLink),tdWith(name,reveal),tdWith(linkArea,hint));
 return tr;
}
function fill(tableId,items,emptyText){
 const tbody=$(tableId);
 tbody.replaceChildren();
 if(!items.length){const tr=make("tr"),td=make("td","",emptyText);td.colSpan=3;tr.append(td);tbody.append(tr);return;}
 const fragment=document.createDocumentFragment();
 for(const row of items)fragment.append(renderRow(row));
 tbody.append(fragment);
}
function updateExchange(){
 const select=$("exchange"),chosen=select.value;
 const exchanges=[...new Set(rows.map(r=>String(r.exchange||"OTHER")))].sort();
 select.replaceChildren(new Option("All exchanges","all"),...exchanges.map(x=>new Option(x,x)));
 select.value=exchanges.includes(chosen)?chosen:"all";
}
function render(){
 objectUrls.forEach(x=>URL.revokeObjectURL(x));objectUrls=[];
 const query=norm($("search").value),ex=$("exchange").value,order=$("order").value;
 const visible=rows.filter(r=>(ex==="all"||String(r.exchange||"OTHER")===ex)&&
   (!query||norm(r.ticker+" "+r.company).includes(query)));
 visible.sort((a,b)=>order==="newest"?String(b.timestamp).localeCompare(String(a.timestamp))||
     String(a.ticker).localeCompare(String(b.ticker)):
   order==="company"?String(a.company).localeCompare(String(b.company)):
   String(a.ticker).localeCompare(String(b.ticker)));
 const other=visible.filter(r=>!flagged(r)),bad=visible.filter(flagged);
 fill("otherRows",other,"No other stocks match your filters.");
 fill("flaggedRows",bad,"No flagged stocks match your filters.");
 $("otherShown").textContent=other.length+" stock"+(other.length===1?"":"s");
 $("flaggedShown").textContent=bad.length+" stock"+(bad.length===1?"":"s");
 $("allCount").textContent=rows.length;
 $("otherCount").textContent=rows.filter(r=>!flagged(r)).length;
 $("flagCount").textContent=rows.filter(flagged).length;
 $("shown").textContent="Showing "+visible.length+" of "+rows.length+" tickers · "+other.length+" other / "+bad.length+" flagged";
}
async function load(){
 $("refresh").disabled=true;
 try{
   const response=await fetch("/data/reports.json",{cache:"no-store"});
   if(!response.ok)throw new Error("Report feed returned HTTP "+response.status);
   const json=await response.json();
   if(!Array.isArray(json.rows))throw new Error("Ticker feed missing rows");
   rows=[...new Map(json.rows.filter(r=>r&&r.ticker).map(r=>[String(r.ticker),r])).values()];
   updateExchange();render();
   $("notice").textContent="Latest site report data loaded. Macros follow the final homepage ethical/Musaffa classification.";
   const date=json.generatedAt?new Date(json.generatedAt):null;
   $("updated").textContent="Website report index "+(date&&!Number.isNaN(date.valueOf())?date.toLocaleString():"loaded");
 }catch(e){
   $("notice").textContent="Could not load ticker reports: "+(e&&e.message||e)+". Retry Refresh tickers.";
   $("notice").style.color="#ffb3ba";
 }finally{$("refresh").disabled=false;}
}
$("search").addEventListener("input",render);
$("exchange").addEventListener("change",render);
$("order").addEventListener("change",render);
$("refresh").addEventListener("click",load);
$("macroNameClose").addEventListener("click",()=>$("macroNameDialog").close());
$("macroNameDialog").addEventListener("click",event=>{
 if(event.target===$("macroNameDialog"))event.target.close();
});
load();
})();