(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const ids=["search","ethical","bds","halal","type","sector","sort","pageSize"];
  let all=[],filtered=[],page=1,investigateLoaded=false,investigateByTicker=new Map();
  const cell=(row,value,cls)=>{
    const el=document.createElement("td");
    if(cls)el.className=cls;
    el.textContent=String(value??"—");
    row.append(el);
    return el;
  };
  const label=(el,value,kind)=>{
    const badge=document.createElement("span");
    badge.className="badge "+kind;
    badge.textContent=value;
    el.append(badge);
  };

  // Preserve raw RizqInvests provider label, but display the FINAL decision after
  // exact issuer/exchange matching against the second archived source.
  const aliasSuffixes=new Set(["THE","INC","INCORPORATED","CORP","CORPORATION","CO","COMPANY","LTD","LIMITED","PLC","AG","SA","NV","SE","LLC"]);
  const issuerKey=x=>String(x||"").toUpperCase().replace(/&/g," AND ").replace(/[^A-Z0-9]+/g," ")
    .split(/\\s+/).filter(x=>x&&!aliasSuffixes.has(x)).join(" ");
  function sameIssuer(a,b){
    const x=issuerKey(a),y=issuerKey(b);
    return Boolean(x&&y&&(x===y||x.startsWith(y+" ")||y.startsWith(x+" ")));
  }
  function investigateMatch(r){
    const candidates=investigateByTicker.get(String(r.ticker||"").toUpperCase())||[];
    const eligible=candidates.filter(x=>["NYSE","NASDAQ","AMEX"].includes(x.exchange)&&sameIssuer(r.company,x.company));
    return eligible.length===1?eligible[0]:null;
  }
  function combinedStatus(r){
    if(r.bds_badge===true)return {status:"BDS flagged",tone:"unethical",source:"RizqInvests",url:r.source_url};
    if(r.ethical_label==="Unethical")return {status:"Unethical",tone:"unethical",source:"RizqInvests",url:r.source_url};
    if(!investigateLoaded)return {status:"Unverified",tone:"uncertain",source:"Investigate source unavailable",url:null};
    const hit=investigateMatch(r);
    if(hit)return {status:"Unethical",tone:"unethical",source:"Investigate",url:hit.source_link_warning?null:hit.source_url};
    if(r.ethical_label==="Neutral"||r.ethical_label==="Ethical")
      return {status:r.ethical_label,tone:"halal",source:"RizqInvests + no Investigate match",url:r.source_url};
    return {status:"Unverified",tone:"uncertain",source:"Unsupported label",url:null};
  }
  function showCombined(cellElement,r){
    const v=combinedStatus(r);
    const line=document.createElement("div");line.className="combined-ethics";
    const prefix=document.createElement("span");prefix.className="combined-caption";prefix.textContent="Final:";
    line.append(prefix);
    const pill=document.createElement("span");pill.className="badge "+v.tone;pill.textContent=v.status;
    line.append(pill);
    const origin=document.createElement("small");origin.className="combined-ethics-source";
    origin.textContent=v.source;line.append(origin);
    if(v.source==="Investigate"&&v.url){
      const link=document.createElement("a");link.href=v.url;link.target="_blank";link.rel="noopener noreferrer";
      link.className="combined-ethics-link";link.textContent="Evidence ↗";line.append(link);
    }
    cellElement.append(line);
  }

  const capNumber=(x)=>{
    const match=String(x||"").match(/([\d,.]+)\s*([T B M K])?/i);
    if(!match)return -1;
    return Number(match[1].replaceAll(",",""))*({T:1e12,B:1e9,M:1e6,K:1e3}[String(match[2]||"").toUpperCase()]||1);
  };
  const priceNumber=(x)=>Number(String(x||"").replace(/[^0-9.]/g,""))||0;
  const clean=(x)=>String(x||"").toLocaleLowerCase("en").trim();
  function matching(){
    const query=clean($("search").value),ethical=$("ethical").value,bds=$("bds").value,
      halal=$("halal").value,type=$("type").value,sector=$("sector").value;
    filtered=all.filter(r=>
      (!query||clean(r.ticker+" "+r.company+" "+r.sector).includes(query))&&
      (!ethical||r.ethical_label===ethical)&&
      (!bds||(bds==="yes"&&r.bds_badge===true)||(bds==="no"&&r.bds_badge===false))&&
      (!halal||r.provider_halal_label===halal)&&
      (!type||r.security_type===type)&&(!sector||r.sector===sector));
    switch($("sort").value){
      case "tickerDesc":filtered.sort((a,b)=>b.ticker.localeCompare(a.ticker));break;
      case "company":filtered.sort((a,b)=>a.company.localeCompare(b.company));break;
      case "scoreDesc":filtered.sort((a,b)=>b.score_display-a.score_display||a.ticker.localeCompare(b.ticker));break;
      case "scoreAsc":filtered.sort((a,b)=>a.score_display-b.score_display||a.ticker.localeCompare(b.ticker));break;
      case "capDesc":filtered.sort((a,b)=>capNumber(b.market_cap_display)-capNumber(a.market_cap_display));break;
      case "priceDesc":filtered.sort((a,b)=>priceNumber(b.price_display)-priceNumber(a.price_display));break;
      case "bdsFirst":filtered.sort((a,b)=>Number(b.bds_badge)-Number(a.bds_badge)||a.ticker.localeCompare(b.ticker));break;
      default:filtered.sort((a,b)=>a.ticker.localeCompare(b.ticker));
    }
  }
  function makeRow(r){
    const tr=document.createElement("tr");
    cell(tr,r.ticker,"ticker");
    cell(tr,r.company,"company");
    const ethical=cell(tr,"");
    label(ethical,r.ethical_label,r.ethical_label==="Unethical"?"unethical":"neutral");
    showCombined(ethical,r);
    const bds=cell(tr,"");
    label(bds,r.bds_badge?"BDS badge":"Not shown",r.bds_badge?"bds":"none");
    const halal=cell(tr,"");
    const kind=r.provider_halal_label==="Halal"?"halal":
      r.provider_halal_label==="Not Halal"?"not-halal":"uncertain";
    label(halal,r.provider_halal_label,kind);
    cell(tr,r.sector);
    cell(tr,r.security_type,"type");
    cell(tr,r.score_display,"num score");
    cell(tr,r.market_cap_display,"num");
    cell(tr,r.price_display,"num");
    const src=cell(tr,"");
    const link=document.createElement("a");
    link.className="source-link";
    link.href="https://www.rizqinvests.com/halal/stock/"+encodeURIComponent(r.ticker)+"?view=both";
    link.target="_blank";
    link.rel="noopener noreferrer";
    const info=document.createElement("span");
    info.className="info-circle";
    info.textContent="i";
    info.setAttribute("aria-hidden","true");
    const text=document.createElement("span");
    text.textContent="Details";
    link.append(info,text);
    link.setAttribute("aria-label","Open RizqInvests stock details for "+r.ticker+" in a new tab");
    link.title="View "+r.ticker+" on RizqInvests (new tab)";
    src.append(link);
    return tr;
  }
  function render(){
    matching();
    const size=Number($("pageSize").value)||50;
    const maxPage=Math.max(1,Math.ceil(filtered.length/size));
    page=Math.min(page,maxPage);
    const start=(page-1)*size,visible=filtered.slice(start,start+size);
    const root=$("tableBody");
    root.replaceChildren();
    if(!visible.length){
      const tr=document.createElement("tr");
      cell(tr,"No matching stocks or ETFs. Try clearing one or more filters.","empty-state").colSpan=11;
      root.append(tr);
    }else{
      const fragment=document.createDocumentFragment();
      for(const record of visible)fragment.append(makeRow(record));
      root.append(fragment);
    }
    $("matchCount").textContent=String(filtered.length);
    $("resultLabel").textContent=filtered.length===1?" security":" securities";
    $("activeFilters").textContent=filtered.length===all.length?"":"· filtered from "+all.length;
    $("pageInfo").textContent=page+" / "+maxPage;
    $("rowRange").textContent=filtered.length?
      "Showing "+(start+1)+"–"+Math.min(start+visible.length,filtered.length)+" of "+filtered.length:
      "No matching rows";
    $("prev").disabled=page<=1;
    $("next").disabled=page>=maxPage;
    $("csv").disabled=!filtered.length;
  }
  function reset(){
    for(const id of ids){
      if(id==="pageSize")$(id).value="50";
      else if(id==="sort")$(id).value="ticker";
      else $(id).value="";
    }
    page=1;render();$("search").focus();
  }
  function exportCsv(){
    const columns=[
      ["Ticker","ticker"],["Company","company"],["Ethical label","ethical_label"],
      ["BDS badge shown","bds_badge"],["Provider halal label","provider_halal_label"],
      ["Sector","sector"],["Type","security_type"],["Score","score_display"],
      ["Market cap (archived)","market_cap_display"],["Price (archived)","price_display"],
      ["Original source","source_url"]
    ];
    const csvCell=v=>{
      let s=String(v===true?"Yes":v===false?"No":v??"");
      if(/^[\s]*[=+\-@]/.test(s))s="'"+s;
      return '"'+s.replaceAll('"','""')+'"';
    };
    const lines=[columns.map(x=>csvCell(x[0])).join(",")];
    for(const record of filtered)lines.push(columns.map(c=>csvCell(record[c[1]])).join(","));
    const blob=new Blob(["\ufeff"+lines.join("\r\n")],{type:"text/csv;charset=utf-8"});
    const href=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=href;a.download="rizqinvests-ethical-bds-nov-2026-filtered.csv";
    document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(href),1000);
  }
  async function start(){
    for(const id of ids){
      $(id).addEventListener(id==="search"?"input":"change",()=>{
        page=1;render();
      });
    }
    $("reset").addEventListener("click",reset);
    $("csv").addEventListener("click",exportCsv);
    $("prev").addEventListener("click",()=>{if(page>1){page--;render();}});
    $("next").addEventListener("click",()=>{page++;render();});
    try{
      const response=await fetch("/data/rizqinvests-ethical-bds-2026-11.json",{cache:"no-store",credentials:"same-origin"});
      if(!response.ok)throw Error("Database HTTP "+response.status);
      const data=await response.json();
      if(data.schema_version!==1||data.source_kind!=="user_supplied_snapshot"||
         data.source_period!=="2026-11"||!Array.isArray(data.rows)||
         data.rows.length!==491||new Set(data.rows.map(r=>r.ticker)).size!==491)
        throw Error("Snapshot data failed validation");
      all=data.rows.filter(r=>/^[A-Z0-9.-]+$/.test(String(r.ticker))&&
        typeof r.company==="string"&&typeof r.sector==="string");
      if(all.length!==491)throw Error("Invalid ticker data");
      const counts={
        neutral:all.filter(r=>r.ethical_label==="Neutral").length,
        unethical:all.filter(r=>r.ethical_label==="Unethical").length,
        bds:all.filter(r=>r.bds_badge===true).length
      };
      if(counts.neutral!==431||counts.unethical!==60||counts.bds!==40)
        throw Error("Ethical/BDS snapshot totals do not match");
      $("totalMetric").textContent=String(all.length);
      $("neutralMetric").textContent=String(counts.neutral);
      $("unethicalMetric").textContent=String(counts.unethical);
      $("bdsMetric").textContent=String(counts.bds);
      try{
        const res=await fetch("/data/investigate-ethical-concerns-2025-07.json",{cache:"no-store",credentials:"same-origin"});
        if(!res.ok)throw Error("Investigate database HTTP "+res.status);
        const inv=await res.json();
        if(inv.source_period!=="2025-07"||inv.source_kind!=="user_supplied_snapshot"||
          inv.ticker_count!==255||!Array.isArray(inv.rows)||inv.rows.length!==255)
          throw Error("Investigate dataset failed validation");
        investigateByTicker=new Map();
        for(const rec of inv.rows){
          const key=String(rec.ticker||"").toUpperCase();
          if(!investigateByTicker.has(key))investigateByTicker.set(key,[]);
          investigateByTicker.get(key).push(rec);
        }
        investigateLoaded=true;
      }catch(e){
        investigateLoaded=false;
        // Fail closed: a missing second source must never produce a green final label.
        const note=$("combinedNotice");
        if(note)note.textContent="Combined screening unavailable: Investigate snapshot could not be loaded. RizqInvests labels below are still shown as original provider data; no final Neutral verdict is issued.";
      }
      if(investigateLoaded){
        const neutral=all.filter(x=>x.ethical_label==="Neutral"&&x.bds_badge===false&&investigateMatch(x)).length;
        const count=$("combinedOverlapCount");
        if(count)count.textContent=String(neutral);
      }
      const sectors=[...new Set(all.map(r=>r.sector))].sort((a,b)=>a.localeCompare(b));
      for(const sector of sectors){
        const option=document.createElement("option");
        option.value=sector;option.textContent=sector;$("sector").append(option);
      }
      render();
    }catch(error){
      $("matchCount").textContent="Unavailable";
      $("tableBody").replaceChildren();
      const tr=document.createElement("tr");
      cell(tr,"Could not load the archived screening database. "+String(error.message||error),"empty-state").colSpan=11;
      $("tableBody").append(tr);
      $("rowRange").textContent="Data unavailable";
    }
  }
  start();
})();
