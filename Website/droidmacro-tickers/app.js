(()=>{"use strict";
const $=id=>document.getElementById(id);
// Refreshed by the private DroidMacro Tickers plugin; never reuse an outdated ordinal.
let links=new Map();
const tickerAZ=(a,b)=>String(a.ticker).localeCompare(String(b.ticker),"en",{numeric:true,sensitivity:"base"});
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
// Faithful to the owner's uploaded 1519.TWSE variable-triggered 15-action macro.
function stableId(text){let h=2166136261;for(const ch of text)h=Math.imul(h^ch.charCodeAt(0),16777619)>>>0;return -1000000000-(h%900000000);}
function integerVar(name,local,value=0){return {description:"",dictionary:{entries:[],isArray:false,variableType:4,type:"Dictionary"},isActionBlockWorkingVar:true,isLocalVar:local,isSecure:false,m_booleanValue:false,m_decimalValue:value,m_intValue:value,m_name:name,m_stringValue:"",m_type:1,supportsInput:false,supportsOutput:true};}
function macroFor(r){
 const ticker=String(r.ticker),order=Number(r.myOrder),total=rows.length;
 if(!Number.isInteger(order)||order<1||order>total)throw Error("Missing My_order for "+ticker);
 const g=integerVar("chatgpt order",false,1),n=integerVar("Total_ChatGPT_Macros",false,total),l=integerVar("My_order",true,order);
 const delay={...integerVar("Chatgpt_timedelay_Sec",false,0),description:"Time delay for execution of chatGPT search actions",m_type:3,m_decimalValue:0.5};
 const wait=()=>({m_classType:"PauseAction",m_delayInMilliSeconds:0,m_delayInSeconds:1,m_useAlarm:false,m_variable:{...delay,m_decimalValue:0},unitForVariables:0});
 const launch=(name,pkg,start)=>({m_classType:"LaunchActivityAction",m_applicationName:name,m_packageToLaunch:pkg,m_startNew:start,m_excludeFromRecents:false,m_userSerial:-1,m_workProfile:false,option:0});
 const paste={m_classType:"UIInteractionAction",action:4,uiInteractionConfiguration:{forceClear:true,text:"@search_stock "+ticker,useClipboard:false,useNewClipboardPasteMechanism:false,type:"Paste"}};
 const click={m_classType:"UIInteractionAction",action:0,uiInteractionConfiguration:{blocking:false,checkOverlays:false,clickOption:2,contentDescription:"",contextClick:false,longClick:false,showTouchLocation:true,skipCount:"0",textContent:"",textMatchOption:0,useRegex:false,viewId:"",xyPercentages:true,xyPoint:{x:91,y:55},type:"Click"}};
 const set=(num,inc)=>({m_classType:"SetVariableAction",m_variable:g,m_newIntValue:num,m_intValueIncrement:inc,m_intValueDecrement:false,m_intExpression:false,m_intRandom:false,m_userPrompt:false});
 const ifLast={m_classType:"IfConditionAction",m_isOrCondition:false,m_constraintList:[{m_classType:"MacroDroidVariableConstraint",m_variable:g,m_intCompareVariable:true,m_otherValueToCompare:n,m_intValue:100,m_intGreaterThan:false,m_intLessThan:false,m_intNotEqual:false}]};
 const trigger={m_classType:"VariableTrigger",m_variable:g,m_intCompareVariable:true,m_otherValueToCompare:l,m_intValue:0,m_intGreaterThan:false,m_intLessThan:false,m_intNotEqual:false,m_anyValueChange:false,m_SIGUID:stableId(ticker+":trigger")};
 const actions=[wait(),launch("ChatGPT","com.openai.chatgpt",true),wait(),wait(),paste,wait(),click,wait(),launch("MacroDroid","com.arlosoft.macrodroid",false),wait(),ifLast,set(0,false),{m_classType:"TerminateRunningAction"},{m_classType:"EndIfAction"},set(0,true)].map((action,i)=>({...action,m_SIGUID:stableId(ticker+":action:"+i)}));
 return {globalVariables:[g,delay,n],macro:{aiGenerated:2,m_GUID:stableId("droidmacro:"+ticker),m_name:(flagged(r)?"#NH-":"")+ticker+" searchstock",m_description:"Runs @search_stock "+ticker+" when My_order is "+order+" of "+total+"; returns to MacroDroid; resets counter after last ticker.",m_category:"Uncategorized",m_completed:true,m_enabled:true,m_triggerList:[trigger],m_constraintList:[{m_classType:"DeviceLockedConstraint",m_locked:false,m_SIGUID:stableId(ticker+":constraint")}],localVariables:[l],m_actionList:actions},macroExportVersion:1};
}
function tdWith(...nodes){const cell=make("td");nodes.forEach(n=>cell.append(n));return cell;}
function renderRow(r){
 const tr=make("tr"),ticker=String(r.ticker);
 const company=make("span","company",r.company||ticker);
 const tickerLink=make("a","ticker",ticker);
 tickerLink.href="/reports/"+encodeURIComponent(ticker)+"/";
 const fullMacroName=(flagged(r)?"#NH-":"")+ticker+" searchstock";
 const name=make("span","macro-name",fullMacroName);
 name.title=fullMacroName;
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
 tr.append(tdWith(company,tickerLink),tdWith(name),tdWith(linkArea,hint));
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
load();
})();