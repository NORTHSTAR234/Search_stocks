(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const state={rows:[],quotes:{},loading:false,generatedAt:null,providerReady:true,githubTreeSha:null,syncing:false,cycleBusy:false};
  const escape=s=>String(s??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const fmt=iso=>{try{return new Intl.DateTimeFormat("en-AU",{timeZone:"Australia/Melbourne",day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",timeZoneName:"short"}).format(new Date(iso));}catch{return iso||"Unknown";}};
  const norm=s=>String(s??"").toUpperCase().replace(/[^A-Z0-9 ]/g," ").trim();
  const score=s=>{const m=String(s).match(/(\d{1,3})\s*\/\s*100/);return m?Number(m[1]):-1;};
  // Visual score bands only, NOT a buy/sell verdict. The two grades stay independent.
  const scoreTone=value=>{
    const n=score(value);
    return n<0||n>100?"neutral":n>=70?"good":n>=40?"warn":"bad";
  };
  function scoreCell(r){
    function item(label,value){
      const n=score(value),rated=n>=0&&n<=100&&/^\s*\d{1,3}\s*\/\s*100\s*$/.test(String(value));
      const tone=rated?scoreTone(value):"neutral";
      return '<div class="score-box '+tone+'"><span class="score-label">'+escape(label)+'</span>'+
        '<strong class="score-number '+tone+'">'+escape(rated?String(value).trim():"NOT RATED")+'</strong></div>';
    }
    return '<div class="score-pair">'+item("Investment",r.investment)+item("Entry",r.entry)+'</div>';
  }
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
  // Navigation only: links to Yahoo's own pages, never downloads or republishes Yahoo prices.
  function yahooSymbol(r) {
    const ticker=String(r?.ticker||"").toUpperCase();
    if(r.exchange==="ASX"){
      const code=ticker.replace(/\.AX$/,"");
      return /^[A-Z0-9]{2,6}$/.test(code)?code+".AX":null;
    }
    if(r.exchange==="TWSE")return /^\d{4}\.TW$/.test(ticker)?ticker:null;
    if(r.exchange==="BURSA"){
      if(ticker==="CBHB")return "0339.KL";
      const match=ticker.match(/^(\d{4})\.(?:KL|MY)$/);
      return match?match[1]+".KL":null;
    }
    return null;
  }

  function quoteMoney(currency,value){
    const unit=currency==="USD"?"US$":currency==="AUD"?"A$":currency==="TWD"?"NT$":currency==="MYR"?"RM ":currency+" ";
    return unit+Number(value).toLocaleString("en-AU",{minimumFractionDigits:2,maximumFractionDigits:3});
  }
  const quoteDirection=value=>typeof value!=="number"||!Number.isFinite(value)||value===0?"flat":value>0?"gain":"loss";
  const signedMoney=(currency,value)=>(value>0?"+":value<0?"−":"")+quoteMoney(currency,Math.abs(value));
  const signedPercent=value=>(value>0?"+":"")+value.toFixed(2)+"%";
  function quoteCell(r){
    const q=state.quotes[r.ticker.toUpperCase()];
    if(!q){
      const symbol=yahooSymbol(r);
      const link=symbol?'<small><a href="https://finance.yahoo.com/quote/'+encodeURIComponent(symbol)+'/" target="_blank" rel="noopener noreferrer">View on Yahoo Finance (delayed) ↗</a></small>':"";
      return '<span class="muted">PRICE UNAVAILABLE</span><small>No verified '+(r.exchange==="US"?"Alpaca":"EODHD")+' quote</small>'+link;
    }
    const currency=q.currency;
    if(q.feed==="IEX"&&q.regularClose&&Number(q.regularClose.price)>0){
      const c=q.regularClose;
      const valid=typeof c.regularChangePercent==="number"&&Number.isFinite(c.regularChangePercent);
      const color=quoteDirection(valid?c.regularChangePercent:null);
      const movement=valid?
        '<span class="change '+color+'">'+escape(signedMoney(currency,c.regularChangeAmount))+
        ' ('+escape(signedPercent(c.regularChangePercent))+') vs previous regular close</span>':
        '<small class="muted">Prior regular close comparison unavailable</small>';
      const iexChange=typeof q.change24hPercent==="number"&&Number.isFinite(q.change24hPercent)?
        ' · IEX 24h '+escape(signedPercent(q.change24hPercent)):"";
      return '<div class="session-prices">'+
        '<small class="price-label">Last US regular close · consolidated</small>'+
        '<strong class="quote-value '+color+'">'+escape(quoteMoney(currency,c.price))+'</strong>'+
        '<small>Session '+escape(c.sessionDate)+' · delayed SIP</small>'+movement+
        '<small>Last IEX trade: '+escape(quoteMoney(currency,q.price))+
        ' · '+escape(fmt(q.asOf))+iexChange+'</small></div>';
    }
    const p=Number(q.price);
    const isEodhd=q.feed==="EODHD";
    const change=isEodhd?q.previousCloseChangePercent:q.change24hPercent;
    const valid=typeof change==="number"&&Number.isFinite(change);
    const color=quoteDirection(valid?change:null);
    return '<div class="session-prices">'+
      '<strong class="quote-value '+color+'">'+escape(Number.isFinite(p)&&p>0?quoteMoney(currency,p):"PRICE UNAVAILABLE")+'</strong>'+
      (valid?'<span class="change '+color+'">'+escape(signedPercent(change))+
        (isEodhd?' vs previous close':' IEX 24h')+'</span>':'<small class="muted">Change unavailable</small>')+
      '<small>'+escape(q.feed||"Unknown feed")+(isEodhd?" · delayed quote":" · latest trade")+
      ' · '+escape(fmt(q.asOf))+'</small></div>';
  }
  function overnightCell(r){
    if(r.exchange!=="US")return '<small class="muted">US overnight only</small>';
    const q=state.quotes[r.ticker.toUpperCase()];
    if(!q||q.feed!=="IEX")return '<small class="muted">Overnight unavailable</small>';
    const night=q.overnight,pct=q.overnightChangePercent,amount=q.overnightChangeAmount;
    if(!q.regularClose||!night||!Number.isFinite(Number(night.price))||Number(night.price)<=0||
       typeof pct!=="number"||!Number.isFinite(pct)||
       typeof amount!=="number"||!Number.isFinite(amount))
      return '<small class="muted">No recent verified overnight indication</small>';
    const color=quoteDirection(pct);
    return '<div class="session-prices">'+
      '<small class="price-label">Indicative · 15-min delayed</small>'+
      '<strong class="quote-value overnight-value '+color+'">'+escape(quoteMoney(q.currency,night.price))+'</strong>'+
      '<span class="change '+color+'">'+escape(signedMoney(q.currency,amount))+
      ' ('+escape(signedPercent(pct))+') vs regular close</span>'+
      '<small>Observed '+escape(fmt(night.asOf))+'</small></div>';
  }
  // Show the same two-card visual treatment as Investment / Entry, retaining
  // the exact archived values. Colors distinguish field purpose, not a live signal.
  function splitReportPair(value){
    const raw=String(value??"").trim();
    if(!raw||raw==="NOT RATED")return ["NOT RATED","NOT RATED"];
    const pair=raw.match(/^([\s\S]*?)\s+\/\s+([\s\S]*)$/);
    return pair?[pair[1].trim()||"NOT RATED",pair[2].trim()||"NOT RATED"]:[raw,"NOT RATED"];
  }
  function reportRangeCard(label,value,tone){
    const missing=/^(?:NOT RATED|NOT VERIFIED|N\/A|UNAVAILABLE|UNKNOWN|NOT SET|NOT PROVIDED)$/i.test(String(value).trim());
    const color=missing?"neutral":tone;
    return '<div class="score-box range-box '+color+'">'+
      '<span class="score-label">'+escape(label)+'</span>'+
      '<strong class="range-value '+color+'">'+escape(value)+'</strong>'+
      '</div>';
  }
  function stopsCell(r){
    const [initial,noChase]=splitReportPair(r.stops);
    return '<div class="score-pair range-pair">'+
      reportRangeCard("Initial stop",initial,"bad")+
      reportRangeCard("No chase",noChase,"warn")+
      '</div>';
  }
  function zoneCell(r){
    const q=state.quotes[r.ticker.toUpperCase()];
    const bands=Array.isArray(r.zoneBands)?r.zoneBands:[];
    const verified=q&&q.currency==="USD"&&Number.isFinite(Number(q.price))&&r.nativeCurrency==="USD";
    const within=i=>verified && bands[i]&&Number(q.price)>=bands[i][0]&&Number(q.price)<=bands[i][1];
    const [preferred,acceptable]=splitReportPair(r.zones);
    return '<div class="score-pair range-pair">'+
      reportRangeCard("Preferred",preferred,"good")+
      reportRangeCard("Acceptable",acceptable,"warn")+
      '</div>'+
      (within(0)?'<small class="gain">IN PREFERRED ZONE</small>':
       within(1)?'<small class="gain">IN ACCEPTABLE ZONE</small>':"");
  }
  function tr(r){
    const action=cap(r.action,96);
    const screening=r.musaffa||"NOT VERIFIED";
    return '<tr><td><a class="ticker" href="'+escape(r.reportPath)+'">'+escape(r.ticker)+'</a><small>'+escape(r.company)+'</small><small>'+escape(r.exchange)+'</small></td>'+
    '<td>'+escape(fmt(r.timestamp))+(r.conflictingBuckets?'<small class="warning">Both buckets contain this ticker</small>':"")+'</td>'+
    '<td>'+quoteCell(r)+'</td>'+
    '<td>'+overnightCell(r)+'</td>'+
    '<td>'+badge(action,actionKind(action))+'<small>Risk: '+escape(cap(r.risk,78))+'</small><small>Own: '+escape(cap(r.ownerAction,75))+'</small></td>'+
    '<td>'+scoreCell(r)+'</td>'+
    '<td>'+escape(cap(screening,140))+(r.statusOnly?'<small class="warning">Screening only · no current investment rating</small>':"")+'<small>Folder: '+escape(r.bucket)+'</small></td>'+
    '<td>'+escape(cap(r.earnings,110))+'</td>'+
    '<td>'+zoneCell(r)+'</td>'+
    '<td>'+stopsCell(r)+'</td>'+
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
    $("rows").innerHTML=filtered.length?filtered.map(tr).join(""):'<tr><td colspan="11">No reports match your filters.</td></tr>';
    $("count").textContent=all.length;
    $("halalCount").textContent=all.filter(r=>r.bucket==="halal").length;
    $("quoteCount").textContent=Object.keys(state.quotes).length;
    $("shown").textContent="Showing "+filtered.length+" of "+all.length+" latest reports";
  }
  async function refresh(){
    if(state.loading||!state.rows.length)return;
    state.loading=true;$("refresh").disabled=true;
    const us=state.rows.filter(r=>r.exchange==="US").map(r=>r.ticker);
    const eodhdSymbols=new Set(["ORG","APA.AX","1519.TW","2330.TW","2377.TW","2379.TW","2383.TW","2449.TW","2454.TW","3034.TW","CBHB"]);
    // Newly discovered unsupported international listings must not invalidate the
    // EODHD batch for the ten already verified stocks.
    const international=state.rows.filter(r=>["ASX","TWSE","BURSA"].includes(r.exchange)&&eodhdSymbols.has(r.ticker.toUpperCase())).map(r=>r.ticker);
    const failures=[];
    async function retrieve(path,symbols,label){
      const collected={};
      for(let i=0;i<symbols.length;i+=40){
        const part=symbols.slice(i,i+40);
        if(!part.length)continue;
        try{
          const res=await fetch(path+"?symbols="+encodeURIComponent(part.join(",")),{credentials:"same-origin",cache:"no-store"});
          const data=await res.json().catch(()=>({}));
          if(!res.ok)throw Error("HTTP "+res.status+(data.error?" · "+String(data.error):""));
          if(!data.quotes||typeof data.quotes!=="object")throw Error("Invalid provider response");
          Object.assign(collected,data.quotes);
        }catch(e){failures.push(label+": "+String(e?.message||e));}
      }
      return collected;
    }
    try{
      const [usQuotes,internationalQuotes]=await Promise.all([
        retrieve("/api/prices",us,"Alpaca"),
        retrieve("/api/international-prices",international,"EODHD")
      ]);
      state.quotes={...usQuotes,...internationalQuotes};
      const usCount=Object.keys(usQuotes).length,intCount=Object.keys(internationalQuotes).length;
      $("marketNotice").textContent="Quote observations: "+(usCount+intCount)+" tickers ("+usCount+
        " US IEX · "+intCount+" international EODHD) · Updated "+fmt(new Date().toISOString())+
        " · Automatic refresh every 5 minutes while this page is visible. Quotes show source observation times; EODHD prices are delayed."+
        (failures.length?" Provider issues: "+failures.join("; "):"");
      state.providerReady=true; // One provider outage must not disable the other feed.
    }finally{state.loading=false;$("refresh").disabled=false;render();}
  }
  // A GitHub HTML report is added or replaces the same ticker's older snapshot.
  // Research history is immutable; no old scores are backfilled into new reports.
  async function syncGithubReports(){
    if(state.syncing)return false;
    state.syncing=true;
    let changed=0;
    try{
      const url="/api/github-reports"+(state.githubTreeSha?"?knownTree="+encodeURIComponent(state.githubTreeSha):"");
      const res=await fetch(url,{credentials:"same-origin",cache:"no-store"});
      const data=await res.json().catch(()=>({}));
      if(!res.ok)throw Error("GitHub HTTP "+res.status+" · "+(data.error||"Unavailable"));
      const checked=fmt(data.checkedAt||new Date().toISOString());
      if(data.unchanged){
        $("reportSyncNotice").textContent="GitHub HTML reports checked "+checked+" · No changes detected. Next check in 5 minutes while this page is visible.";
        return false;
      }
      if(!Array.isArray(data.rows))throw Error("Invalid GitHub report index");
      const map=new Map(state.rows.map(r=>[r.ticker.toUpperCase(),r]));
      for(const r of data.rows){
        if(!r||typeof r.ticker!=="string"||typeof r.timestamp!=="string"||r.sourceFormat!=="html")continue;
        const ticker=r.ticker.toUpperCase(),old=map.get(ticker);
        if(!old||r.timestamp>old.timestamp||
          r.timestamp===old.timestamp&&(old.sourceFormat!=="html"||JSON.stringify(old)!==JSON.stringify(r))){
          map.set(ticker,r);
          changed++;
        }
      }
      if(changed){
        state.rows=[...map.values()];
        render();
      }
      // A temporary GitHub blob error is retried next check, not frozen forever.
      const errors=Array.isArray(data.errors)?data.errors:[];
      if(!errors.length&&typeof data.treeSha==="string")state.githubTreeSha=data.treeSha;
      $("reportSyncNotice").textContent="GitHub HTML reports checked "+checked+" · "+
        (changed?changed+" ticker report(s) added or updated automatically.":"No newer ticker reports.")+
        " · "+(data.htmlReportCount||0)+" HTML archive(s) found."+
        (errors.length?" "+errors.length+" archive(s) unavailable; retrying next check.":" Next check in 5 minutes while this page is visible.");
      return changed>0;
    }catch(e){
      $("reportSyncNotice").textContent="GitHub HTML sync temporarily unavailable: "+String(e?.message||e)+
        ". Existing reports and market prices are preserved; retry in 5 minutes.";
      return false;
    }finally{state.syncing=false;}
  }
  async function checkAll(){
    if(state.cycleBusy)return;
    state.cycleBusy=true;
    try{
      await syncGithubReports();
      await refresh();
    }finally{state.cycleBusy=false;}
  }
  async function init(){
    try{
      const res=await fetch("/data/reports.json",{cache:"no-store"});
      if(!res.ok)throw Error("Archive index HTTP "+res.status);
      const data=await res.json();
      state.rows=Array.isArray(data.rows)?data.rows:[];
      state.generatedAt=data.generatedAt;
      $("marketNotice").textContent="Archive built "+fmt(data.generatedAt)+". Loading independent prices.";
      render();
      await refresh();
      const addedReports=await syncGithubReports();
      // A second quote request is necessary only if GitHub added or updated a ticker.
      if(addedReports)await refresh();
      setInterval(()=>{if(document.visibilityState==="visible")checkAll();},300000);
      document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")checkAll();});
    }catch(e){
      $("marketNotice").textContent="Could not load archive: "+e.message;
      $("rows").innerHTML='<tr><td colspan="11">Archive unavailable.</td></tr>';
    }
  }
  ["search","bucket","exchange","order"].forEach(id=>$(id).addEventListener(id==="search"?"input":"change",render));
  $("refresh").addEventListener("click",checkAll);
  init();
})();