(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const state={rows:[],quotes:{},history:{},yearHistory:{},lastYearRefreshAt:0,markets:{},loading:false,generatedAt:null,providerReady:true,githubTreeSha:null,syncing:false,cycleBusy:false};
  const INDUSTRY_CATEGORIES=[
    "Technology & Communications","Healthcare & Pharmaceuticals","Financial Services",
    "Consumer Essentials","Consumer Discretionary","Industrials, Construction & Transportation",
    "Energy & Resources","Utilities","Real Estate"];
  const industryRank=new Map(INDUSTRY_CATEGORIES.map((name,index)=>[name,index]));
  const escape=s=>String(s??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const fmt=iso=>{try{return new Intl.DateTimeFormat("en-AU",{timeZone:"Australia/Sydney",day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",timeZoneName:"short"}).format(new Date(iso));}catch{return iso||"Unknown";}};
  const norm=s=>String(s??"").toUpperCase().replace(/[^A-Z0-9 ]/g," ").trim();
  const score=s=>{const m=String(s).match(/(\d{1,3})\s*\/\s*100/);return m?Number(m[1]):-1;};
  function normalizeListing(row){
    const ticker=String(row?.ticker||"").toUpperCase();
    const suffix=ticker.includes(".")?ticker.split(".").at(-1):"";
    const bySuffix={TWSE:"TWSE",TW:"TWSE",ASX:"ASX",AX:"ASX",MYX:"BURSA",KL:"BURSA",MY:"BURSA",SIX:"SIX",ST:"XSTO",STO:"XSTO",HE:"XHEL",T:"TSE"};
    const exchange=bySuffix[suffix];
    return exchange&&row.exchange!==exchange?{...row,exchange}:row;
  }

  // Browser-local row preference; migrate previous checked favourites to stars.
  const ROW_STATES_KEY="search-stocks:row-states:v1";
  const LEGACY_FAVOURITES_KEY="search-stocks:favourites:v1";
  const rowTicker=r=>String(r?.ticker||"").trim().toUpperCase();
  const validRowState=value=>value==="favourite"||value==="minimized";
  function loadRowStates(){
    try{
      const stored=window.localStorage.getItem(ROW_STATES_KEY);
      if(stored!==null){
        const pairs=JSON.parse(stored);
        return new Map(Array.isArray(pairs)?
          pairs.filter(item=>Array.isArray(item)&&item.length===2&&
            typeof item[0]==="string"&&item[0].length>0&&item[0].length<=80&&validRowState(item[1]))
            .map(([ticker,value])=>[ticker.trim().toUpperCase(),value]):[]);
      }
      const previous=JSON.parse(window.localStorage.getItem(LEGACY_FAVOURITES_KEY)||"[]");
      return new Map(Array.isArray(previous)?
        previous.filter(t=>typeof t==="string"&&t.length>0&&t.length<=80)
          .map(t=>[t.trim().toUpperCase(),"favourite"]):[]);
    }catch{return new Map();}
  }
  let rowStates=loadRowStates();
  const rowState=r=>rowStates.get(rowTicker(r))||"normal";
  const nextRowState=state=>state==="normal"?"favourite":state==="favourite"?"minimized":"normal";
  function saveRowStates(){
    try{window.localStorage.setItem(ROW_STATES_KEY,JSON.stringify([...rowStates]));}
    catch{/* Keep current-tab preference if browser storage is blocked. */}
  }
  // A local queue survives offline changes and is reconciled against each
  // stock's D1 revision, rather than overwriting a shared all-ticker list.
  const ROW_PENDING_KEY="search-stocks:pending-row-states:v1";
  const ROW_MIGRATED_KEY="search-stocks:row-states-migrated:v1";
  function loadPendingRowChanges(){
    try{
      const saved=JSON.parse(window.localStorage.getItem(ROW_PENDING_KEY)||"[]");
      return new Map(Array.isArray(saved)?
        saved.filter(x=>Array.isArray(x)&&x.length===2&&
          typeof x[0]==="string"&&x[0].length<=30&&
          /^[A-Z0-9][A-Z0-9.-]*$/.test(x[0])&&
          (validRowState(x[1])||x[1]==="normal")):[]);
    }catch{return new Map();}
  }
  let pendingRowChanges=loadPendingRowChanges();
  let preferenceSyncActive=false,preferenceSyncAgain=false;
  function savePendingRowChanges(){
    try{window.localStorage.setItem(ROW_PENDING_KEY,JSON.stringify([...pendingRowChanges]));}catch{}
  }
  function preferenceStatus(message){
    const node=$("preferenceSyncNotice");
    if(node)node.textContent=message;
  }
  function queueRowPreference(ticker,selection){
    pendingRowChanges.set(ticker,selection);
    savePendingRowChanges();
    preferenceStatus("Preferences saved in this browser · syncing to your other devices…");
    if(preferenceSyncActive)preferenceSyncAgain=true;
    else void syncRowPreferences();
  }
  async function syncRowPreferences(){
    if(preferenceSyncActive){preferenceSyncAgain=true;return;}
    preferenceSyncActive=true;
    preferenceSyncAgain=false;
    try{
      const result=await fetch("/api/row-preferences",{
        credentials:"same-origin",cache:"no-store",headers:{Accept:"application/json"}
      });
      if(!result.ok)throw Error("Cloudflare preference API "+result.status);
      const payload=await result.json();
      if(payload?.schemaVersion!==1||!Array.isArray(payload.records))throw Error("Invalid preferences response");
      const remote=new Map(),versions=new Map();
      for(const item of payload.records){
        if(!item||typeof item.ticker!=="string"||
          !/^[A-Z0-9][A-Z0-9.-]{0,29}$/.test(item.ticker)||
          !(validRowState(item.state)||item.state==="normal")||
          !Number.isSafeInteger(item.version)||item.version<1)continue;
        remote.set(item.ticker,item.state);
        versions.set(item.ticker,item.version);
      }
      // One-time import for EACH existing browser. Remote values win where
      // the same ticker was already synced by another device. A remote
      // 'normal' tombstone prevents stale local favourites reappearing.
      let migrated=false;
      try{migrated=window.localStorage.getItem(ROW_MIGRATED_KEY)==="1";}catch{}
      if(!migrated){
        for(const [ticker,selection] of rowStates){
          if(!remote.has(ticker)&&!pendingRowChanges.has(ticker)&&
            (validRowState(selection))&&/^[A-Z0-9][A-Z0-9.-]{0,29}$/.test(ticker)){
            pendingRowChanges.set(ticker,selection);
          }
        }
        savePendingRowChanges();
        try{window.localStorage.setItem(ROW_MIGRATED_KEY,"1");}catch{}
      }
      const combined=new Map([...remote].filter(([,v])=>v!=="normal"));
      for(const [ticker,selection] of pendingRowChanges){
        if(selection==="normal")combined.delete(ticker);
        else combined.set(ticker,selection);
      }
      rowStates=combined;
      saveRowStates();
      if(state.rows.length)render();
      // Version-aware single-stock writes: a stale phone cannot accidentally
      // replace an unrelated laptop selection or overwrite another stock.
      for(const [ticker,selection] of [...pendingRowChanges]){
        if(pendingRowChanges.get(ticker)!==selection)continue;
        let revision=versions.get(ticker)||0,committed=false;
        for(let attempt=0;attempt<3;attempt++){
          const response=await fetch("/api/row-preferences",{
            method:"POST",credentials:"same-origin",cache:"no-store",
            headers:{"Content-Type":"application/json",Accept:"application/json"},
            body:JSON.stringify({ticker,state:selection,version:revision})
          });
          const data=await response.json().catch(()=>({}));
          if(response.status===409&&data.record&&Number.isSafeInteger(data.record.version)){
            revision=data.record.version;
            versions.set(ticker,revision);
            continue;
          }
          if(!response.ok||data?.record?.ticker!==ticker||
            data.record.state!==selection||!Number.isSafeInteger(data.record.version))
            throw Error("Preference update failed "+response.status);
          versions.set(ticker,data.record.version);
          committed=true;
          break;
        }
        if(!committed)throw Error("Preference conflict; retry next refresh");
        if(pendingRowChanges.get(ticker)===selection){
          pendingRowChanges.delete(ticker);
          savePendingRowChanges();
        }else preferenceSyncAgain=true;
      }
      preferenceStatus(pendingRowChanges.size?
        "Some ticker changes are pending · retrying automatically.":
        "Favourites and minimized stocks synced securely across devices · checked "+
        fmt(new Date().toISOString())+".");
    }catch{
      // Never delete local preferences or the pending queue on a failed request.
      preferenceStatus("Cross-device sync currently unavailable · selections are safe on this browser and will retry.");
    }finally{
      preferenceSyncActive=false;
      if(preferenceSyncAgain){preferenceSyncAgain=false;void syncRowPreferences();}
    }
  }

  function onRowStateClick(event){
    const button=event.target?.closest?.("button.row-state-toggle[data-row-ticker]");
    if(!button||!event.currentTarget.contains(button))return;
    const ticker=rowTicker({ticker:button.dataset.rowTicker});
    if(!ticker)return;
    const next=nextRowState(rowStates.get(ticker)||"normal");
    if(next==="normal")rowStates.delete(ticker);else rowStates.set(ticker,next);
    saveRowStates();
    queueRowPreference(ticker,next);
    // Repaint only this stock, preserving table columns and scroll position.
    const currentRow=button.closest("tr");
    const row=state.rows.find(item=>rowTicker(item)===ticker);
    if(row&&currentRow){
      currentRow.insertAdjacentHTML("afterend",tr(row));
      const replacement=currentRow.nextElementSibling;
      currentRow.remove();
      replacement?.querySelector(".row-state-toggle")?.focus({preventScroll:true});
    }else render();
  }

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
    const registry=typeof state==="undefined"?{}:state.markets;
    const override=registry?.sourceSymbolOverrides?.[ticker];
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
    const key=registry?.aliases?.[r.exchange]||r.exchange;
    const suffix=registry?.markets?.[key]?.yahooSuffix;
    return suffix&&ticker.endsWith("."+key)?ticker.slice(0,-key.length-1)+suffix:null;
  }
  function yahooPriceLink(r){
    if(r.exchange==="US")return "";
    const symbol=yahooSymbol(r);
    return symbol?'<small><a href="https://finance.yahoo.com/quote/'+encodeURIComponent(symbol)+'/" target="_blank" rel="noopener noreferrer">View on Yahoo Finance (delayed) ↗</a></small>':"";
  }
  function quoteMoney(currency,value){
    const unit=currency==="USD"?"US$":currency==="AUD"?"A$":currency==="TWD"?"NT$":currency==="MYR"?"RM ":currency==="EUR"?"€":currency==="GBP"?"£":currency==="JPY"?"¥":currency==="HKD"?"HK$":currency+" ";
    return unit+Number(value).toLocaleString("en-AU",{minimumFractionDigits:2,maximumFractionDigits:3});
  }
  const quoteDirection=value=>typeof value!=="number"||!Number.isFinite(value)||value===0?"flat":value>0?"gain":"loss";
  const signedMoney=(currency,value)=>(value>0?"+":value<0?"−":"")+quoteMoney(currency,Math.abs(value));
  const signedPercent=value=>(value>0?"+":"")+value.toFixed(2)+"%";
  // During NYSE/Nasdaq regular session, IEX's last observed trade is the
  // actionable *observation* to display, never yesterday's SIP closing bar.
  // Its exchange-limited IEX feed is NOT a consolidated real-time last.
  // Freshness is independently checked against the exact New York session date.
  function usSessionQuote(r,q,now=new Date()){
    if(r.exchange!=="US"||q?.feed!=="IEX"||!Number.isFinite(Number(q.price))||
        Number(q.price)<=0)return null;
    const market=marketStatus(r,now);
    const observed=Date.parse(q.asOf);
    if(!Number.isFinite(observed))return null;
    const ageMs=now.getTime()-observed;
    const current=marketParts(now,"America/New_York");
    const traded=marketParts(new Date(observed),"America/New_York");
    const dateOf=p=>[p.year,String(p.month).padStart(2,"0"),String(p.day).padStart(2,"0")].join("-");
    const today=dateOf(current),tradeDay=dateOf(traded);
    const fresh=tradeDay===today&&ageMs>=-120000&&ageMs<=15*60000;
    const previous=q.regularClose;
    const closeIsPrevious=previous&&typeof previous.sessionDate==="string"&&
      /^\d{4}-\d{2}-\d{2}$/.test(previous.sessionDate)&&previous.sessionDate<today&&
      Date.parse(today+"T00:00:00Z")-Date.parse(previous.sessionDate+"T00:00:00Z")<=5*86400000&&
      Number.isFinite(Number(previous.price))&&Number(previous.price)>0;
    const comparison=closeIsPrevious?{
      amount:Math.round((Number(q.price)-Number(previous.price))*100)/100,
      percent:Math.round((Number(q.price)/Number(previous.price)-1)*100000)/1000,
      price:Number(previous.price),sessionDate:previous.sessionDate
    }:null;
    return {open:Boolean(market?.open),fresh,today,tradeDay,
      ageMinutes:Math.max(0,Math.floor(ageMs/60000)),comparison};
  }
  function quoteCell(r){
    const q=state.quotes[r.ticker.toUpperCase()];
    if(!q){
      // A verified split-adjusted IEX daily close is an explicit HISTORICAL
      // fallback, never a fabricated or current quote. Keeps useful verified
      // prices visible if the independent live-trade gateway is interrupted.
      const old=state.history[r.ticker.toUpperCase()];
      const last=r.exchange==="US"&&old?.adjustment==="split"&&
        old?.feed==="IEX"&&old?.currency==="USD"&&Array.isArray(old?.bars)?
        old.bars.at(-1):null;
      const t=Date.parse(last?.asOf),p=Number(last?.close);
      if(Number.isFinite(t)&&t<=Date.now()+120000&&Date.now()-t<8*86400000&&
          Number.isFinite(p)&&p>0)
        return '<div class="session-prices"><small class="price-label">Last recorded IEX daily close · historical fallback</small>'+
          '<strong class="quote-value">'+escape(quoteMoney("USD",p))+'</strong>'+
          '<small>New York session '+escape(last.date)+' · split-adjusted · NOT a live quote</small>'+
          '</div>';
      const link=yahooPriceLink(r);
      return '<span class="muted">PRICE UNAVAILABLE</span><small>'+(r.exchange==="US"?"No verified Alpaca quote":"No cached international quote yet")+'</small>'+link;
    }
    const currency=q.currency;
    if(q.feed==="IEX"&&q.regularClose&&Number(q.regularClose.price)>0){
      const session=usSessionQuote(r,q);
      // The IEX latest trade is the PRIMARY number while the exchange trades.
      // The completed SIP closing bar is reference-only until the next close.
      if(session?.open){
        const c=session.comparison;
        const direction=quoteDirection(session.fresh?c?.percent:null);
        const freshness=session.fresh?"Latest observed IEX trade · current US session":
          "Last IEX observation · not recent";
        const age=session.ageMinutes+" min old";
        const delta=session.fresh&&c?
          '<span class="change '+direction+'">'+escape(signedMoney(currency,c.amount))+
            ' ('+escape(signedPercent(c.percent))+') vs previous regular close</span>':
          '<small class="muted">Current-session comparison unavailable</small>';
        return '<div class="session-prices">'+
          '<small class="price-label">'+freshness+'</small>'+
          '<strong class="quote-value '+direction+'">'+escape(quoteMoney(currency,q.price))+'</strong>'+
          '<small>Observed '+escape(fmt(q.asOf))+' · '+escape(age)+
            ' · IEX feed, not consolidated</small>'+delta+
          '<small>Previous regular close (delayed SIP): '+
            escape(quoteMoney(currency,q.regularClose.price))+
            ' · Session '+escape(q.regularClose.sessionDate)+'</small></div>';
      }
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
      ' · '+escape(fmt(q.asOf))+'</small>'+yahooPriceLink(r)+'</div>';
  }
  function overnightCell(r){
    if(r.exchange!=="US")return '<small class="muted">US overnight only</small>';
    const q=state.quotes[r.ticker.toUpperCase()];
    if(!q||q.feed!=="IEX")return '<small class="muted">Overnight unavailable</small>';
    const session=usSessionQuote(r,q);
    if(session?.open){
      const c=session.comparison;
      if(!session.fresh||!c)
        return '<small class="muted">Current-session IEX comparison unavailable</small>';
      const direction=quoteDirection(c.percent);
      return '<div class="session-prices">'+
        '<small class="price-label">Current IEX vs previous regular close</small>'+
        '<strong class="quote-value overnight-value '+direction+'">'+
          escape(signedMoney(q.currency,c.amount))+'</strong>'+
        '<span class="change '+direction+'">'+escape(signedPercent(c.percent))+
        ' vs previous regular close</span>'+
        '<small>Last IEX trade '+escape(fmt(q.asOf))+
        ' · not an overnight indication</small></div>';
    }
    const night=q.overnight,pct=q.overnightChangePercent,amount=q.overnightChangeAmount;
    if(!q.regularClose||!night||!Number.isFinite(Number(night.price))||Number(night.price)<=0||
       typeof pct!=="number"||!Number.isFinite(pct)||
       typeof amount!=="number"||!Number.isFinite(amount)||
       !Number.isFinite(Date.parse(night.asOf))||
       Date.now()-Date.parse(night.asOf)>90*60000||
       Date.now()-Date.parse(night.asOf)<-120000)
      return '<small class="muted">No recent verified overnight indication</small>';
    const color=quoteDirection(pct);
    return '<div class="session-prices">'+
      '<small class="price-label">Indicative · 15-min delayed</small>'+
      '<strong class="quote-value overnight-value '+color+'">'+escape(quoteMoney(q.currency,night.price))+'</strong>'+
      '<span class="change '+color+'">'+escape(signedMoney(q.currency,amount))+
      ' ('+escape(signedPercent(pct))+') vs regular close</span>'+
      '<small>Observed '+escape(fmt(night.asOf))+'</small></div>';
  }
  function combinedPriceCell(r){
    return '<div class="combined-price-cell">'+
      '<div class="combined-price-main"><small class="combined-price-section">Regular / latest price</small>'+
        quoteCell(r)+'</div>'+
      '<div class="combined-price-overnight"><small class="combined-price-section">Overnight / vs close</small>'+
        overnightCell(r)+'</div>'+
      '</div>';
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
      reportRangeCard("Stop-loss",initial,"bad")+
      reportRangeCard("No chase",noChase,"warn")+
      '</div>';
  }
  // Entry zones are inclusive CEILINGS. Preferred takes priority.
  // A low price qualifies even below the reported lower bound.
  function zonePosition(price,bands){
    if(typeof price!=="number"||!Number.isFinite(price)||price<=0)return null;
    const valid=b=>Array.isArray(b)&&b.length===2&&b.every(x=>
      typeof x==="number"&&Number.isFinite(x)&&x>0&&x<=1e9)&&b[1]>=b[0];
    const preferred=valid(bands?.[0])?bands[0]:null;
    const acceptable=valid(bands?.[1])?bands[1]:null;
    if(!preferred&&!acceptable)return null;
    if(preferred&&price<=preferred[1])
      return {kind:"preferred",text:"at or below preferred maximum",distance:null};
    if(acceptable&&price<=acceptable[1])
      return {kind:"acceptable",text:"at or below acceptable maximum",distance:null};
    return {kind:"above",text:"above both entry ceilings",distance:null};
  }
  function zoneContext(r){
    if(r.statusOnly||!Array.isArray(r.zoneBands)||!r.nativeCurrency)return null;
    const q=state.quotes[r.ticker.toUpperCase()];
    if(!q||q.currency!==r.nativeCurrency)return null;
    if(r.exchange!=="US"){
      // Yahoo quote identities were validated by the private GitHub-OIDC
      // ingestion Worker. BURSA uses MYX as the provider's exchange code.
      const market=state.markets?.aliases?.[r.exchange]||r.exchange;
      const observed=Date.parse(q.asOf),age=Date.now()-observed;
      if(q.feed!=="YFINANCE_YAHOO_5M_BAR_DELAYED"||
        q.exchange!==market||typeof q.sourceSymbol!=="string"||
        !Number.isFinite(observed)||age < -120000||age>96*3600000||
        typeof q.price!=="number"||!Number.isFinite(q.price)||q.price<=0)return null;
      const last={label:"Yahoo delayed",price:q.price,
        position:zonePosition(q.price,r.zoneBands)};
      return last.position?{regular:last,overnight:null}:null;
    }
    if(q.feed!=="IEX"||q.currency!=="USD")return null;
    const session=usSessionQuote(r,q);
    const current=session?.open?
      session.fresh?{label:"Latest IEX",price:Number(q.price)}:null:
      q.regularClose&&typeof q.regularClose.price==="number"&&q.regularClose.price>0?
        {label:"Regular",price:q.regularClose.price}:
        typeof q.price==="number"&&q.price>0?{label:"Latest IEX",price:q.price}:null;
    const overnight=!session?.open&&q.regularClose&&q.overnight&&
      typeof q.overnight.price==="number"&&q.overnight.price>0&&
      Number.isFinite(Date.parse(q.overnight.asOf))&&
      Date.now()-Date.parse(q.overnight.asOf)<=90*60000?
      {label:"Overnight",price:q.overnight.price}:null;
    const regular=current?{...current,position:zonePosition(current.price,r.zoneBands)}:null;
    const night=overnight?{...overnight,position:zonePosition(overnight.price,r.zoneBands)}:null;
    if(!regular?.position&&!night?.position)return null;
    return {regular:regular?.position?regular:null,overnight:night?.position?night:null};
  }
  function zoneInsight(context){
    if(!context)return "";
    // Above the entry ceilings should not raise an Action/Risk notification.
    const entries=[context.regular,context.overnight].filter(x=>
      x?.position&&x.position.kind!=="above");
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
    // One current observation, one highlighted box. A recent verified overnight
    // quote is preferred to the previous regular close, when available.
    const selected=context?.overnight||context?.regular;
    const hits=kind=>selected?.position?.kind===kind?[selected.label]:[];
    function highlightedCard(label,value,tone,kind){
      const matches=hits(kind);
      if(!matches.length)return reportRangeCard(label,value,tone);
      const highlight=kind==="preferred"?"zone-hit-preferred":"zone-hit-acceptable";
      const capLabel=kind==="preferred"?"Preferred max":"Acceptable max";
      const badgeText=matches.map(source=>'<span class="range-hit-chip">'+
        escape(source)+': ≤ '+capLabel+'</span>').join("");
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
  // Shariah screening is independent of investment recommendations and folder.
  // Re-evaluate the four-month cutoff against TODAY so stale evidence turns amber.
  function musaffaVisual(r,now=new Date()){
    const screening=r.musaffa||"NOT VERIFIED";
    const status=String(r.musaffaClassification||screening.split(" · ")[0]||"").trim().toUpperCase();
    const gate=String(r.musaffaGate||(screening.match(/\b(PASS|STALE|UNVERIFIED|FAIL)\b/i)||[])[0]||"").toUpperCase();
    const exact=String(r.musaffaScreeningDate||(screening.match(/\b\d{4}-\d{2}-\d{2}\b/)||[])[0]||"").trim();
    const period=String(r.musaffaScreeningPeriod||"").trim();
    const year=now.getUTCFullYear(),month=now.getUTCMonth(),day=now.getUTCDate();
    const first=new Date(Date.UTC(year,month-4,1));
    const last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
    const cutoff=Date.UTC(first.getUTCFullYear(),first.getUTCMonth(),Math.min(day,last));
    const parseDay=value=>{
      const m=String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if(!m)return null;
      const ts=Date.UTC(+m[1],+m[2]-1,+m[3]);
      return new Date(ts).toISOString().slice(0,10)===value?ts:null;
    };
    let checked=parseDay(exact);
    // For a verified month-only screen, its first calendar day is the
    // conservative freshness reference (never manufacture an exact day).
    if(checked===null&&/^\d{4}-(?:0[1-9]|1[0-2])$/.test(period))
      checked=parseDay(period+"-01");
    // Read older YYYY-MM values that were stored in screening_date itself.
    if(checked===null&&/^\d{4}-(?:0[1-9]|1[0-2])$/.test(exact))
      checked=parseDay(exact+"-01");
    const recent=checked!==null&&checked>=cutoff&&checked<=now.getTime();
    const negative=/(?:NOT\s+HALAL|NON[\s-]?COMPLIANT|NON[\s-]?HALAL|HARAM)/.test(status);
    const positive=/(?:^|\W)(?:HALAL|COMPLIANT)(?:\W|$)/.test(status)&&!negative;
    const declared=String(r.musaffaAssessment||"").toUpperCase();
    const contradictory=declared==="INCONCLUSIVE"||
      (declared==="VERIFIED_HALAL"&&!positive)||
      (declared==="VERIFIED_NONCOMPLIANT"&&!negative)||
      (gate==="PASS"&&negative);
    const ambiguous=Boolean(r.musaffaScreeningMonthConflict)||contradictory||
      /(?:STALE|UNVERIFIED|UNKNOWN|INCONCLUSIVE|DOUBTFUL|AMBIGUOUS|CONFLICT|UNCERTAIN)/.test(status+" "+gate);
    if(recent&&!ambiguous&&negative)return {tone:"bad",label:"VERIFIED NON-COMPLIANT"};
    if(recent&&!ambiguous&&positive&&gate!=="FAIL")return {tone:"good",label:declared==="USER_SCREENSHOT_HALAL"?"MUSAFFA HALAL · SCREENSHOT":"VERIFIED HALAL"};
    return {tone:"warn",label:"INCONCLUSIVE"};
  }
  function screeningCell(r){
    // The full Musaffa evidence remains in the existing ticker report.
    const result=musaffaVisual(r);
    const owner=String(r.screeningReviewStatus||"").toUpperCase();
    const ownerActive=r.bucket==="nonhalal"&&r.screeningReviewSource==="USER_REQUEST"&&
      (owner==="DOUBTFUL"||owner==="NON_HALAL");
    const ownerBadge=ownerActive?badge(owner==="NON_HALAL"?"OWNER: NON-HALAL":"OWNER: DOUBTFUL","warn"):"";
    // Show owner designation independently; Musaffa's original finding remains legible.
    return '<div class="musaffa-cell status-only-cell">'+
      (ownerBadge?ownerBadge+'<span class="screening-original">Musaffa: '+escape(result.label)+'</span>':
        badge(result.label,result.tone))+'</div>';
  }
  // First RizqInvests, then Investigate only for non-red Rizq decisions.
  // The final decision and source flags are recorded in the server-side manifest;
  // render the same precedence and never turn an Investigate concern into BDS.
  function ethicalFirstColumn(r){
    const ticker=String(r.ticker||"");
    const rizqStatus=String(r.ethicalStatus||"UNVERIFIED").toUpperCase();
    const rizqUrl="https://www.rizqinvests.com/halal/stock/"+encodeURIComponent(ticker)+"?view=both";
    const rizqMatched=r.ethicalSourceKind==="USER_SNAPSHOT"&&r.ethicalSourceUrl===rizqUrl;
    const rizqRed=rizqMatched&&(r.ethicalBdsListed===true||rizqStatus==="BDS_LISTED"||rizqStatus==="UNETHICAL");
    const rizqGreen=rizqMatched&&r.ethicalBdsListed===false&&(rizqStatus==="NEUTRAL"||rizqStatus==="ETHICAL");
    const invMatched=r.investigateListed===true&&r.investigateSourceKind==="USER_SNAPSHOT";
    const rizqLabel=r.ethicalBdsListed===true||rizqStatus==="BDS_LISTED"?"BDS flagged":
      rizqStatus==="UNETHICAL"?"Unethical":rizqStatus==="ETHICAL"?"Ethical":"Neutral";
    // Stage 1: first provider's Unethical / BDS status has absolute priority.
    if(rizqRed){
      return '<a class="ethical-inline-card bad" href="'+escape(rizqUrl)+'" target="_blank" rel="noopener noreferrer"'+
        ' aria-label="RizqInvests '+escape(rizqLabel)+' for '+escape(ticker)+', Nov 2026 snapshot">'+
        '<span class="ethical-inline-title"><span class="ethical-inline-dot" aria-hidden="true"></span>'+
        'RizqInvests · '+escape(rizqLabel)+' <span aria-hidden="true">↗</span></span>'+
        '<span class="ethical-inline-note">Ethical / BDS · Nov 2026 snapshot</span></a>';
    }
    // Stage 2: only a non-red (Neutral/Ethical) or unmatched first source
    // can surface Investigate. Any exact Investigate match is Unethical (red).
    if(invMatched){
      const flags=Array.isArray(r.investigateCategories)?r.investigateCategories.join(" · "):"";
      const note="Investigate · Jul 2025"+(flags?" · "+flags.slice(0,80):"");
      const url=String(r.investigateSourceUrl||"");
      const linked=/^https:\/\/investigate\.info\//.test(url);
      const head='<span class="ethical-inline-title"><span class="ethical-inline-dot" aria-hidden="true"></span>'+
        'Unethical · Investigate'+(linked?' <span aria-hidden="true">↗</span>':"")+'</span>'+
        '<span class="ethical-inline-note">'+escape(note)+'</span>';
      const primary=linked?'<a class="ethical-inline-card bad" href="'+escape(url)+'" target="_blank" rel="noopener noreferrer"'+
        ' aria-label="Unethical: Investigate historical concern for '+escape(ticker)+'">'+head+'</a>':
        '<span class="ethical-inline-card bad">'+head+
        '<span class="ethical-inline-note">Source link needs verification</span></span>';
      const secondary=rizqGreen?'<small class="ethical-inline-followup">RizqInvests original · '+
        '<a href="'+escape(rizqUrl)+'" target="_blank" rel="noopener noreferrer">'+escape(rizqLabel)+' · Nov 2026 ↗</a></small>':"";
      return primary+secondary;
    }
    // Stage 3: only no matching Investigate concern permits Rizq Neutral green.
    if(rizqGreen){
      return '<a class="ethical-inline-card good" href="'+escape(rizqUrl)+'" target="_blank" rel="noopener noreferrer"'+
        ' aria-label="RizqInvests '+escape(rizqLabel)+' and no matching Investigate entry for '+escape(ticker)+'">'+
        '<span class="ethical-inline-title"><span class="ethical-inline-dot" aria-hidden="true"></span>'+
        'Neutral · RizqInvests <span aria-hidden="true">↗</span></span>'+
        '<span class="ethical-inline-note">No Investigate match · historical snapshots</span></a>';
    }
    // No issuer-matched source: no coloured verdict or implied clearance.
    return "";
  }

  // Match the primary price shown in Regular/latest: US IEX while its
  // regular session is open; completed SIP regular close outside the session.
  function chartDisplayedPrice(r,q){
    const p=Number(q?.price);
    if(r.exchange==="US"&&q?.feed==="IEX"&&Number(q?.regularClose?.price)>0&&
        !usSessionQuote(r,q)?.open)return Number(q.regularClose.price);
    return Number.isFinite(p)&&p>0?p:null;
  }
  // Use the verified 1M closing observations plus the currently displayed quote.
  // A new high or low is reflected immediately; intraday candle extremes are not inferred.
  function monthRangePercentages(points,currentPrice){
    if(!Number.isFinite(currentPrice)||currentPrice<=0||!Array.isArray(points))return null;
    const prices=points.map(point=>Number(point.p)).filter(p=>Number.isFinite(p)&&p>0);
    if(prices.length<2)return null;
    const high=Math.max(currentPrice,...prices),low=Math.min(currentPrice,...prices);
    return {high,low,fromHigh:(currentPrice/high-1)*100,fromLow:(currentPrice/low-1)*100};
  }

  // One calendar month of verified actual observations from independent feeds:
  // US = Alpaca daily IEX bars; non-US = cached private Yahoo 1-hour bars.
  // Prices/currencies are never inferred from archived investment reports.
  function monthChartCell(r){
    const us=r.exchange==="US",q=state.quotes[r.ticker];
    const hourly=us?null:q?.hourly;
    const verifiedHourly=!us&&q?.feed==="YFINANCE_YAHOO_5M_BAR_DELAYED"&&
      hourly?.feed==="YFINANCE_YAHOO_1H_BAR_DELAYED"&&hourly?.interval==="1h"&&
      hourly?.currency===q.currency&&hourly?.exchange===q.exchange&&
      hourly?.sourceSymbol===q.sourceSymbol&&/^[A-Z]{3}$/.test(hourly.currency)&&
      Array.isArray(hourly.bars)&&hourly.bars.length>=2&&hourly.bars.length<=200;
    // US history must be provider split-adjusted. Do not plot raw pre/post-split
    // observations together or re-divide split-adjusted prices on the client.
    const usHistory=us?state.history[r.ticker]:null;
    const bars=us?(usHistory?.adjustment==="split"?usHistory.bars:null):verifiedHourly?hourly.bars:null;
    if(!Array.isArray(bars)||bars.length<2)return '<div class="mini-chart-empty">1M history unavailable<small>'+
      (us?'Waiting for verified split-adjusted IEX daily bars':'Waiting for verified delayed Yahoo hourly bars')+'</small></div>';
    const currency=us?"USD":hourly.currency;
    const observations=us?bars.map(b=>({t:Date.parse(b.asOf),p:Number(b.close),date:b.date})):
      bars.map(b=>({t:Number(b?.[0])*1000,p:Number(b?.[1]),date:null}));
    const daily=observations.filter(b=>Number.isFinite(b.t)&&b.t<Date.now()+120000&&
      b.t>=Date.now()-35*86400000&&Number.isFinite(b.p)&&b.p>0).sort((a,b)=>a.t-b.t);
    if(daily.length<2)return '<div class="mini-chart-empty">1M history unavailable<small>Insufficient verified observations</small></div>';
    const qt=Date.parse(q?.asOf),price=Number(q?.price);
    const sameFeed=us?q?.feed==="IEX"&&q?.currency==="USD":
      q?.feed==="YFINANCE_YAHOO_5M_BAR_DELAYED"&&q?.currency===currency;
    // A new observed trade/bar can extend the chart; this is not a forecast.
    const recent=sameFeed&&Number.isFinite(qt)&&Number.isFinite(price)&&price>0&&
      qt>daily.at(-1).t&&qt<=Date.now()+120000&&Date.now()-qt<8*86400000?
      {t:qt,p:price,latest:true}:null;
    const points=recent?[...daily,recent]:daily;
    const monthRange=monthRangePercentages(points,chartDisplayedPrice(r,q));
    // Apply report-derived price zones only when the recorded quote currency
    // matches the archived band currency (no hidden FX assumptions).
    const sameZoneCurrency=us||typeof r.zones==="string"&&
      new RegExp("\\b"+currency+"\\b","i").test(r.zones);
    const levels=sameZoneCurrency&&Array.isArray(r.zoneBands)?r.zoneBands.slice(0,2).map(b=>
      Array.isArray(b)&&b.length===2&&Number.isFinite(Number(b[0]))&&Number.isFinite(Number(b[1]))&&Number(b[0])>0&&Number(b[0])<=Number(b[1])?
      (Number(b[0])+Number(b[1]))/2:null):[];
    const values=points.map(b=>b.p).concat(levels.filter(v=>v!=null));
    const lower=Math.min(...values),upper=Math.max(...values),pad=Math.max((upper-lower)*.12,upper*.008,.2);
    const y=v=>(105-(v-lower+pad)/(upper-lower+2*pad)*95).toFixed(1);
    const first=points[0].t,last=points.at(-1).t,span=Math.max(1,last-first);
    const x=v=>(6+(v-first)/span*248).toFixed(1);
    const d=points.map((b,i)=>(i?"L":"M")+x(b.t)+","+y(b.p)).join(" ");
    const ref=(v,color)=>v==null?"":'<line x1="6" x2="254" y1="'+y(v)+'" y2="'+y(v)+'" stroke="'+color+'" stroke-width="1.7" stroke-dasharray="5 3"/>';
    const lastPoint=points.at(-1);
    const zone=us?"America/New_York":state.markets?.markets?.[r.exchange]?.timeZone||"UTC";
    const dayLabel=b=>{
      if(b.date)return String(b.date).slice(5);
      try{return new Intl.DateTimeFormat("en-GB",{timeZone:zone,month:"2-digit",day:"2-digit"}).format(new Date(b.t));}
      catch{return new Date(b.t).toISOString().slice(5,10);}
    };
    const provider=us?"IEX":"Yahoo 1h";
    const description=us?"Actual Alpaca IEX 1-month daily split-adjusted closes (not consolidated; no dividend adjustment).":
      "Actual delayed Yahoo Finance 1-month 1-hour closing-bar observations in "+currency+"; not real-time or consolidated.";
    const tooltip=description+(recent?" Latest observed "+(us?"IEX trade":"Yahoo 5-minute bar")+" "+price+" at "+q.asOf+".":"")+
      (levels[0]!=null?" Preferred midpoint "+levels[0]+".":"")+
      (levels[1]!=null?" Acceptable midpoint "+levels[1]+".":"");
    const lastLabel=recent?'<small class="mini-chart-latest">'+(us?"Latest IEX":"Latest Yahoo · delayed")+
      ' '+escape(quoteMoney(currency,price))+' · '+escape(fmt(q.asOf))+'</small>':
      '<small class="mini-chart-latest">Last '+escape(provider)+' '+escape(quoteMoney(currency,lastPoint.p))+
      ' · '+escape(fmt(new Date(lastPoint.t).toISOString()))+'</small>';
    return '<div class="mini-chart"><svg class="mini-chart-svg" viewBox="0 0 260 112" role="img" aria-label="'+escape(tooltip)+'">'+
      '<title>'+escape(tooltip)+'</title>'+
      '<line x1="6" x2="254" y1="58" y2="58" stroke="#425671" stroke-dasharray="3 5" opacity=".5"/>'+
      ref(levels[0]??null,"#31d0b8")+ref(levels[1]??null,"#ffd05e")+
      '<path d="'+d+'" fill="none" stroke="#8dabff" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>'+
      '<circle cx="'+x(lastPoint.t)+'" cy="'+y(lastPoint.p)+'" r="4" fill="#8dabff" stroke="#132136" stroke-width="1.5"/>'+
      '</svg><div class="mini-chart-axis"><span>'+escape(dayLabel(daily[0]))+'</span><span>'+escape(dayLabel(daily.at(-1)))+'</span></div>'+
      lastLabel+'<small class="mini-chart-legend"><span class="blue-dot">'+escape(us?"IEX closes · split-adjusted":"Yahoo 1h · delayed")+'</span>'+
      (levels[0]!=null?'<span class="preferred-dot">Preferred '+escape(quoteMoney(currency,levels[0]))+'</span>':"")+
      (levels[1]!=null?'<span class="acceptable-dot">Acceptable '+escape(quoteMoney(currency,levels[1]))+'</span>':"")+
      '</small>'+
      (monthRange?'<div class="mini-chart-range" aria-label="Current quote compared with the 1-month observed closing-price range including the current quote">'+
        '<span class="mini-chart-range-high">1M high '+escape(quoteMoney(currency,monthRange.high))+
          ' <strong>'+escape(signedPercent(monthRange.fromHigh))+'</strong></span>'+
        '<span class="mini-chart-range-low">1M low '+escape(quoteMoney(currency,monthRange.low))+
          ' <strong>'+escape(signedPercent(monthRange.fromLow))+'</strong></span>'+
        '</div>':
        '<small class="mini-chart-range-unavailable">1M comparisons unavailable · quote not verified</small>')+
      '</div>';
  }

  // A verified 1Y chart: split-adjusted US IEX daily or Yahoo weekly closes.
  function yearChartCell(r){
    const us=r.exchange==="US",q=state.quotes[r.ticker];
    const weekly=us?null:q?.annual;
    const verifiedHourly=!us&&q?.feed==="YFINANCE_YAHOO_5M_BAR_DELAYED"&&
      weekly?.feed==="YFINANCE_YAHOO_1W_BAR_DELAYED"&&weekly?.interval==="1wk"&&
      weekly?.currency===q.currency&&weekly?.exchange===q.exchange&&
      weekly?.sourceSymbol===q.sourceSymbol&&/^[A-Z]{3}$/.test(weekly.currency)&&
      Array.isArray(weekly.bars)&&weekly.bars.length>=2&&weekly.bars.length<=64;
    // US history must be provider split-adjusted. Do not plot raw pre/post-split
    // observations together or re-divide split-adjusted prices on the client.
    const usHistory=us?state.yearHistory[r.ticker]:null;
    const bars=us?(usHistory?.adjustment==="split"&&usHistory?.range==="1y"?usHistory.bars:null):verifiedHourly?weekly.bars:null;
    if(!Array.isArray(bars)||bars.length<2)return '<div class="mini-chart-empty">1Y history unavailable<small>'+
      (us?'Waiting for verified split-adjusted IEX daily bars':'Waiting for verified delayed Yahoo weekly bars')+'</small></div>';
    const currency=us?"USD":weekly.currency;
    const observations=us?bars.map(b=>({t:Date.parse(b.asOf),p:Number(b.close),date:b.date})):
      bars.map(b=>({t:Number(b?.[0])*1000,p:Number(b?.[1]),date:null}));
    const daily=observations.filter(b=>Number.isFinite(b.t)&&b.t<Date.now()+120000&&
      b.t>=Date.now()-380*86400000&&Number.isFinite(b.p)&&b.p>0).sort((a,b)=>a.t-b.t);
    if(daily.length<2)return '<div class="mini-chart-empty">1Y history unavailable<small>Insufficient verified observations</small></div>';
    const qt=Date.parse(q?.asOf),price=Number(q?.price);
    const sameFeed=us?q?.feed==="IEX"&&q?.currency==="USD":
      q?.feed==="YFINANCE_YAHOO_5M_BAR_DELAYED"&&q?.currency===currency;
    // A new observed trade/bar can extend the chart; this is not a forecast.
    const recent=sameFeed&&Number.isFinite(qt)&&Number.isFinite(price)&&price>0&&
      qt>daily.at(-1).t&&qt<=Date.now()+120000&&Date.now()-qt<8*86400000?
      {t:qt,p:price,latest:true}:null;
    const points=recent?[...daily,recent]:daily;
    const yearRange=monthRangePercentages(points,chartDisplayedPrice(r,q));
    // Apply report-derived price zones only when the recorded quote currency
    // matches the archived band currency (no hidden FX assumptions).
    const sameZoneCurrency=us||typeof r.zones==="string"&&
      new RegExp("\\b"+currency+"\\b","i").test(r.zones);
    const levels=sameZoneCurrency&&Array.isArray(r.zoneBands)?r.zoneBands.slice(0,2).map(b=>
      Array.isArray(b)&&b.length===2&&Number.isFinite(Number(b[0]))&&Number.isFinite(Number(b[1]))&&Number(b[0])>0&&Number(b[0])<=Number(b[1])?
      (Number(b[0])+Number(b[1]))/2:null):[];
    const values=points.map(b=>b.p).concat(levels.filter(v=>v!=null));
    const lower=Math.min(...values),upper=Math.max(...values),pad=Math.max((upper-lower)*.12,upper*.008,.2);
    const y=v=>(105-(v-lower+pad)/(upper-lower+2*pad)*95).toFixed(1);
    const first=points[0].t,last=points.at(-1).t,span=Math.max(1,last-first);
    const x=v=>(6+(v-first)/span*248).toFixed(1);
    const d=points.map((b,i)=>(i?"L":"M")+x(b.t)+","+y(b.p)).join(" ");
    const ref=(v,color)=>v==null?"":'<line x1="6" x2="254" y1="'+y(v)+'" y2="'+y(v)+'" stroke="'+color+'" stroke-width="1.7" stroke-dasharray="5 3"/>';
    const lastPoint=points.at(-1);
    const zone=us?"America/New_York":state.markets?.markets?.[r.exchange]?.timeZone||"UTC";
    const dayLabel=b=>{
      if(b.date)return String(b.date).slice(0,7);
      try{return new Intl.DateTimeFormat("en-GB",{timeZone:zone,month:"short",year:"2-digit"}).format(new Date(b.t));}
      catch{return new Date(b.t).toISOString().slice(0,7);}
    };
    const provider=us?"IEX":"Yahoo weekly";
    const description=us?"Actual Alpaca IEX 1-year daily split-adjusted closes (not consolidated; no dividend adjustment).":
      "Actual delayed Yahoo Finance 1-year weekly closing-price observations in "+currency+"; not real-time or consolidated.";
    const tooltip=description+(recent?" Latest observed "+(us?"IEX trade":"Yahoo 5-minute bar")+" "+price+" at "+q.asOf+".":"")+
      (levels[0]!=null?" Preferred midpoint "+levels[0]+".":"")+
      (levels[1]!=null?" Acceptable midpoint "+levels[1]+".":"");
    const lastLabel=recent?'<small class="mini-chart-latest">'+(us?"Latest IEX":"Latest Yahoo · delayed")+
      ' '+escape(quoteMoney(currency,price))+' · '+escape(fmt(q.asOf))+'</small>':
      '<small class="mini-chart-latest">Last '+escape(provider)+' '+escape(quoteMoney(currency,lastPoint.p))+
      ' · '+escape(fmt(new Date(lastPoint.t).toISOString()))+'</small>';
    return '<div class="mini-chart"><svg class="mini-chart-svg" viewBox="0 0 260 112" role="img" aria-label="'+escape(tooltip)+'">'+
      '<title>'+escape(tooltip)+'</title>'+
      '<line x1="6" x2="254" y1="58" y2="58" stroke="#425671" stroke-dasharray="3 5" opacity=".5"/>'+
      ref(levels[0]??null,"#31d0b8")+ref(levels[1]??null,"#ffd05e")+
      '<path d="'+d+'" fill="none" stroke="#8dabff" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>'+
      '<circle cx="'+x(lastPoint.t)+'" cy="'+y(lastPoint.p)+'" r="4" fill="#8dabff" stroke="#132136" stroke-width="1.5"/>'+
      '</svg><div class="mini-chart-axis"><span>'+escape(dayLabel(daily[0]))+'</span><span>'+escape(dayLabel(daily.at(-1)))+'</span></div>'+
      lastLabel+'<small class="mini-chart-legend"><span class="blue-dot">'+escape(us?"IEX closes · split-adjusted":"Yahoo 1wk · delayed")+'</span>'+
      (levels[0]!=null?'<span class="preferred-dot">Preferred '+escape(quoteMoney(currency,levels[0]))+'</span>':"")+
      (levels[1]!=null?'<span class="acceptable-dot">Acceptable '+escape(quoteMoney(currency,levels[1]))+'</span>':"")+
      '</small>'+
      (yearRange?'<div class="mini-chart-range" aria-label="Current quote compared with the 1-year observed closing-price range including the current quote">'+
        '<span class="mini-chart-range-high">1Y high '+escape(quoteMoney(currency,yearRange.high))+
          ' <strong>'+escape(signedPercent(yearRange.fromHigh))+'</strong></span>'+
        '<span class="mini-chart-range-low">1Y low '+escape(quoteMoney(currency,yearRange.low))+
          ' <strong>'+escape(signedPercent(yearRange.fromLow))+'</strong></span>'+
        '</div>':
        '<small class="mini-chart-range-unavailable">1Y comparisons unavailable · quote not verified</small>')+
      '</div>';
  }

  // Keep all existing score, buy-zone and risk-marker helpers unchanged.
  function markersCell(r,context){
    return '<div class="markers-stack">'+
      scoreCell(r)+
      zoneCell(r,context)+
      stopsCell(r)+
      '</div>';
  }
  function industryCell(r){
    const c=String(r.industryCategory||"");
    if(!industryRank.has(c))return '<span class="muted">NOT CLASSIFIED</span><small>Not in archived report</small>';
    const provenance=r.industryCategorySource==="LEGACY_ISSUER_MAPPING"?
      "Archive issuer mapping · rerun for report-level category":
      r.industryCategorySource==="REPORT_TEXT"?"Report text":"Report snapshot";
    return '<span class="industry-name">'+escape(c)+'</span>'+
      (r.industryDetail?'<small>'+escape(cap(r.industryDetail,72))+'</small>':"")+
      '<small class="industry-provenance">'+escape(provenance)+'</small>';
  }
  function dividendCell(r){
    const kind=String(r.dividendStatus||"UNKNOWN").toUpperCase();
    const y=Number(r.dividendYieldPercent);
    const validYield=typeof r.dividendYieldPercent==="number"&&Number.isFinite(y)&&y>=0&&y<=100;
    const annual=r.dividendAnnualPerShare;
    const validAnnual=typeof annual==="number"&&Number.isFinite(annual)&&annual>=0;
    const money=validAnnual?
      escape((r.dividendCurrency||r.nativeCurrency||"")+" "+annual.toLocaleString("en-AU",{minimumFractionDigits:2,maximumFractionDigits:4})+" /share/year"):"";
    const proof=r.dividendDataSource==="REPORT_SNAPSHOT"?"Report snapshot":r.dividendDataSource==="REPORT_MIXED"?"Report snapshot + text":r.dividendDataSource==="REPORT_TEXT"?"Archived report":"Unverified";
    if(kind==="NONE")return '<span class="dividend-none">No dividend</span><small>0% declared cash yield</small><small>'+escape(proof)+'</small>';
    if(kind!=="PAYS"||!validYield&&!validAnnual)
      return '<span class="muted">NOT VERIFIED</span><small>No comparable dividend data in latest report</small>';
    const top=validYield?'<strong class="dividend-yield">'+escape(y.toFixed(2))+'%</strong>':
      '<strong class="dividend-yield">Yield not verified</strong>';
    const dates=r.dividendExDate?'<small>Ex-date: '+escape(r.dividendExDate)+'</small>':"";
    const freq=r.dividendFrequency?'<small>'+escape(r.dividendFrequency)+'</small>':"";
    return '<div class="dividend-cell">'+top+(money?'<small>'+money+'</small>':"")+freq+dates+
      '<small class="dividend-provenance">'+escape(proof)+' · at report date</small></div>';
  }
  // Compact rows use the existing verified quote and report fields.
  // Values remain available in tooltips even when clipped to one line.
  function compactLine(value,tone=""){
    const label=String(value??"").trim()||"—";
    const color=["gain","loss","flat"].includes(tone)?" "+tone:"";
    return '<span class="compact-value'+color+'" title="'+escape(label)+'">'+escape(label)+'</span>';
  }
  // Use the same price-direction classes as the expanded price/overnight cells.
  // Only sourced percentages determine direction: no inferred movement.
  function compactPercentTone(value){
    const percent=String(value??"").match(/([+\-−]?\d+(?:\.\d+)?)%/);
    return percent?quoteDirection(Number(percent[1].replace("−","-"))):"flat";
  }
  // The existing 1M high (red) and low (green) comparisons must keep
  // their distinct colours in the one-line minimized chart column too.
  function compactMonthLine(r){
    const summary=compactMonth(r),separator=" / Low ";
    const cut=summary.indexOf(separator);
    if(!summary.startsWith("High ")||cut<0)return compactLine(summary);
    return '<span class="compact-value compact-month" title="'+escape(summary)+'">'+
      '<span class="mini-chart-range-high">'+escape(summary.slice(0,cut))+'</span>'+
      ' / <span class="mini-chart-range-low">'+escape(summary.slice(cut+3))+'</span></span>';
  }
  function compactPrice(r){
    const q=state.quotes[rowTicker(r)];
    if(!q)return "Price unavailable";
    const price=chartDisplayedPrice(r,q);
    if(price===null||!q.currency)return "Price unavailable";
    const session=r.exchange==="US"&&q.feed==="IEX"?usSessionQuote(r,q):null;
    const percent=session?.open?(session.fresh?session.comparison?.percent:null):
      r.exchange==="US"&&q.feed==="IEX"?q.regularClose?.regularChangePercent:
      q.feed==="YFINANCE_YAHOO_5M_BAR_DELAYED"||q.feed==="EODHD"?q.previousCloseChangePercent:
      q.change24hPercent;
    return quoteMoney(q.currency,price)+(typeof percent==="number"&&Number.isFinite(percent)?
      " · "+signedPercent(percent):"");
  }
  function compactOvernight(r){
    if(r.exchange!=="US")return "US only";
    const q=state.quotes[rowTicker(r)];
    if(q?.feed!=="IEX")return "Unavailable";
    const session=usSessionQuote(r,q);
    if(session?.open)return session.fresh&&session.comparison?
      "IEX "+signedPercent(session.comparison.percent):"No comparison";
    const night=q.overnight,pct=q.overnightChangePercent,amount=q.overnightChangeAmount;
    const observed=Date.parse(night?.asOf),age=Date.now()-observed;
    if(!q.regularClose||!night||!Number.isFinite(Number(night.price))||Number(night.price)<=0||
      typeof pct!=="number"||!Number.isFinite(pct)||typeof amount!=="number"||
      !Number.isFinite(amount)||!Number.isFinite(observed)||age>90*60000||age< -120000)
      return "No overnight";
    return signedPercent(pct)+" overnight";
  }
  function compactMonth(r){
    const us=r.exchange==="US",q=state.quotes[rowTicker(r)];
    const hourly=us?null:q?.hourly;
    const verifiedHourly=!us&&q?.feed==="YFINANCE_YAHOO_5M_BAR_DELAYED"&&
      hourly?.feed==="YFINANCE_YAHOO_1H_BAR_DELAYED"&&hourly?.interval==="1h"&&
      hourly?.currency===q.currency&&hourly?.exchange===q.exchange&&
      hourly?.sourceSymbol===q.sourceSymbol&&/^[A-Z]{3}$/.test(hourly.currency)&&
      Array.isArray(hourly.bars)&&hourly.bars.length>=2&&hourly.bars.length<=200;
    const bars=us?state.history[rowTicker(r)]?.bars:verifiedHourly?hourly.bars:null;
    if(!Array.isArray(bars)||bars.length<2)return "1M unavailable";
    const points=(us?bars.map(b=>({t:Date.parse(b.asOf),p:Number(b.close)})):
      bars.map(b=>({t:Number(b?.[0])*1000,p:Number(b?.[1])})))
      .filter(p=>Number.isFinite(p.t)&&p.t<Date.now()+120000&&
        p.t>=Date.now()-35*86400000&&Number.isFinite(p.p)&&p.p>0);
    if(points.length<2)return "1M unavailable";
    const range=monthRangePercentages(points,chartDisplayedPrice(r,q));
    return range?"High "+signedPercent(range.fromHigh)+" / Low "+signedPercent(range.fromLow):
      "1M unavailable";
  }
  function compactYear(r){
    const us=r.exchange==="US",q=state.quotes[rowTicker(r)];
    const weekly=us?null:q?.annual;
    const valid=!us&&q?.feed==="YFINANCE_YAHOO_5M_BAR_DELAYED"&&
      weekly?.feed==="YFINANCE_YAHOO_1W_BAR_DELAYED"&&weekly?.interval==="1wk"&&
      weekly?.currency===q.currency&&weekly?.exchange===q.exchange&&
      weekly?.sourceSymbol===q.sourceSymbol&&
      Array.isArray(weekly.bars)&&weekly.bars.length>=2&&weekly.bars.length<=64;
    const history=us?state.yearHistory[rowTicker(r)]:null;
    const bars=us?(history?.adjustment==="split"&&history?.range==="1y"?history.bars:null):
      valid?weekly.bars:null;
    if(!Array.isArray(bars)||bars.length<2)return "1Y unavailable";
    const points=(us?bars.map(b=>({t:Date.parse(b.asOf),p:Number(b.close)})):
      bars.map(b=>({t:Number(b?.[0])*1000,p:Number(b?.[1])})))
      .filter(p=>Number.isFinite(p.t)&&p.t<Date.now()+120000&&
        p.t>=Date.now()-380*86400000&&Number.isFinite(p.p)&&p.p>0);
    if(points.length<2)return "1Y unavailable";
    const range=monthRangePercentages(points,chartDisplayedPrice(r,q));
    return range?"High "+signedPercent(range.fromHigh)+" / Low "+signedPercent(range.fromLow):
      "1Y unavailable";
  }
  function compactYearLine(r){
    const summary=compactYear(r),cut=summary.indexOf(" / Low ");
    if(!summary.startsWith("High ")||cut<0)return compactLine(summary);
    return '<span class="compact-value compact-month" title="'+escape(summary)+'">'+
      '<span class="mini-chart-range-high">'+escape(summary.slice(0,cut))+'</span>'+
      ' / <span class="mini-chart-range-low">'+escape(summary.slice(cut+3))+'</span></span>';
  }
  function compactAction(r){
    const first=String(r.action||"").replace(/^[^A-Za-z]+/,"").trim();
    const verdict=(first.match(/^(?:STRONG BUY|STRONG SELL|BUY|SELL|WATCH|WAIT|HOLD|REDUCE|AVOID|EXIT)\b/i)||[])[0]||
      first.slice(0,22)||"Not rated";
    const risk=(String(r.risk||"").match(/\b(?:VERY HIGH|HIGH|MODERATE|LOW)\b/i)||[])[0];
    return verdict.toUpperCase()+(risk?" · "+risk.toUpperCase():"");
  }
  function compactMarkers(r,context){
    const i=score(r.investment),e=score(r.entry);
    const position=(context?.overnight||context?.regular)?.position?.kind;
    return "I "+(i>=0?i:"—")+" / E "+(e>=0?e:"—")+
      (position==="preferred"?" · Preferred":position==="acceptable"?" · Acceptable":"");
  }
  function compactDividend(r){
    const status=String(r.dividendStatus||"").toUpperCase();
    const y=r.dividendYieldPercent;
    return status==="NONE"?"No dividend":
      status==="PAYS"&&typeof y==="number"&&Number.isFinite(y)&&y>=0&&y<=100?
        y.toFixed(2)+"% yield":status==="PAYS"?"Pays · yield n/a":"Not verified";
  }
  function compactMusaffa(r){
    const assessment=musaffaVisual(r).label;
    const owner=String(r.screeningReviewStatus||"").toUpperCase();
    return r.bucket==="nonhalal"&&r.screeningReviewSource==="USER_REQUEST"&&
      (owner==="DOUBTFUL"||owner==="NON_HALAL")?
      "Owner: "+owner.replace("_","-")+" · Musaffa: "+assessment:assessment;
  }
  function rowStateControl(ticker,current){
    const next=nextRowState(current);
    const action=next==="favourite"?"Mark favourite":next==="minimized"?"Minimize row":"Restore normal row";
    const symbol=current==="favourite"?"★":current==="minimized"?"✕":"";
    return '<button type="button" class="row-state-toggle" data-row-ticker="'+escape(ticker)+
      '" data-state="'+current+'" aria-label="'+escape(ticker+": "+action)+
      '" title="'+escape(action+" · "+ticker)+'">'+
      '<span aria-hidden="true">'+symbol+'</span></button>';
  }
  function compactTr(r,ticker,active,control,context){
    const shortDate=(()=>{try{return new Intl.DateTimeFormat("en-AU",{
      timeZone:"Australia/Melbourne",day:"2-digit",month:"short",year:"2-digit"}).format(new Date(r.timestamp));}
      catch{return "Unknown date";}})();
    const priceSummary=compactPrice(r),overnightSummary=compactOvernight(r);
    return '<tr class="minimized-row"><td><div class="ticker-first-line">'+control+
      '<a class="ticker'+active+'" href="'+escape(r.reportPath)+'" title="'+escape(r.company||r.ticker)+
      '">'+escape(r.ticker)+'</a></div></td>'+
      '<td><div class="compact-combined">'+compactLine(priceSummary,compactPercentTone(priceSummary))+
        '<span class="compact-combined-separator">/</span>'+compactLine(overnightSummary,compactPercentTone(overnightSummary))+'</div></td>'+
      '<td>'+compactYearLine(r)+'</td>'+
      '<td>'+compactMonthLine(r)+'</td>'+
      '<td>'+compactLine(compactAction(r))+'</td>'+
      '<td class="markers-cell">'+compactLine(compactMarkers(r,context))+'</td>'+
      '<td class="industry-cell">'+compactLine(r.industryCategory||"Not classified")+'</td>'+
      '<td class="dividend-column">'+compactLine(compactDividend(r))+'</td>'+
      '<td>'+compactLine(shortDate)+'</td>'+
      '<td><div class="compact-musaffa" title="'+escape(compactMusaffa(r))+'">'+
        screeningCell(r)+'</div></td>'+
      '<td>'+compactLine(r.earnings||"Not verified")+'</td></tr>';
  }
  function tr(r){
    const action=cap(r.action,96);
    const context=zoneContext(r);
    const market=marketStatus(r);
    const active=market?.open?" market-open":"";
    const ticker=rowTicker(r),selection=rowState(r);
    const control=rowStateControl(ticker,selection);
    if(selection==="minimized")return compactTr(r,ticker,active,control,context);
    const status=market?'<small class="market-session">'+escape(market.market)+
      ' · Sydney '+escape(market.hours)+
      ' · '+(market.open?'<span class="market-open-label">Trading session</span>':'Outside session')+'</small>':
      '<small class="market-session muted">Market hours not configured</small>';
    return '<tr'+(selection==="favourite"?' class="favourite-row"':'')+
      '><td><div class="ticker-first-line">'+control+
      '<a class="ticker'+active+'" href="'+escape(r.reportPath)+'"'+
      (market?.open?' title="Market in regular weekday session"':'')+'>'+escape(r.ticker)+'</a></div>'+
      '<small>'+escape(r.company)+'</small>'+status+ethicalFirstColumn(r)+'</td>'+
    '<td>'+combinedPriceCell(r)+'</td>'+
    '<td>'+yearChartCell(r)+'</td>'+
    '<td>'+monthChartCell(r)+'</td>'+
    '<td>'+badge(action,actionKind(action))+'<small>Risk: '+escape(cap(r.risk,78))+'</small>'+
      '<small>Own: '+escape(cap(r.ownerAction,75))+'</small>'+zoneInsight(context)+'</td>'+
    '<td class="markers-cell">'+markersCell(r,context)+'</td>'+
    '<td class="industry-cell">'+industryCell(r)+'</td>'+
    '<td class="dividend-column">'+dividendCell(r)+'</td>'+
    '<td>'+escape(fmt(r.timestamp))+(r.conflictingBuckets?'<small class="warning">Both buckets contain this ticker</small>':"")+'</td>'+
    '<td>'+screeningCell(r)+'</td>'+
    '<td>'+escape(cap(r.earnings,110))+'</td></tr>';
  }
  function syncExchangeFilters(){
    // Automatically expose every exchange from the latest report index.
    // Adding a new market must not require a new UI code deployment.
    const select=$("exchange");
    const existing=new Set([...select.options].map(option=>option.value));
    const exchanges=[...new Set(state.rows.map(r=>String(r.exchange||"").toUpperCase()))]
      .filter(exchange=>/^[A-Z0-9]{2,12}$/.test(exchange)&&exchange!=="US").sort();
    for(const exchange of exchanges){
      if(existing.has(exchange))continue;
      const option=document.createElement("option");
      option.value=exchange;
      option.textContent=exchange;
      select.add(option);
      existing.add(exchange);
    }
  }
  // Split display only: preserve source-locked, independently computed
  // RizqInvests-first -> Investigate ethical precedence and the original
  // Musaffa badge logic. Never use administrative GitHub buckets as status.
  function isFlaggedForSecondTable(r){
    const finalStatus=String(r.ethicalFinalStatus||"").toUpperCase();
    const ethicalNegative=String(r.ethicalFinalColor||"").toUpperCase()==="RED"||
      finalStatus==="UNETHICAL"||finalStatus==="BDS_LISTED";
    // An explicit historical Musaffa NOT HALAL remains in table two even
    // when the existing date-sensitive badge correctly becomes INCONCLUSIVE.
    const classification=String(r.musaffaClassification||
      String(r.musaffa||"").split(" · ")[0]||"").trim().toUpperCase();
    const musaffaNegative=/(?:NOT\s+HALAL|NON[\s-]?COMPLIANT|NON[\s-]?HALAL|HARAM)/.test(classification);
    // GENERAL owner rule for any ticker/exchange; a label is not a Musaffa finding.
    // The folder alone and generic inconclusive screens never route to Table 2.
    const ownerFlagged=r.bucket==="nonhalal"&&r.screeningReviewSource==="USER_REQUEST"&&
      /^(?:DOUBTFUL|NON_HALAL)$/.test(String(r.screeningReviewStatus||"").toUpperCase());
    return ethicalNegative||musaffaNegative||ownerFlagged||musaffaVisual(r).tone==="bad";
  }
  function stockTableCounts(rows){
    // Top cards always describe the ENTIRE latest report set, just like "Latest reports".
    // Table headings below continue to show counts after user filters are applied.
    const table2=rows.filter(isFlaggedForSecondTable).length;
    return {table1:rows.length-table2,table2};
  }
  function render(){
    syncExchangeFilters();
    const query=norm($("search").value),bucket=$("bucket").value,industry=$("industry").value,exchange=$("exchange").value,order=$("order").value;
    const all=state.rows;
    const filtered=all.filter(r=>(bucket==="all"||r.bucket===bucket)&&(exchange==="all"||r.exchange===exchange)&&
      (industry==="all"||industry==="unclassified"&&!industryRank.has(r.industryCategory)||r.industryCategory===industry)&&
      (!query||norm(r.ticker+" "+r.company).includes(query)));
    filtered.sort((a,b)=>order==="category"?
      (industryRank.get(a.industryCategory)??99)-(industryRank.get(b.industryCategory)??99)||
        a.ticker.localeCompare(b.ticker):
      order==="dividend"?
        (typeof b.dividendYieldPercent==="number"?b.dividendYieldPercent:-1)-
        (typeof a.dividendYieldPercent==="number"?a.dividendYieldPercent:-1)||a.ticker.localeCompare(b.ticker):
      order==="ticker"?a.ticker.localeCompare(b.ticker):
      order==="entry"?score(b.entry)-score(a.entry)||b.timestamp.localeCompare(a.timestamp):
      order==="investment"?score(b.investment)-score(a.investment)||b.timestamp.localeCompare(a.timestamp):
      b.timestamp.localeCompare(a.timestamp)||a.ticker.localeCompare(b.ticker));
    // Shared search, category, exchange and order controls sort once,
    // then partition. No row is duplicated and both tables use identical tr().
    const primary=filtered.filter(r=>!isFlaggedForSecondTable(r));
    const flagged=filtered.filter(isFlaggedForSecondTable);
    $("rows").innerHTML=primary.length?primary.map(tr).join(""):'<tr><td colspan="11">No other stocks match your filters.</td></tr>';
    $("flaggedRows").innerHTML=flagged.length?flagged.map(tr).join(""):'<tr><td colspan="11">No unethical, non-halal or owner-reviewed doubtful stocks match your filters.</td></tr>';
    $("primaryShown").textContent=primary.length+" stock"+(primary.length===1?"":"s");
    $("flaggedShown").textContent=flagged.length+" stock"+(flagged.length===1?"":"s");
    $("count").textContent=all.length;
    $("halalCount").textContent=all.filter(r=>r.bucket==="halal").length;
    $("quoteCount").textContent=Object.keys(state.quotes).length;
    const totals=stockTableCounts(all);
    $("table1Count").textContent=totals.table1;
    $("table2Count").textContent=totals.table2;
    $("shown").textContent="Showing "+filtered.length+" of "+all.length+" latest reports · "+primary.length+" other / "+flagged.length+" flagged";
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
    async function retrieveHistory(symbols,range="1m"){
      const result={};
      for(let i=0;i<symbols.length;i+=(range==="1y"?20:40)){
        const part=symbols.slice(i,i+(range==="1y"?20:40));
        try{
          const response=await fetch("/api/price-history?symbols="+encodeURIComponent(part.join(","))+(range==="1y"?"&range=1y":""),{credentials:"same-origin",cache:"no-store"});
          const data=await response.json().catch(()=>({}));
          if(!response.ok||!data.series||typeof data.series!=="object")
            throw Error("HTTP "+response.status+(data.error?" · "+String(data.error):""));
          Object.assign(result,data.series);
        }catch(e){failures.push("Alpaca IEX "+(range==="1y"?"1Y":"1M")+" history: "+String(e?.message||e));}
      }
      return result;
    }
    try{
      const international=state.rows.filter(r=>r.exchange!=="US").map(r=>r.ticker);
      // CRITICAL: the immediate quote feeds are independent of 1M / 1Y chart
      // requests. NEVER make current prices wait for annual history.
      const [usQuotes,intlQuotes]=await Promise.all([
        retrieve("/api/prices",us,"Alpaca"),
        retrieve("/api/international-prices",international,"Personal Yahoo cache")
      ]);
      // Do not destroy last verified observations on a transient API outage.
      // The quote cells retain real asOf timestamps and never call older data live.
      state.quotes={...state.quotes,...usQuotes,...intlQuotes};
      const usCount=Object.keys(usQuotes).length,intlCount=Object.keys(intlQuotes).length;
      const priorUs=us.filter(t=>state.quotes[t]).length;
      $("marketNotice").textContent="Latest price refresh: "+usCount+
        " US quotes · "+intlCount+" non-US delayed Yahoo quotes · "+
        fmt(new Date().toISOString())+
        (usCount<us.length?" · "+(us.length-usCount)+" US tickers awaiting current quote; verified observations are retained and dated.":"")+
        (priorUs>usCount?" · "+(priorUs-usCount)+" US last-known quotes retained.":"")+
        (failures.length?" Provider issues: "+failures.join("; "):"")+
        " · US IEX daily and non-US delayed Yahoo hourly month charts checked every 5 minutes while visible from private caches. "+
        " Non-US quotes are collected on GitHub Actions every 20 minutes during trading hours; quote updates are checked every 5 minutes while visible. "+
        " 1Y US history is refreshed at most every 12 hours; international 1Y weekly data follows its existing private collector.";
      state.providerReady=true;
      render(); // Price cells show first, without awaiting either chart.
      // Reuse the existing 1M history but never let its failure wipe quote cells.
      const month=await retrieveHistory(us);
      state.history={...state.history,...month};
      render();
      // Historical daily closes do not need a provider call every five minutes.
      // One successful/error-bounded attempt per 12 hours avoids rate limits
      // and prevents the large annual payload from starving live quotes.
      if(Date.now()-state.lastYearRefreshAt>=12*3600000){
        state.lastYearRefreshAt=Date.now();
        const year=await retrieveHistory(us,"1y");
        state.yearHistory={...state.yearHistory,...year};
        render();
      }
      if(failures.length){
        $("marketNotice").textContent+=" · History/provider status: "+failures.join("; ");
      }
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
      const incomingHtml=new Set(data.rows.filter(r=>r&&r.sourceFormat==="html"&&typeof r.ticker==="string")
        .map(r=>r.ticker.toUpperCase()));
      // GitHub HTML index is authoritative for archived HTML reports. A deleted
      // ticker must disappear even from an already-open tab; older Markdown
      // reports remain available through the static build.
      if(!Array.isArray(data.errors)||!data.errors.length){
        for(const [ticker,row] of map){
          if(row.sourceFormat==="html"&&!incomingHtml.has(ticker)){
            map.delete(ticker);
            delete state.quotes[ticker];
            changed++;
          }
        }
      }
      for(const r of data.rows){
        if(!r||typeof r.ticker!=="string"||typeof r.timestamp!=="string"||r.sourceFormat!=="html")continue;
        const ticker=r.ticker.toUpperCase(),old=map.get(ticker);
        if(!old||r.timestamp>old.timestamp||
          r.timestamp===old.timestamp&&(old.sourceFormat!=="html"||JSON.stringify(old)!==JSON.stringify(r))){
          map.set(ticker,normalizeListing(r));
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
      void syncRowPreferences();
      await syncGithubReports();
      await refresh();
    }finally{state.cycleBusy=false;}
  }
  async function init(){
    try{
      const res=await fetch("/data/reports.json",{cache:"no-store"});
      if(!res.ok)throw Error("Archive index HTTP "+res.status);
      const data=await res.json();
      state.rows=Array.isArray(data.rows)?data.rows.map(normalizeListing):[];
      state.generatedAt=data.generatedAt;
      try{
        const marketRes=await fetch("/data/market-exchanges.json",{cache:"no-store"});
        if(marketRes.ok)state.markets=await marketRes.json();
      }catch{}
      $("marketNotice").textContent="Archive built "+fmt(data.generatedAt)+". Loading Alpaca US prices and cached delayed international prices.";
      render();
      void syncRowPreferences();
      await refresh();
      const addedReports=await syncGithubReports();
      // A second quote request is necessary only if GitHub added or updated a ticker.
      if(addedReports)await refresh();
      setInterval(()=>{if(document.visibilityState==="visible")checkAll();},300000);
      // Market-open glow changes at the minute boundary without fetching quotes.
      setInterval(()=>{if(document.visibilityState==="visible")render();},60000);
      setInterval(()=>{if(document.visibilityState==="visible")void syncRowPreferences();},60000);
      document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")checkAll();});
    }catch(e){
      $("marketNotice").textContent="Could not load archive: "+e.message;
      $("rows").innerHTML='<tr><td colspan="11">Archive unavailable.</td></tr>';
      $("flaggedRows").innerHTML='<tr><td colspan="11">Archive unavailable.</td></tr>';
    }
  }
  // Event delegation survives quote/report refreshes and both stock tables.
  $("rows").addEventListener("click",onRowStateClick);
  $("flaggedRows").addEventListener("click",onRowStateClick);
  window.addEventListener("storage",event=>{
    if(event.key===ROW_STATES_KEY||event.key===ROW_PENDING_KEY||event.key===null||
      event.key===LEGACY_FAVOURITES_KEY&&window.localStorage.getItem(ROW_STATES_KEY)===null){
      rowStates=loadRowStates();
      pendingRowChanges=loadPendingRowChanges();
      render();
      void syncRowPreferences();
    }
  });
  ["search","bucket","industry","exchange","order"].forEach(id=>$(id).addEventListener(id==="search"?"input":"change",render));
  $("refresh").addEventListener("click",checkAll);
  init();
})();