(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const state={rows:[],quotes:{},markets:{},loading:false,generatedAt:null,providerReady:true,githubTreeSha:null,syncing:false,cycleBusy:false};
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
  // Exchange-local weekday trading times; Sydney conversion is recalculated
  // for today's date, so both Australian and overseas daylight saving apply.
  // Public holidays are intentionally ignored at the owner's request.
  function marketParts(date,zone){
    const parts=new Intl.DateTimeFormat("en-GB",{
      timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",
      hour:"2-digit",minute:"2-digit",hourCycle:"h23"
    }).formatToParts(date);
    const o={};
    for(const p of parts)if(p.type!=="literal")o[p.type]=Number(p.value);
    return o;
  }
  function zonedSessionTime(local,hhmm,zone){
    const [hour,minute]=hhmm.split(":").map(Number);
    const target=Date.UTC(local.year,local.month-1,local.day,hour,minute);
    let guess=target;
    for(let i=0;i<4;i++){
      const p=marketParts(new Date(guess),zone);
      const actual=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute);
      const diff=target-actual;
      guess+=diff;
      if(diff===0)break;
    }
    return new Date(guess);
  }
  function marketStatus(r,now=new Date()){
    try{
      const name=String(r.exchange||"").toUpperCase();
      const registry=state.markets||{};
      const key=(registry.aliases||{})[name]||name;
      const fallback=registry.markets?.[key];
      const ms=r.marketSchedule;
      const m=ms&&ms.market_time_zone&&Array.isArray(ms.sessions)&&Array.isArray(ms.weekdays)?
        {timeZone:ms.market_time_zone,sessions:ms.sessions,weekdays:ms.weekdays}:fallback;
      if(!m||!m.timeZone||!m.sessions?.length||!m.weekdays?.length)return null;
      const local=marketParts(now,m.timeZone);
      const weekday=new Date(Date.UTC(local.year,local.month-1,local.day)).getUTCDay()||7;
      const minutes=local.hour*60+local.minute;
      const open=m.weekdays.includes(weekday)&&m.sessions.some(v=>{
        const [sh,sm]=v.start.split(":").map(Number),[eh,em]=v.end.split(":").map(Number);
        return sh*60+sm<=minutes&&minutes<eh*60+em;
      });
      const sydney=new Intl.DateTimeFormat("en-AU",{timeZone:"Australia/Sydney",
        hour:"2-digit",minute:"2-digit",hour12:false,timeZoneName:"short"});
      const hours=m.sessions.map(v=>{
        const a=zonedSessionTime(local,v.start,m.timeZone),b=zonedSessionTime(local,v.end,m.timeZone);
        return sydney.format(a)+"–"+sydney.format(b);
      }).join(" / ");
      return {open,hours,market:key};
    }catch{return null;}
  }

  // Yahoo external navigation is a fallback only; pricing comes from owner-only KV.
  function yahooSymbol(r) {
    const ticker=String(r?.ticker||"").toUpperCase();
    const override=state.markets?.sourceSymbolOverrides?.[ticker];
    if(override)return override;
    const market=r.marketSchedule?.yahoo_ticker;
    if(typeof market==="string"&&/^[A-Z0-9.^-]{1,25}$/i.test(market))return market;
    if(r.exchange==="ASX"){
      const code=ticker.replace(/\.(?:ASX|AX)$/,"");
      return /^[A-Z0-9]{2,8}$/.test(code)?code+".AX":null;
    }
    if(r.exchange==="TWSE")return /^\d{4}\.(?:TW|TWSE)$/.test(ticker)?ticker.replace(/\.TWSE$/,".TW"):null;
    if(r.exchange==="BURSA"||r.exchange==="MYX"){
      const base=ticker.replace(/\.(?:MYX|KL)$/,"");
      return /^\d{4}$/.test(base)?base+".KL":null;
    }
    const key=state.markets?.aliases?.[r.exchange]||r.exchange;
    const suffix=state.markets?.markets?.[key]?.yahooSuffix;
    return suffix&&ticker.endsWith("."+key)?ticker.slice(0,-key.length-1)+suffix:null;
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
      return '<span class="muted">PRICE UNAVAILABLE</span><small>'+(r.exchange==="US"?"No verified Alpaca":"No cached international quote")+' quote</small>'+link;
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
    const isEodhd=q.feed==="EODHD"||q.feed==="YFINANCE_YAHOO_5M_BAR_DELAYED";
    const change=isEodhd?q.previousCloseChangePercent:q.change24hPercent;
    const valid=typeof change==="number"&&Number.isFinite(change);
    const color=quoteDirection(valid?change:null);
    return '<div class="session-prices">'+
      '<strong class="quote-value '+color+'">'+escape(Number.isFinite(p)&&p>0?quoteMoney(currency,p):"PRICE UNAVAILABLE")+'</strong>'+
      (valid?'<span class="change '+color+'">'+escape(signedPercent(change))+
        (isEodhd?' vs previous close':' IEX 24h')+'</span>':'<small class="muted">Change unavailable</small>')+
      '<small>'+escape(q.feed==="YFINANCE_YAHOO_5M_BAR_DELAYED"?"Yahoo Finance · 5-min bar (delayed)":(q.feed||"Unknown feed"))+(isEodhd?" · delayed observation":" · latest trade")+
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
  // Compare only exact-listing USD Alpaca observations with numeric USD zones
  // from this report. Do not treat archived prices as quotes or silently convert FX.
  function zonePosition(price,bands){
    if(typeof price!=="number"||!Number.isFinite(price)||price<=0)return null;
    const valid=b=>Array.isArray(b)&&b.length===2&&b.every(x=>typeof x==="number"&&Number.isFinite(x)&&x>0&&x<=1e9)&&b[1]>=b[0];
    const preferred=valid(bands?.[0])?bands[0]:null;
    const acceptable=valid(bands?.[1])?bands[1]:null;
    if(!preferred&&!acceptable)return null;
    const between=(b)=>b&&price>=b[0]&&price<=b[1];
    if(between(preferred))return {kind:"preferred",text:"inside preferred buy zone",distance:null};
    if(between(acceptable))return {kind:"acceptable",text:"inside acceptable buy zone",distance:null};
    const lowest=Math.min(...[preferred,acceptable].filter(Boolean).map(b=>b[0]));
    const highest=Math.max(...[preferred,acceptable].filter(Boolean).map(b=>b[1]));
    const ordered=preferred&&acceptable&&preferred[1]<acceptable[0];
    const labelBelow=ordered?"preferred":preferred&&!acceptable?"preferred":!preferred&&acceptable?"acceptable":"both";
    const labelAbove=ordered?"acceptable":preferred&&!acceptable?"preferred":!preferred&&acceptable?"acceptable":"both";
    if(price<lowest)return {kind:"below",text:"below "+labelBelow+" buy zone"+(labelBelow==="both"?"s":""),distance:Math.round((lowest-price)/lowest*1000)/10};
    if(price>highest)return {kind:"above",text:"above "+labelAbove+" buy zone"+(labelAbove==="both"?"s":""),distance:Math.round((price-highest)/highest*1000)/10};
    if(ordered&&price>preferred[1]&&price<acceptable[0])
      return {kind:"between",text:"between preferred and acceptable zones",distance:null};
    return {kind:"outside",text:"outside the quoted buy ranges",distance:null};
  }
  function zoneContext(r){
    if(r.statusOnly||r.exchange!=="US"||r.nativeCurrency!=="USD"||!Array.isArray(r.zoneBands))return null;
    const q=state.quotes[r.ticker.toUpperCase()];
    if(!q||q.feed!=="IEX"||q.currency!=="USD")return null;
    const current=q.regularClose&&typeof q.regularClose.price==="number"&&q.regularClose.price>0?
      {label:"Regular",price:q.regularClose.price}:
      typeof q.price==="number"&&q.price>0?{label:"Latest IEX",price:q.price}:null;
    const overnight=q.regularClose&&q.overnight&&typeof q.overnight.price==="number"&&q.overnight.price>0?
      {label:"Overnight",price:q.overnight.price}:null;
    const regular=current?{...current,position:zonePosition(current.price,r.zoneBands)}:null;
    const night=overnight?{...overnight,position:zonePosition(overnight.price,r.zoneBands)}:null;
    if(!regular?.position&&!night?.position)return null;
    return {regular:regular?.position?regular:null,overnight:night?.position?night:null};
  }
  function zoneInsight(context){
    if(!context)return "";
    const entries=[context.regular,context.overnight].filter(Boolean);
    if(!entries.length)return "";
    const phrase=item=>item.position.text+(item.position.distance!==null?
      " by "+item.position.distance.toFixed(1)+"%":"");
    let note;
    if(entries.length===2&&entries[0].position.kind===entries[1].position.kind&&
       entries[0].position.text===entries[1].position.text){
      const p=entries[0].position;
      const distances=p.distance!==null?
        " ("+entries[0].label.toLowerCase()+" "+entries[0].position.distance.toFixed(1)+"%; "+
        entries[1].label.toLowerCase()+" "+entries[1].position.distance.toFixed(1)+"%)":"";
      note="Regular and overnight: "+p.text+distances;
    }else note=entries.map(item=>item.label+": "+phrase(item)).join("; ");
    return '<small class="zone-context"><span class="zone-context-label">Price vs report buy zones</span>'+
      escape(note)+'</small>';
  }
  function zoneCell(r,context){
    const [preferred,acceptable]=splitReportPair(r.zones);
    const hits=kind=>[context?.regular,context?.overnight].filter(x=>x?.position?.kind===kind).map(x=>x.label);
    function highlightedCard(label,value,tone,kind){
      const matches=hits(kind);
      if(!matches.length)return reportRangeCard(label,value,tone);
      const highlight=kind==="preferred"?"zone-hit-preferred":"zone-hit-acceptable";
      const badgeText=matches.map(source=>'<span class="range-hit-chip">'+escape(source)+' in range</span>').join("");
      return '<div class="score-box range-box '+tone+' zone-hit '+highlight+'">'+
        '<span class="score-label">'+escape(label)+'</span>'+
        '<strong class="range-value '+tone+'">'+escape(value)+'</strong>'+
        '<div class="range-live-tags">'+badgeText+'</div>'+
        '</div>';
    }
    return '<div class="score-pair range-pair">'+
      highlightedCard("Preferred",preferred,"good","preferred")+
      highlightedCard("Acceptable",acceptable,"warn","acceptable")+
      '</div>';
  }
  function tr(r){
    const action=cap(r.action,96);
    const screening=r.musaffa||"NOT VERIFIED";
    const context=zoneContext(r);
    const market=marketStatus(r);
    const active=market?.open?" market-open":"";
    const status=market?'<small class="market-session">'+escape(market.market)+
      ' · Sydney '+escape(market.hours)+
      ' · '+(market.open?'<span class="market-open-label">Trading session</span>':'Outside session')+'</small>':
      '<small class="market-session muted">Market hours not configured</small>';
    return '<tr><td><a class="ticker'+active+'" href="'+escape(r.reportPath)+'"'+
      (market?.open?' title="Market in regular weekday session"':'')+'>'+escape(r.ticker)+'</a>'+
      '<small>'+escape(r.company)+'</small>'+status+'</td>'+
    '<td>'+quoteCell(r)+'</td>'+
    '<td>'+overnightCell(r)+'</td>'+
    '<td>'+badge(action,actionKind(action))+'<small>Risk: '+escape(cap(r.risk,78))+'</small>'+
      '<small>Own: '+escape(cap(r.ownerAction,75))+'</small>'+zoneInsight(context)+'</td>'+
    '<td>'+scoreCell(r)+'</td>'+
    '<td>'+escape(fmt(r.timestamp))+(r.conflictingBuckets?'<small class="warning">Both buckets contain this ticker</small>':"")+'</td>'+
    '<td>'+zoneCell(r,context)+'</td>'+
    '<td>'+stopsCell(r)+'</td>'+
    '<td>'+escape(cap(screening,140))+(r.statusOnly?'<small class="warning">Screening only · no current investment rating</small>':"")+'<small>Folder: '+escape(r.bucket)+'</small></td>'+
    '<td>'+escape(cap(r.earnings,110))+'</td></tr>';
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
    const us=state.rows.filter(r=>r.exchange==="US").map(r=>r.ticker);
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
      const usQuotes=await retrieve("/api/prices",us,"Alpaca");
      const international=state.rows.filter(r=>r.exchange!=="US").map(r=>r.ticker);
      const intlQuotes=await retrieve("/api/international-prices",international,"Personal Yahoo cache");
      state.quotes={...usQuotes,...intlQuotes};
      const usCount=Object.keys(usQuotes).length,intlCount=Object.keys(intlQuotes).length;
      $("marketNotice").textContent="Quote observations: "+usCount+
        " US tickers via Alpaca · "+intlCount+" non-US delayed Yahoo quotes (private cache) · Updated "+
        fmt(new Date().toISOString())+
        " · US prices and GitHub HTML reports checked every 5 minutes while visible. "+
        "Non-US quotes are collected on GitHub Actions every 20 minutes during regular market hours, subject to data-feed and scheduler delays."+
        (failures.length?" Provider issues: "+failures.join("; "):"");
      state.providerReady=true;
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
      try{
        const marketRes=await fetch("/data/market-exchanges.json",{cache:"no-store"});
        if(marketRes.ok)state.markets=await marketRes.json();
      }catch{}
      $("marketNotice").textContent="Archive built "+fmt(data.generatedAt)+". Loading Alpaca US prices and cached delayed international prices.";
      render();
      await refresh();
      const addedReports=await syncGithubReports();
      // A second quote request is necessary only if GitHub added or updated a ticker.
      if(addedReports)await refresh();
      setInterval(()=>{if(document.visibilityState==="visible")checkAll();},300000);
      // Market-open glow changes at the minute boundary without fetching quotes.
      setInterval(()=>{if(document.visibilityState==="visible")render();},60000);
      document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")checkAll();});
    }catch(e){
      $("marketNotice").textContent="Could not load archive: "+e.message;
      $("rows").innerHTML='<tr><td colspan="10">Archive unavailable.</td></tr>';
    }
  }
  ["search","bucket","exchange","order"].forEach(id=>$(id).addEventListener(id==="search"?"input":"change",render));
  $("refresh").addEventListener("click",checkAll);
  init();
})();