(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const state={rows:[],quotes:{},loading:false,generatedAt:null,providerReady:true};
  const escape=s=>String(s??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const fmt=iso=>{try{return new Intl.DateTimeFormat("en-AU",{timeZone:"Australia/Melbourne",day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",timeZoneName:"short"}).format(new Date(iso));}catch{return iso||"Unknown";}};
  const norm=s=>String(s??"").toUpperCase().replace(/[^A-Z0-9 ]/g," ").trim();
  const score=s=>{const m=String(s).match(/(\d{1,3})\s*\/\s*100/);return m?Number(m[1]):-1;};
  const badge=(value,kind)=>'<span class="badge '+kind+'">'+escape(value)+'</span>';
  // Rate the leading verdict only. "WATCH — wait for buy-zone" is WATCH, never BUY.
  const actionKind=v=>{
    const verdict=String(v||"").replace(/^[^A-Za-z]+/,"").trim().toUpperCase();
    if(/^(STRONG\s+BUY|BUY)\b/.test(verdict))return "good";
    if(/^(SELL|AVOID|REDUCE|EXIT|STRONG\s+SELL)\b/.test(verdict))return "bad";
    if(/^(WATCH|WAIT)\b/.test(verdict))return "warn";
    return "neutral";
  };
  const cap=(v,n=95)=>{let s=String(v||"NOT RATED");return s.length>n?s.slice(0,n-1)+"…":s;};
  function quoteCell(r){
    const q=state.quotes[r.ticker.toUpperCase()];
    if(!q)return '<span class="muted">LIVE DATA UNAVAILABLE</span><small>Not connected / unsupported</small>';
    const p=Number(q.price),currency=q.currency==="USD"?"US$":q.currency==="AUD"?"A$":q.currency+" ";
    const price=Number.isFinite(p)?currency+p.toLocaleString("en-AU",{minimumFractionDigits:2,maximumFractionDigits:3}):"LIVE DATA UNAVAILABLE";
    const change=typeof q.change24hPercent==="number"&&Number.isFinite(q.change24hPercent)?
      '<span class="change '+(q.change24hPercent<0?"loss":q.change24hPercent>0?"gain":"flat")+'">'+
      (q.change24hPercent>0?"+":"")+q.change24hPercent.toFixed(2)+'%</span>':
      '<span class="muted">24h N/A</span>';
    return '<strong>'+escape(price)+'</strong><small>'+change+' · '+escape(q.session==="latest_trade"?"latest IEX trade":q.session||"status unverified")+
      '<br>'+escape(q.feed||"feed unspecified")+' · '+escape(fmt(q.asOf))+'</small>'+
      (q.reference24hAsOf?'<small>24h reference: '+escape(fmt(q.reference24hAsOf))+'</small>':"");
  }
  function zoneCell(r){
    const q=state.quotes[r.ticker.toUpperCase()];
    const bands=Array.isArray(r.zoneBands)?r.zoneBands:[];
    const verified=q&&q.currency==="USD"&&Number.isFinite(Number(q.price))&&r.nativeCurrency==="USD";
    const within=i=>verified && bands[i]&&Number(q.price)>=bands[i][0]&&Number(q.price)<=bands[i][1];
    return '<span class="'+(within(0)?"zone-good":within(1)?"zone-okay":"")+'">'+escape(cap(r.zones,105))+'</span>'+
      (within(0)?'<small class="gain">IN PREFERRED ZONE</small>':within(1)?'<small class="gain">IN ACCEPTABLE ZONE</small>':"");
  }
  function tr(r){
    const action=cap(r.action,96);
    const screening=r.statusOnly?"SCREENING ONLY — NO INVESTMENT REPORT":r.musaffa;
    return '<tr><td><a class="ticker" href="'+escape(r.reportPath)+'">'+escape(r.ticker)+'</a><small>'+escape(r.company)+'</small><small>'+escape(r.exchange)+'</small></td>'+
    '<td>'+escape(fmt(r.timestamp))+(r.conflictingBuckets?'<small class="warning">Both buckets contain this ticker</small>':"")+'</td>'+
    '<td>'+quoteCell(r)+'</td>'+
    '<td>'+badge(action,actionKind(action))+'<small>Risk: '+escape(cap(r.risk,78))+'</small><small>Own: '+escape(cap(r.ownerAction,75))+'</small></td>'+
    '<td><strong>'+escape(cap(r.investment,48))+'</strong><small>Entry: '+escape(cap(r.entry,48))+'</small></td>'+
    '<td>'+escape(cap(screening,140))+'<small>Folder: '+escape(r.bucket)+'</small></td>'+
    '<td>'+escape(cap(r.earnings,110))+'</td>'+
    '<td>'+zoneCell(r)+'</td>'+
    '<td>'+escape(cap(r.stops,110))+'</td>'+
    '<td><a href="'+escape(r.reportPath)+'">HTML report</a><small><a href="'+escape(r.reportUrl)+'" target="_blank" rel="noopener noreferrer">Original GitHub</a></small></td></tr>';
  }
  function render(){
    const query=norm($("search").value),bucket=$("bucket").value,exchange=$("exchange").value,order=$("order").value;
    const all=state.rows;
    const filtered=all.filter(r=>(bucket==="all"||r.bucket===bucket)&&(exchange==="all"||r.exchange===exchange)&&
      (!query||norm(r.ticker+" "+r.company).includes(query)));
    filtered.sort((a,b)=>order==="ticker"?a.ticker.localeCompare(b.ticker):
      order==="entry"?score(b.entry)-score(a.entry)||b.timestamp.localeCompare(a.timestamp):
      order==="investment"?score(b.investment)-score(a.investment)||b.timestamp.localeCompare(a.timestamp):
      b.timestamp.localeCompare(a.timestamp)||a.ticker.localeCompare(b.ticker));
    $("rows").innerHTML=filtered.length?filtered.map(tr).join(""):'<tr><td colspan="10">No reports match your filters.</td></tr>';
    $("count").textContent=all.length;
    $("halalCount").textContent=all.filter(r=>r.bucket==="halal").length;
    $("quoteCount").textContent=Object.keys(state.quotes).length;
    $("shown").textContent="Showing "+filtered.length+" of "+all.length+" latest reports";
  }
  async function refresh(){
    if(state.loading||!state.rows.length)return;
    state.loading=true;$("refresh").disabled=true;
    const symbols=state.rows.filter(r=>r.exchange==="US").map(r=>r.ticker);
    try{
      if(!symbols.length)throw Error("No supported US tickers");
      let combined={};let count=0;
      for(let i=0;i<symbols.length;i+=40){
        const res=await fetch("/api/prices?symbols="+encodeURIComponent(symbols.slice(i,i+40).join(",")),{credentials:"same-origin",cache:"no-store"});
        const data=await res.json().catch(()=>({}));
        if(!res.ok){
          const code=typeof data.error==="string"?data.error:"UNKNOWN";
          const upstream=typeof data.upstreamError==="string"?"/"+data.upstreamError:"";
          const providerStatus=Number.isInteger(data.upstreamStatus)?" (upstream "+data.upstreamStatus+")":"";
          throw Error("HTTP "+res.status+" · "+code+upstream+providerStatus);
        }
        if(!data||typeof data.quotes!=="object")throw Error("Invalid provider response");
        Object.assign(combined,data.quotes);count++;
      }
      state.quotes=combined;
      $("marketNotice").textContent="Quote observations: "+Object.keys(combined).length+" tickers · Update requested "+fmt(new Date().toISOString())+
        ". All other fields are archived. Data may be delayed.";
    }catch(error){
      state.quotes={};
      const message=String(error.message||error);
      state.providerReady=!/503/.test(message);
      $("marketNotice").textContent="Live IEX quotes unavailable: "+message+". This report dashboard remains usable; no old report prices are substituted.";
    }finally{state.loading=false;$("refresh").disabled=false;render();}
  }
  async function init(){
    try{
      const res=await fetch("/data/reports.json",{cache:"no-store"});
      if(!res.ok)throw Error("Archive index HTTP "+res.status);
      const data=await res.json();
      state.rows=Array.isArray(data.rows)?data.rows:[];
      state.generatedAt=data.generatedAt;
      $("marketNotice").textContent="Archive built "+fmt(data.generatedAt)+". Live market integration pending.";
      render();await refresh();
      setInterval(()=>{if(document.visibilityState==="visible"&&state.providerReady)refresh();},60000);
      document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")refresh();});
    }catch(e){$("marketNotice").textContent="Could not load archive: "+e.message;$("rows").innerHTML='<tr><td colspan="10">Archive unavailable.</td></tr>';}
  }
  ["search","bucket","exchange","order"].forEach(id=>$(id).addEventListener(id==="search"?"input":"change",render));
  $("refresh").addEventListener("click",refresh);
  init();
})();