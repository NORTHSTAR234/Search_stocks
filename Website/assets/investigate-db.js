(() => {
 "use strict";
 const $=id=>document.getElementById(id);
 let rows=[],filtered=[],page=1, rizqByTicker=new Map();
 const flags=[["divestment_shortlist","Divestment shortlist"],["prisons","Prisons"],
  ["occupations","Occupations"],["borders","Borders"]];
 const clean=x=>String(x??"").toLocaleLowerCase("en").trim();
 const issuerKey=x=>String(x||"").toUpperCase().replace(/&/g," AND ")
  .replace(/[^A-Z0-9]+/g," ").split(/\s+/)
  .filter(y=>y&&!["THE","INC","INCORPORATED","CORP","CORPORATION","CO","COMPANY","LTD","LIMITED","PLC"].includes(y)).join(" ");
 const issuerMatches=(a,b)=>{const x=issuerKey(a),y=issuerKey(b);return Boolean(x&&y&&(x===y||x.startsWith(y+" ")||y.startsWith(x+" ")));};
 function cell(row,txt,cls){
  const td=document.createElement("td");td.textContent=String(txt??"—");if(cls)td.className=cls;row.append(td);return td;
 }
 function badge(row,label,cls){
  const span=document.createElement("span");span.className="badge "+cls;span.textContent=label;row.append(span);return span;
 }
 function sourceLink(cellElement,url,label){
  const a=document.createElement("a");a.href=url;a.rel="noopener noreferrer";a.target="_blank";
  a.className="source-link";a.textContent=label+" ↗";cellElement.append(a);
 }
 function sourceMatch(item){
  if(!["NYSE","NASDAQ","AMEX"].includes(item.exchange))return null;
  const v=rizqByTicker.get(item.ticker);
  return v&&issuerMatches(v.company,item.company)?v:null;
 }
 function matches(){
  const q=clean($("investigateSearch").value),category=$("investigateTheme").value,
   shortlist=$("investigateShortlist").value,exchange=$("investigateExchange").value;
  filtered=rows.filter(r=>(!q||clean([r.ticker,r.company,r.short_name,r.summary,r.industry,r.country_hq,r.isin].join(" ")).includes(q))&&
   (!category||r[category]===true)&&(!shortlist||(shortlist==="yes"?r.divestment_shortlist:r.divestment_shortlist===false))&&
   (!exchange||r.exchange===exchange));
  filtered.sort((a,b)=>a.company.localeCompare(b.company));
 }
 function createRow(r){
  const tr=document.createElement("tr");
  cell(tr,r.ticker,"ticker");cell(tr,r.company,"company");
  cell(tr,r.exchange,"type");
  const types=cell(tr,"");for(const [key,label] of flags)if(r[key])badge(types,label,key==="divestment_shortlist"?"unethical":"neutral");
  const details=cell(tr,r.summary||"Not specified","investigate-summary");
  details.title="Source-supplied summary; historical attribution, not independently verified";
  const comparison=cell(tr,"");
  const overlap=sourceMatch(r);
  if(overlap){
   badge(comparison,overlap.ethical_label,overlap.ethical_label==="Unethical"?"unethical":"neutral");
   if(overlap.bds_badge===true)badge(comparison,"RizqInvests BDS badge","bds");
   const more=document.createElement("div");more.className="investigate-mini-link";
   sourceLink(more,overlap.source_url,"RizqInvests Nov 2026");comparison.append(more);
  }else comparison.textContent="No verified issuer match";
  const original=cell(tr,"");
  if(r.source_link_warning){badge(original,"Link mismatch in source","uncertain");original.title=r.source_link_warning;}
  else sourceLink(original,r.source_url,"Investigate entry");
  return tr;
 }
 function render(){
  matches();
  const size=Number($("investigatePageSize").value)||25,max=Math.max(1,Math.ceil(filtered.length/size));
  page=Math.min(page,max);
  const start=(page-1)*size,visible=filtered.slice(start,start+size),body=$("investigateRows");
  body.replaceChildren();
  if(!visible.length){const tr=document.createElement("tr");cell(tr,"No matching entries. Adjust the filters.","empty-state").colSpan=7;body.append(tr);}
  else {const f=document.createDocumentFragment();for(const item of visible)f.append(createRow(item));body.append(f);}
  $("investigateMatches").textContent=String(filtered.length);
  $("investigateShown").textContent=filtered.length?"Showing "+(start+1)+"–"+(start+visible.length)+" of "+filtered.length:"No matching rows";
  $("investigatePager").textContent=page+" / "+max;
  $("investigatePrev").disabled=page<=1;
  $("investigateNext").disabled=page>=max;
  $("investigateExport").disabled=!filtered.length;
 }
 function csvCell(value){
  let s=String(value===true?"Yes":value===false?"No":value??"");
  if(/^[\s]*[=+\-@]/.test(s))s="'"+s;
  return '"'+s.replaceAll('"','""')+'"';
 }
 function exportCsv(){
  const cols=[["Ticker","ticker"],["Company","company"],["Exchange","exchange"],["ISIN","isin"],
    ["Summary","summary"],["Divestment shortlist","divestment_shortlist"],
    ["Prisons","prisons"],["Occupations","occupations"],["Borders","borders"],["Source","source_url"]];
  const data=[cols.map(x=>csvCell(x[0])).join(",")];
  for(const r of filtered)data.push(cols.map(x=>csvCell(r[x[1]])).join(","));
  const blob=new Blob(["\ufeff"+data.join("\r\n")],{type:"text/csv;charset=utf-8"});
  const link=document.createElement("a"),href=URL.createObjectURL(blob);
  link.href=href;link.download="investigate-july-2025-user-snapshot.csv";
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(href),1000);
 }
 async function main(){
  for(const id of ["investigateSearch","investigateTheme","investigateShortlist","investigateExchange","investigatePageSize"])
   $(id).addEventListener(id==="investigateSearch"?"input":"change",()=>{page=1;render();});
  $("investigatePrev").addEventListener("click",()=>{page=Math.max(1,page-1);render();});
  $("investigateNext").addEventListener("click",()=>{page++;render();});
  $("investigateExport").addEventListener("click",exportCsv);
  $("investigateReset").addEventListener("click",()=>{
   for(const id of ["investigateSearch","investigateTheme","investigateShortlist","investigateExchange"])$(id).value="";
   $("investigatePageSize").value="25";page=1;render();$("investigateSearch").focus();
  });
  try{
   const response=await fetch("/data/investigate-ethical-concerns-2025-07.json",{cache:"no-store",credentials:"same-origin"});
   if(!response.ok)throw Error("HTTP "+response.status);
   const data=await response.json();
   if(data.schema_version!==1||data.source_period!=="2025-07"||data.ticker_count!==255||
      !Array.isArray(data.rows)||data.rows.length!==255||
      data.rows.some(r=>!r.company||!r.ticker||!r.summary||!/^https:\/\/investigate\.info\//.test(r.source_url)))
     throw Error("Investigate dataset did not pass source checks");
   rows=data.rows;
   $("investigateTotal").textContent=String(rows.length);
   $("investigateShortlistCount").textContent=String(rows.filter(r=>r.divestment_shortlist).length);
   $("investigateOccupationCount").textContent=String(rows.filter(r=>r.occupations).length);
   for(const x of [...new Set(rows.map(r=>r.exchange))].sort()){
    const el=document.createElement("option");el.value=x;el.textContent=x;$("investigateExchange").append(el);
   }
   try{
    const r=await fetch("/data/rizqinvests-ethical-bds-2026-11.json",{cache:"no-store",credentials:"same-origin"});
    if(r.ok){const v=await r.json();if(v.source_period==="2026-11"&&Array.isArray(v.rows))
      rizqByTicker=new Map(v.rows.map(x=>[x.ticker,x]));}
   }catch{ /* Source comparison is optional; Investigate table remains available. */ }
   render();
  }catch(e){
   $("investigateMatches").textContent="Unavailable";$("investigateShown").textContent="Source unavailable";
   const tr=document.createElement("tr");cell(tr,"Could not load the preserved Investigate dataset: "+String(e.message||e),"empty-state").colSpan=7;
   $("investigateRows").replaceChildren(tr);
  }
 }
 main();
})();
