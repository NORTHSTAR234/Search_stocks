(()=>{"use strict";
const $=id=>document.getElementById(id);
const escape=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const stamp=s=>{try{return new Intl.DateTimeFormat("en-AU",{timeZone:"Australia/Melbourne",day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",timeZoneName:"short"}).format(new Date(s));}catch{return "N/A";}};
const money=(cur,n)=>typeof n==="number"&&Number.isFinite(n)?new Intl.NumberFormat("en-AU",{style:"currency",currency:/^[A-Z]{3}$/.test(cur||"")?cur:"USD",minimumFractionDigits:2,maximumFractionDigits:2}).format(n):"—";
const signalTone={BUY:"good",SELL:"bad",WATCH:"warn",HOLD:"neutral",NO_SIGNAL:"neutral"};
const order={BUY:0,SELL:1,WATCH:2,HOLD:3,NO_SIGNAL:4};
let raw=[],date=null,meta=null;
function cell(r){
 const s=r.technicalSignal||"NO_SIGNAL",tone=signalTone[s]||"neutral";
 const zone=r.entryLow!=null&&r.entryHigh!=null?money(r.currency,r.entryLow)+"–"+money(r.currency,r.entryHigh):"Not rated";
 const levels=r.stop!=null&&r.target!=null?
    "<small>Risk / stop: "+escape(money(r.currency,r.stop))+"</small><small>Target (illustrative): "+escape(money(r.currency,r.target))+"</small>":"<small>No risk levels</small>";
 const link=typeof r.reportUrl==="string"&&r.reportUrl.startsWith("/")?r.reportUrl:"/";
 const sh=r.shariah==="VERIFIED_HALAL"?"Verified recently":r.shariah==="STALE_SCREENING"?"Stale screening":"Not verified";
 return "<tr><td><a class=\"ticker\" href=\""+escape(link)+"\">"+escape(r.ticker)+"</a><small>"+escape(r.company)+"</small><small>"+escape(r.exchange)+" · "+escape(r.currency)+"</small></td>"+
 "<td><span class=\"badge "+tone+"\">"+escape(s)+"</span><small>"+escape(r.status==="OK"?"Technical, not an order":r.status)+"</small></td>"+
 "<td><strong>"+escape(money(r.currency,r.close))+"</strong><small>"+escape(r.sessionDate||"No recent session")+"</small><small>"+escape(r.feed||"Feed unavailable")+"</small></td>"+
 "<td>"+escape(zone)+levels+"</td>"+
 "<td>"+(r.score==null?"—":escape(String(r.score))+"/100")+"<small>RSI14 "+escape(r.rsi==null?"N/A":r.rsi)+" · R:R "+escape(r.riskReward==null?"N/A":r.riskReward)+"</small></td>"+
 "<td>"+escape((r.reasons||[]).join(" · ")||"Data not sufficient")+"<small>Shariah: "+escape(sh)+"</small><small>Archived report: "+escape(r.archivedReportAction||"N/A")+"</small></td></tr>";
}
function render(){
 const search=String($("ds-search")?.value||"").toUpperCase();
 const signal=$("ds-filter")?.value||"all";
 const display=raw.filter(r=>(signal==="all"||r.technicalSignal===signal)&&
  (String(r.ticker||"").toUpperCase().includes(search)||String(r.company||"").toUpperCase().includes(search)))
  .sort((a,b)=>(order[a.technicalSignal]??5)-(order[b.technicalSignal]??5)||
  a.ticker.localeCompare(b.ticker));
 $("ds-rows").innerHTML=display.length?display.map(cell).join(""):'<tr><td colspan="6">No matching daily signals</td></tr>';
 $("ds-showing").textContent=display.length+" of "+raw.length+" tracked stocks";
 const tallies={};for(const r of raw)tallies[r.technicalSignal]=(tallies[r.technicalSignal]||0)+1;
 $("ds-counts").textContent=["BUY","WATCH","HOLD","SELL","NO_SIGNAL"].map(k=>k+": "+(tallies[k]||0)).join("  ·  ");
 $("ds-date").textContent=meta?"Generated "+stamp(meta.generatedAt)+" · US report day "+meta.usRunDate:"Awaiting first report";
 $("ds-notice").textContent=meta?"Research-only technical signals. Alpaca IEX is not consolidated; Yahoo international data is delayed. Entry/stop/target levels are illustrative and are not orders.":"Waiting for a dated signal report.";
}
async function load(){
 $("ds-refresh").disabled=true;
 $("ds-notice").textContent="Retrieving owner-only daily signals…";
 try{
  const r=await fetch("/api/daily-signals",{credentials:"same-origin",cache:"no-store"});
  const data=await r.json();
  if(!r.ok||data.status&&!Array.isArray(data.rows))
   throw Error(data.status||"Daily report service unavailable");
  raw=Array.isArray(data.rows)?data.rows:[];meta=data.kind?data:null;render();
 }catch(e){
  $("ds-notice").textContent="Daily signals unavailable: "+String(e.message||"Unknown error")+". Existing archived reports are unaffected.";
  raw=[];meta=null;$("ds-rows").innerHTML='<tr><td colspan="6">No verified daily report available.</td></tr>';
 }finally{$("ds-refresh").disabled=false;}
}
$("ds-search").addEventListener("input",render);
$("ds-filter").addEventListener("change",render);
$("ds-refresh").addEventListener("click",load);
load();
})();