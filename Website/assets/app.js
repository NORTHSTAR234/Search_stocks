(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const state={rows:[],quotes:{},history:{},markets:{},loading:false,generatedAt:null,providerReady:true,githubTreeSha:null,syncing:false,cycleBusy:false};
  const escape=s=>String(s??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const fmt=iso=>{try{return new Intl.DateTimeFormat("en-AU",{timeZone:"Australia/Sydney",day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",timeZoneName:"short"}).format(new Date(iso));}catch{return iso||"Unknown";}};
  const norm=s=>String(s??"").toUpperCase().replace(/[^A-Z0-9 ]/g," ").trim();
  const score=s=>{const m=String(s).match(/(\d{1,3})\s*\/\s*100/);return m?Number(m[1]):-1;};
  function normalizeListing(row){
    const ticker=String(row?.ticker||"").toUpperCase();
    const suffix=ticker.includes(".")?ticker.split(".").at(-1):"";
    const bySuffix={TWSE:"TWSE",TW:"TWSE",ASX:"ASX",AX:"ASX",MYX:"BURSA",KL:"BURSA",MY:"BURSA"};
    const exchange=bySuffix[suffix];
    return exchange&&row.exchange!==exchange?{...row,exchange}:row;
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
      const symbol=yahooSymbol(r);
      const link=symbol?'<small><a href="https://finance.yahoo.com/quote/'+encodeURIComponent(symbol)+'/" target="_blank" rel="noopener noreferrer">View on Yahoo Finance (delayed) ↗</a></small>':"";
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
      ' · '+escape(fmt(q.asOf))+'</small></div>';
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
  // Compare independent verified live/delayed quotes to numeric historical
  // buy zones, always in the exact listing's currency; never perform silent FX.
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
    const observations=[context?.regular,context?.overnight].filter(Boolean);
    const hits=kind=>observations.filter(x=>x?.position?.kind===kind).map(x=>x.label);
    function highlightedCard(label,value,tone,kind){
      const matches=hits(kind);
      const range=r.zoneBands?.[kind==="preferred"?0:1];
      // Only show a BELOW warning when price is below every buy range.
      // A price already inside Preferred must not be warned as below Acceptable.
      const warnings=observations.filter(x=>x?.position?.kind==="below"&&
        Array.isArray(range)&&typeof range[0]==="number"&&
        Number.isFinite(range[0])&&range[0]>0&&x.price<range[0]).map(x=>({
          label:x.label,percent:((range[0]-x.price)/range[0]*100).toFixed(1)
        }));
      // A stock can be BETWEEN two ordered zones (as with 2383.TWSE).
      // Explain the relationship in BOTH adjacent boxes, not just Action/Risk.
      // Never treat a gap between zones as an in-range buy alert.
      const validRange=Array.isArray(range)&&range.length===2&&
        range.every(n=>typeof n==="number"&&Number.isFinite(n)&&n>0)&&range[1]>=range[0];
      const between=validRange?observations.filter(x=>x?.position?.kind==="between")
        .map(x=>({
          label:x.label,side:kind==="preferred"?"above":"below",
          percent:(kind==="preferred"?(x.price-range[1])/range[1]*100:
            (range[0]-x.price)/range[0]*100).toFixed(1)
        })):[];

      // When beyond the highest entry band, warn on Acceptable (or Preferred
      // if no valid Acceptable reference exists). The separate no-chase level
      // must not be falsely described as breached.
      const hasAcceptable=Array.isArray(r.zoneBands?.[1])&&
        r.zoneBands[1].length===2&&r.zoneBands[1].every(n=>
          typeof n==="number"&&Number.isFinite(n)&&n>0)&&
        r.zoneBands[1][1]>=r.zoneBands[1][0];
      const above=validRange&&(kind==="acceptable"||!hasAcceptable)?
        observations.filter(x=>x?.position?.kind==="above"&&x.price>range[1])
        .map(x=>({label:x.label,percent:((x.price-range[1])/range[1]*100).toFixed(1)})):[];
      if(!matches.length&&!warnings.length&&!between.length&&!above.length)
        return reportRangeCard(label,value,tone);
      if(!matches.length){
        const alertKind=warnings.length?"below":between.length?"between":"above";
        const data=warnings.length?warnings:between.length?between:above;
        const chips=data.map(x=>'<span class="range-hit-chip range-'+alertKind+'-chip">'+
          escape(x.label)+': '+escape(x.percent)+'% '+
          (alertKind==="between"?escape(x.side)+' this zone · between ranges':
            alertKind==="above"?'above entry range · caution':'below · caution')+
          '</span>').join("");
        return '<div class="score-box range-box '+tone+' zone-'+alertKind+'">'+
          '<span class="score-label">'+escape(label)+'</span>'+
          '<strong class="range-value '+tone+'">'+escape(value)+'</strong>'+
          '<div class="range-live-tags">'+chips+'</div>'+
          '</div>';
      }
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
    if(recent&&!ambiguous&&positive&&gate!=="FAIL")return {tone:"good",label:"VERIFIED HALAL"};
    return {tone:"warn",label:"INCONCLUSIVE"};
  }
  function screeningCell(r){
    // The full Musaffa evidence remains in the existing ticker report.
    const result=musaffaVisual(r);
    return '<div class="musaffa-cell status-only-cell">'+badge(result.label,result.tone)+'</div>';
  }
  function aaoifiVisual(r){
    const status=String(r.aaoifiStatus||"").trim().toUpperCase();
    if(status==="AAOIFI-COMPLIANT")return {tone:"good",label:"COMPLIANT"};
    if(status==="AAOIFI-NON-COMPLIANT")return {tone:"bad",label:"NON-COMPLIANT"};
    if(status==="SHARIAH REVIEW REQUIRED")return {tone:"warn",label:"REVIEW REQUIRED"};
    if(status==="INSUFFICIENT DATA")return {tone:"warn",label:"INSUFFICIENT DATA"};
    return {tone:"warn",label:"NOT SCREENED"};
  }
  function aaoifiCell(r){
    const result=aaoifiVisual(r);
    // Preserve the AAOIFI report hyperlink and the independent verdict.
    const statusBadge=r.aaoifiReportPath?
      '<a class="badge '+result.tone+' aaoifi-link" href="'+escape(r.aaoifiReportPath)+'">'+escape(result.label)+'</a>':
      badge(result.label,result.tone);
    return '<div class="aaoifi-cell status-only-cell">'+statusBadge+'</div>';
  }
  // Independent ethical/BDS screening. Only evidence-backed recent neutral is green.
  function ethicalVisual(r,now=new Date()){
    const status=String(r.ethicalStatus||"").trim().toUpperCase();
    const bds=r.ethicalBdsListed;
    const source=typeof r.ethicalSourceUrl==="string"&&
      /^https:\/\/(?:www\.)?rizqinvests\.com\//i.test(r.ethicalSourceUrl);
    const date=String(r.ethicalAssessmentDate||"");
    const observed=String(r.ethicalCheckedAt||"");
    const dated=/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))?Date.parse(date):null;
    const checked=/^\d{4}-\d{2}-\d{2}T/.test(observed)&&Number.isFinite(Date.parse(observed))?Date.parse(observed):null;
    const evidenceAt=dated??checked;
    if(!source||evidenceAt===null||evidenceAt>now.getTime())return {tone:"warn",label:"NOT VERIFIED"};
    const older=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-4,now.getUTCDate()));
    const stale=evidenceAt<older.getTime();
    if(bds===true||status==="UNETHICAL"||status==="BDS_LISTED")
      return {tone:"bad",label:bds===true||status==="BDS_LISTED"?"BDS FLAGGED":"UNETHICAL",stale};
    // NEUTRAL means no RizqInvests BDS flag under the owner policy; external lists remain separate.
    if(!stale&&(status==="NEUTRAL"||status==="ETHICAL"))
      return {tone:"good",label:status==="NEUTRAL"?"NEUTRAL":"ETHICAL",stale:false};
    return {tone:"warn",label:stale?"STALE / RECHECK":"NOT VERIFIED",stale};
  }
  function ethicalCell(r){
    const view=ethicalVisual(r),path=r.aaoifiReportPath;
    // Keep existing link from status badge to AAOIFI; provide the original
    // RizqInvests provider link using an adjacent icon instead of prose.
    const pill=path?'<a href="'+escape(path)+'" class="badge '+view.tone+' aaoifi-link">'+escape(view.label)+'</a>':badge(view.label,view.tone);
    const provider=r.ethicalSourceUrl&&/^https:\/\/www\.rizqinvests\.com\/halal\/stock\/[A-Z0-9.-]+\?view=both$/i.test(r.ethicalSourceUrl)?
      '<a class="ethical-source-link" href="'+escape(r.ethicalSourceUrl)+'" target="_blank" rel="noopener noreferrer" title="View '+escape(r.ticker)+' on RizqInvests" aria-label="View '+escape(r.ticker)+' on RizqInvests">↗</a>':"";
    return '<div class="ethical-cell status-only-cell">'+pill+provider+'</div>';
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
    const bars=us?state.history[r.ticker]?.bars:verifiedHourly?hourly.bars:null;
    if(!Array.isArray(bars)||bars.length<2)return '<div class="mini-chart-empty">1M history unavailable<small>'+
      (us?'No verified IEX daily bars':'Waiting for verified delayed Yahoo hourly bars')+'</small></div>';
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
    const description=us?"Actual Alpaca IEX 1-month daily raw closes (not consolidated).":
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
      lastLabel+'<small class="mini-chart-legend"><span class="blue-dot">'+escape(us?"IEX closes":"Yahoo 1h · delayed")+'</span>'+
      (levels[0]!=null?'<span class="preferred-dot">Preferred '+escape(quoteMoney(currency,levels[0]))+'</span>':"")+
      (levels[1]!=null?'<span class="acceptable-dot">Acceptable '+escape(quoteMoney(currency,levels[1]))+'</span>':"")+
      '</small></div>';
  }

  // Keep all existing score, buy-zone and risk-marker helpers unchanged.
  function markersCell(r,context){
    return '<div class="markers-stack">'+
      scoreCell(r)+
      zoneCell(r,context)+
      stopsCell(r)+
      '</div>';
  }
  function tr(r){
    const action=cap(r.action,96);
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
    '<td>'+monthChartCell(r)+'</td>'+
    '<td>'+badge(action,actionKind(action))+'<small>Risk: '+escape(cap(r.risk,78))+'</small>'+
      '<small>Own: '+escape(cap(r.ownerAction,75))+'</small>'+zoneInsight(context)+'</td>'+
    '<td class="markers-cell">'+markersCell(r,context)+'</td>'+
    '<td>'+escape(fmt(r.timestamp))+(r.conflictingBuckets?'<small class="warning">Both buckets contain this ticker</small>':"")+'</td>'+
    '<td>'+screeningCell(r)+'</td>'+
    '<td>'+aaoifiCell(r)+'</td>'+
    '<td>'+ethicalCell(r)+'</td>'+
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
  function render(){
    syncExchangeFilters();
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
    async function retrieveHistory(symbols){
      const result={};
      for(let i=0;i<symbols.length;i+=40){
        const part=symbols.slice(i,i+40);
        try{
          const response=await fetch("/api/price-history?symbols="+encodeURIComponent(part.join(",")),{credentials:"same-origin",cache:"no-store"});
          const data=await response.json().catch(()=>({}));
          if(!response.ok||!data.series||typeof data.series!=="object")
            throw Error("HTTP "+response.status+(data.error?" · "+String(data.error):""));
          Object.assign(result,data.series);
        }catch(e){failures.push("Alpaca IEX 1M history: "+String(e?.message||e));}
      }
      return result;
    }
    try{
      const international=state.rows.filter(r=>r.exchange!=="US").map(r=>r.ticker);
      const [usQuotes,intlQuotes,month]=await Promise.all([
        retrieve("/api/prices",us,"Alpaca"),
        retrieve("/api/international-prices",international,"Personal Yahoo cache"),
        retrieveHistory(us)
      ]);
      state.quotes={...usQuotes,...intlQuotes};
      state.history={...state.history,...month};
      const usCount=Object.keys(usQuotes).length,intlCount=Object.keys(intlQuotes).length;
      $("marketNotice").textContent="Quote observations: "+usCount+
        " US tickers via Alpaca · "+intlCount+" non-US delayed Yahoo quotes (private cache) · Updated "+
        fmt(new Date().toISOString())+
        " · US IEX daily and non-US delayed Yahoo hourly month charts checked every 5 minutes while visible from private caches. "+
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
      $("rows").innerHTML='<tr><td colspan="11">Archive unavailable.</td></tr>';
    }
  }
  ["search","bucket","exchange","order"].forEach(id=>$(id).addEventListener(id==="search"?"input":"change",render));
  $("refresh").addEventListener("click",checkAll);
  init();
})();