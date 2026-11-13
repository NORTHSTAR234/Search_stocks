// Pure archive helpers shared by the Pages build and the live GitHub HTML check.
const PATTERN=/^(halal|nonhalal)\/([A-Za-z0-9.-]+)\/([A-Za-z0-9.-]+)_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})Z(?:(_chat_response))?\.(md|html)$/i;
const AAOIFI_PATTERN=/^AAOIFI\/([A-Za-z0-9.-]+)\.html$/i;
const GITHUB="https://github.com/NORTHSTAR234/Search_stocks/blob/main/";
const entityMap={amp:"&",lt:"<",gt:">",quot:'"',apos:"'",nbsp:" ",mdash:"—",ndash:"–",bull:"•",times:"×",hellip:"…"};
export function archiveInfo(relative) {
  const m=String(relative||"").match(PATTERN);
  if(!m||m[2].toUpperCase()!==m[3].toUpperCase())return null;
  const timestamp=m[4]+"T"+m[5].replaceAll("-",":")+"Z";
  if(!Number.isFinite(Date.parse(timestamp)))return null;
  return {bucket:m[1].toLowerCase(),ticker:m[2].toUpperCase(),timestamp,path:relative,
    format:m[7].toLowerCase(),legacyHtmlSuffix:Boolean(m[6])};
}
export function aaoifiInfo(relative) {
  const value=String(relative||"");
  const m=value.match(AAOIFI_PATTERN);
  if(!m)return null;
  return {bucket:"aaoifi",ticker:m[1].toUpperCase(),timestamp:"LATEST AAOIFI",path:value,
    format:"html",legacyHtmlSuffix:false};
}
export function latestArchive(files) {
  const found=new Map();
  for(const item of files) {
    const key=item.ticker.toUpperCase(),old=found.get(key);
    if(!old||item.timestamp>old.timestamp||
      item.timestamp===old.timestamp&&(item.format==="html"&&old.format!=="html"||
      item.format===old.format&&old.legacyHtmlSuffix&&!item.legacyHtmlSuffix||
      item.format===old.format&&item.legacyHtmlSuffix===old.legacyHtmlSuffix&&item.path<old.path))found.set(key,item);
  }
  return [...found.values()].sort((a,b)=>b.timestamp.localeCompare(a.timestamp)||a.ticker.localeCompare(b.ticker));
}
function decode(s){return String(s||"").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(full,key)=>{
  if(key[0]==="#"){const n=key[1].toLowerCase()==="x"?parseInt(key.slice(2),16):parseInt(key.slice(1),10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):"";}
  return entityMap[key.toLowerCase()]??full;
});}
function strip(raw){return decode(String(raw||"").replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,"")
  .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi,"")
  .replace(/<svg\b[^>]*>[\s\S]*?<\/svg\s*>/gi,"")
  .replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim());}
function short(value,max=160){const v=strip(value);return v.length>max?v.slice(0,max-1).trimEnd()+"…":v;}
function escaped(value){return String(value||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");}
function firstTag(raw,tag){const m=raw.match(new RegExp("<"+tag+"\\b[^>]*>([\\s\\S]*?)<\\/"+tag+"\\s*>","i"));return short(m?.[1]||"");}
function score(raw,name) {
  const safe=name.replace(/[^a-z]/gi,"");
  const m=raw.match(new RegExp("<div\\b[^>]*class=[\"'][^\"']*(?:muted|tiny)[^\"']*[\"'][^>]*>\\s*"+safe+"\\s*<\\/div>\\s*<div\\b[^>]*class=[\"'][^\"']*score[^\"']*[\"'][^>]*>([\\s\\S]*?)<\\/div>","i"));
  const value=short(m?.[1]||"");
  return /^\d{1,3}\s*\/\s*100$/.test(value)?value.replace(/\s+/g,""):"NOT RATED";
}
function actionTexts(raw){
  const result=[];
  for(const m of raw.matchAll(/<div\b[^>]*class=["'][^"']*\baction\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi)){
    const v=short(m[1],135);if(v&&/^(?:[^\p{L}]{0,5})?(?:WATCH|WAIT|BUY|STRONG BUY|HOLD|SELL|AVOID|REDUCE|EXIT|SCREENING)/iu.test(v))result.push(v);
  }
  return result;
}
function tableValues(raw) {
  const fields=new Map();
  for(const tr of raw.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)){
    const cells=[...tr[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]\s*>/gi)].map(m=>short(m[1],210));
    if(cells.length>=2&&cells[0])fields.set(cells[0].toLowerCase(),cells[1]);
  }
  return fields;
}
function namedField(fields,regex) {
  for(const [key,value] of fields)if(regex.test(key))return value;
  return "";
}
function numericBands(raw){
  return [...String(raw).matchAll(/(?:US\$|USD\s*|\$)\s*([\d,]+(?:\.\d+)?)\s*[–—-]\s*(?:(?:US\$|USD\s*|\$)\s*)?([\d,]+(?:\.\d+)?)/gi)].slice(0,2).map(x=>[+x[1].replaceAll(",",""),+x[2].replaceAll(",","")]);
}

export function parseAaoifiHtml(info,html){
  if(!info||info.bucket!=="aaoifi"||info.format!=="html")
    throw Error("Invalid AAOIFI report identity");
  const m=String(html||"").match(/<script\b(?=[^>]*\bid\s*=\s*["']aaoifi-report-snapshot["'])[^>]*>([\s\S]*?)<\/script\s*>/i);
  if(!m)throw Error("Missing AAOIFI report snapshot");
  if(m[1].length>60000)throw Error("Oversized AAOIFI report snapshot");
  let snap;
  try{snap=JSON.parse(m[1]);}catch{throw Error("Invalid AAOIFI report snapshot JSON");}
  const allowed=new Set(["AAOIFI-COMPLIANT","AAOIFI-NON-COMPLIANT","SHARIAH REVIEW REQUIRED","INSUFFICIENT DATA"]);
  const required=["schema_version","ticker","exchange","company","status","confidence","screened_at","executive_summary"];
  const has=(object,key)=>object&&Object.prototype.hasOwnProperty.call(object,key);
  if(!snap||typeof snap!=="object"||snap.schema_version!==1||required.some(key=>!has(snap,key)))
    throw Error("Incomplete AAOIFI report snapshot");
  if(typeof snap.ticker!=="string"||!/^[A-Z0-9][A-Z0-9.-]{0,24}$/i.test(snap.ticker)||
     typeof snap.exchange!=="string"||!/^[A-Z0-9][A-Z0-9.-]{1,15}$/i.test(snap.exchange)||
     typeof snap.company!=="string"||!snap.company.trim()||
     typeof snap.status!=="string"||!allowed.has(snap.status)||
     !(snap.confidence===null||typeof snap.confidence==="string")||
     typeof snap.screened_at!=="string"||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(snap.screened_at)||
     !Number.isFinite(Date.parse(snap.screened_at))||
     typeof snap.executive_summary!=="string"||!snap.executive_summary.trim())
    throw Error("Invalid AAOIFI report snapshot");

  const ethical=snap.ethical??null;
  if(ethical!==null){
    const statuses=new Set(["NEUTRAL","ETHICAL","UNETHICAL","BDS_LISTED","UNVERIFIED"]);
    if(typeof ethical!=="object"||Array.isArray(ethical)||!statuses.has(ethical.status)||
       !(ethical.bds_listed===true||ethical.bds_listed===false||ethical.bds_listed===null)||
       !(ethical.assessment_date===null||typeof ethical.assessment_date==="string"&&
          /^\d{4}-\d{2}-\d{2}$/.test(ethical.assessment_date)&&Number.isFinite(Date.parse(ethical.assessment_date)))||
       typeof ethical.checked_at_utc!=="string"||!/^\d{4}-\d{2}-\d{2}T/.test(ethical.checked_at_utc)||
       !Number.isFinite(Date.parse(ethical.checked_at_utc))||
       typeof ethical.source_url!=="string"||
       !/^https:\/\/(?:www\.)?rizqinvests\.com\//i.test(ethical.source_url)||
       typeof ethical.reason!=="string"||ethical.reason.length>1000)
       throw Error("Invalid ethical screening snapshot");
  }
  const breakdown=snap.assessment_breakdown??null;
  if(breakdown!==null){
    const financialStates=new Set(["PASS_ON_TESTED_EVIDENCE","FAIL_VERIFIED","REVIEW_REQUIRED","INSUFFICIENT_DATA"]);
    const rightsStates=new Set(["CONFIRMED_PASS","CONFIRMED_FAIL","CONDITIONAL_BOOK_PROXY_ABOVE","CONDITIONAL_BOOK_PROXY_BELOW","NOT_CALCULABLE"]);
    const part=(p,states,detail)=>
      p&&typeof p==="object"&&!Array.isArray(p)&&states.has(p.status)&&
      typeof p.summary==="string"&&p.summary.length>0&&p.summary.length<=1200&&
      typeof p.missing_evidence==="string"&&p.missing_evidence.length>0&&p.missing_evidence.length<=1200;
    const f=breakdown.financial,t=breakdown.tradability,o=breakdown.overall;
    if(typeof breakdown!=="object"||Array.isArray(breakdown)||
       !part(f,financialStates,"financial")||!part(t,rightsStates,"tradability")||
       !o||typeof o!=="object"||o.status!==snap.status||
       typeof o.reason!=="string"||!o.reason.trim()||o.reason.length>1200||
       typeof o.missing_evidence!=="string"||!o.missing_evidence.trim()||o.missing_evidence.length>1200||
       (t.book_proxy_percent!==null&&t.book_proxy_percent!==undefined&&
        (typeof t.book_proxy_percent!=="number"||!Number.isFinite(t.book_proxy_percent)||t.book_proxy_percent<0||t.book_proxy_percent>100))||
       (t.threshold_percent!==null&&t.threshold_percent!==undefined&&
        (typeof t.threshold_percent!=="number"||t.threshold_percent<0||t.threshold_percent>100))||
       typeof breakdown.updated_at_utc!=="string"||
       !Number.isFinite(Date.parse(breakdown.updated_at_utc)))
       throw Error("Invalid three-part AAOIFI assessment snapshot");
  }
  return {
    aaoifiFinancialStatus:breakdown?.financial?.status||null,
    aaoifiTradabilityStatus:breakdown?.tradability?.status||null,
    aaoifiTradabilityBookProxyPercent:breakdown?.tradability?.book_proxy_percent??null,
    aaoifiMissingEvidence:breakdown?short(breakdown.overall.missing_evidence,210):null,
    aaoifiBreakdownUpdatedAt:breakdown?.updated_at_utc||null,
    ethicalStatus:ethical?.status||null,
    ethicalBdsListed:ethical?.bds_listed??null,
    ethicalAssessmentDate:ethical?.assessment_date||null,
    ethicalCheckedAt:ethical?.checked_at_utc||null,
    ethicalReason:ethical?short(ethical.reason,280):null,
    ethicalSourceUrl:ethical?.source_url||null,
    ticker:snap.ticker.toUpperCase(),exchange:snap.exchange.toUpperCase(),company:short(snap.company,120),
    status:snap.status,confidence:snap.confidence?short(snap.confidence,40):null,
    screenedAt:snap.screened_at,reason:short(snap.executive_summary,280),
    reportUrl:GITHUB+info.path.split("/").map(encodeURIComponent).join("/"),
    reportPath:"/view-report?path="+encodeURIComponent(info.path)
  };
}

function snapshotFromHtml(html,expectedTicker){
  const m=html.match(/<script\b(?=[^>]*\bid\s*=\s*["']aya-report-snapshot["'])[^>]*>([\s\S]*?)<\/script\s*>/i);
  if(!m)return null;
  if(m[1].length>150000)throw Error("Oversized research snapshot");
  let snap;
  try{snap=JSON.parse(m[1]);}catch{throw Error("Invalid research snapshot JSON");}
  // Both report formats are valid: early generators used `ticker`, while
  // Aya 3.1 reports may use `canonical_archive_ticker` and omit `ticker`.
  // Each supplied identity must match the exact archive path. Never accept
  // an arbitrary stock just because the file is in a ticker folder.
  const identifiers=[snap?.ticker,snap?.canonical_archive_ticker]
    .filter(v=>typeof v==="string"&&v.trim())
    .map(v=>v.trim().toUpperCase());
  const twseAlias=v=>/^\d{4}\.TWSE$/.test(expectedTicker)&&
    v===expectedTicker.replace(/\.TWSE$/, ".TW")&&
    String(snap?.exchange||"").toUpperCase()==="TWSE";
  if(!snap||typeof snap!=="object"||!identifiers.length||
     identifiers.some(v=>v!==expectedTicker&&!twseAlias(v)))
    throw Error("Research snapshot security identity mismatch");
  if(snap.schema_version===2){
    // One exact, mandatory snapshot contract for all NEW HTML reports;
    // older schemas remain backward-compatible.
    const required=["ticker","canonical_archive_ticker","source_market_ticker",
      "exchange","company","currency","report_utc","report_type",
      "musaffa","actions","risk","scores","next_earnings","entry","targets"];
    const has=(object,key)=>object&&Object.prototype.hasOwnProperty.call(object,key);
    if(required.some(key=>!has(snap,key)))
      throw Error("Incomplete Aya v2 research snapshot contract");
    const ids=[snap.ticker,snap.canonical_archive_ticker];
    if(ids.some(value=>typeof value!=="string"||value.toUpperCase()!==expectedTicker)||
       typeof snap.source_market_ticker!=="string"||!snap.source_market_ticker||
       typeof snap.company!=="string"||!snap.company||
       typeof snap.exchange!=="string"||!snap.exchange||
       typeof snap.currency!=="string"||!snap.currency||
       typeof snap.report_utc!=="string"||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(snap.report_utc)||
       !["full","screening_only"].includes(snap.report_type))
      throw Error("Invalid Aya v2 research snapshot metadata");
    const exchangeMap={ASX:"ASX",TWSE:"TWSE",MYX:"MYX"};
    const suffix=expectedTicker.split(".").at(-1);
    if(exchangeMap[suffix]&&snap.exchange.toUpperCase()!==exchangeMap[suffix])
      throw Error("Aya v2 exchange identity mismatch");
    const shapes=[
      [snap.musaffa,["classification","grade","screening_date","gate"]],
      [snap.actions,["new_position","existing_holder"]],
      [snap.scores,["investment","entry"]],
      [snap.next_earnings,["date","confirmed"]],
      [snap.entry,["preferred_low","preferred_high","acceptable_low","acceptable_high","no_chase"]],
      [snap.targets,["stop","tp1","tp2"]]
    ];
    if(shapes.some(([object,keys])=>!object||typeof object!=="object"||
       Array.isArray(object)||keys.some(key=>!has(object,key))))
      throw Error("Incomplete Aya v2 nested report fields");
    const validScore=value=>value===null||(Number.isInteger(value)&&value>=0&&value<=100);
    const validPrice=value=>value===null||(typeof value==="number"&&Number.isFinite(value)&&value>0);
    if(!validScore(snap.scores.investment)||!validScore(snap.scores.entry)||
       ![snap.entry.preferred_low,snap.entry.preferred_high,snap.entry.acceptable_low,
         snap.entry.acceptable_high,snap.entry.no_chase,snap.targets.stop,
         snap.targets.tp1,snap.targets.tp2].every(validPrice))
      throw Error("Invalid Aya v2 rating or price field");
    if(snap.report_type==="screening_only"&&(
       snap.scores.investment!==null||snap.scores.entry!==null||
       snap.actions.new_position!==null||snap.actions.existing_holder!==null||
       [snap.entry.preferred_low,snap.entry.preferred_high,snap.entry.acceptable_low,
        snap.entry.acceptable_high,snap.entry.no_chase,snap.targets.stop,
        snap.targets.tp1,snap.targets.tp2].some(value=>value!==null)))
      throw Error("Screening-only report must not include financial research");
  }
  return snap;
}
function score100(value,fallback){
  if(Number.isInteger(value)&&value>=0&&value<=100)return value+"/100";
  return fallback||"NOT RATED";
}
function reportMetric(html,label){
  const wanted=label.toLowerCase();
  for(const m of html.matchAll(/<(?:article|div)\b[^>]*class=["'][^"']*\bmetric\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:article|div)\s*>/gi)){
    const tags=[...m[1].matchAll(/<(?:small|strong)\b[^>]*>([\s\S]*?)<\/(?:small|strong)\s*>/gi)].map(x=>short(x[1],120));
    if(tags.length>=2&&tags[0].toLowerCase().startsWith(wanted))return tags[1];
  }
  return "";
}
function actionPills(first){
  const out=[];
  for(const m of first.matchAll(/<(?:span|div)\b[^>]*class=["'][^"']*\b(?:pill|action)\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:span|div)\s*>/gi)){
    const text=short(m[1],145);
    if(text)out.push(text);
  }
  return out;
}
function reportDate(value){
  if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+"T12:00:00Z")))return "";
  return new Intl.DateTimeFormat("en-GB",{timeZone:"UTC",year:"numeric",month:"short",day:"numeric"}).format(new Date(value+"T12:00:00Z"));
}
function priceBand(low,high,currency){
  const a=Number(low),b=Number(high);
  return Number.isFinite(a)&&Number.isFinite(b)&&a>0&&b>=a
    ?(currency==="USD"?"US$":currency+" ")+a.toLocaleString("en-US")+"–"+b.toLocaleString("en-US")
    :"";
}
function currencyAmount(value,currency){
  const n=Number(value);
  return Number.isFinite(n)&&n>0?(currency==="USD"?"US$":currency+" ")+n.toLocaleString("en-US"):"";
}

export function parseHtmlReport(info,html) {
  if(info.format!=="html"||typeof html!=="string"||html.length<180||
     !/<html\b/i.test(html)||!/<body\b/i.test(html))throw Error("Malformed or non-HTML research archive");
  const first=html.slice(0,35000);
  const ticker=info.ticker.toUpperCase();
  const snapshot=snapshotFromHtml(html,ticker);
  const heading=firstTag(first,"h1");
  const m=heading.match(/^(.+?)\s*\((?:NASDAQ|NYSE|NYSEARCA|ASX|TWSE|Bursa|MYX|KLSE)\s*:\s*[A-Za-z0-9.-]+\)/i);
  const company=short(snapshot?.identity?.company||snapshot?.identity?.name||
    snapshot?.company||snapshot?.security||snapshot?.name||
    m?.[1]||heading.replace(/\s*[—–-]\s*(?:\d{1,2}\s+\w+\s+\d{4}|\w+\s+\d{4}).*$/i,"")||ticker,95)
    .replace(/\s+(?:NASDAQ|NYSE|NYSEARCA|ASX|TWSE|Bursa|MYX|KLSE)\s*:\s*[A-Z0-9.-]+$/i,"");
  // A full financial report can be archived in nonhalal/ when screening is
  // inconclusive or non-compliant. Folder placement is NOT a research gate.
  const isStatus=typeof snapshot?.report_type==="string"?
    snapshot.report_type==="screening_only":
    (/(?:HALAL\s+STATUS(?:\s+ONLY)?|FINANCIAL\s+RESEARCH\s+SKIPPED|RESEARCH\s+SKIPPED|FULL INVESTMENT RESEARCH SKIPPED)/i.test(first.slice(0,10000))||
     info.bucket==="nonhalal"&&!/<(?:div|section)\b[^>]*class=["'][^"']*(?:dashboard|scoregrid)/i.test(first));
  const fields=tableValues(html);
  const pills=actionPills(first);
  const acts=actionTexts(first);
  const newPill=pills.find(x=>/IF I DON['’]?T OWN\s*:/i.test(x));
  const existingPill=pills.find(x=>/IF I OWN\s*:/i.test(x));
  const pill=(pills.find(x=>/^(?:MUSAFFA|HALAL|HARAM|NOT HALAL|COMPLIANT)/i.test(x))||"");
  const screenHeader=(first.match(/<header\b[^>]*class=["'][^"']*\bmusaffa-gate\b[^"']*["'][^>]*>([\s\S]*?)<\/header\s*>/i)||[])[1]||"";
  const screenBadge=short((screenHeader.match(/<span\b[^>]*>([\s\S]*?)<\/span>/i)||[])[1]||"",100);
  const screeningDate=short((first.match(/<span\b[^>]*class=["'][^"']*\bdate\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)||[])[1]||"");
  const riskPill=pills.find(x=>/^RISK\s*:/i.test(x));
  const riskMatch=strip(first.slice(0,8500)).match(/\b(VERY HIGH|HIGH|MEDIUM|MODERATE|LOW)(?:[–—-](?:VERY HIGH|HIGH|MEDIUM|MODERATE|LOW))?\s+risk\b/i);
  const risk=short(snapshot?.risk||(riskPill||"").replace(/^RISK\s*:\s*/i,"")||riskMatch?.[0]||"NOT RATED",80);
  const exchangeHint=String(snapshot?.exchange||"").toUpperCase();
  const upperHead=strip(first.slice(0,6000));
  const exchange=ticker.endsWith(".TWSE")||ticker.endsWith(".TW")?"TWSE":
    ticker.endsWith(".ASX")||ticker.endsWith(".AX")?"ASX":
    ticker.endsWith(".MYX")||/\.(?:KL|MY)$/.test(ticker)?"BURSA":
    ["ASX","TWSE","BURSA","KLSE","MYX"].includes(exchangeHint)?(exchangeHint==="ASX"?"ASX":exchangeHint==="TWSE"?"TWSE":"BURSA"):
    /\b(?:ASX\s*:|AUSTRALIAN SECURITIES EXCHANGE)\b/i.test(upperHead)?"ASX":
    /\b(?:BURSA|MALAYSIA|KLSE|MYX)\b/i.test(upperHead)?"BURSA":
    /\b(?:TWSE|TAIWAN STOCK EXCHANGE)\b/i.test(upperHead)?"TWSE":
    /\./.test(ticker)&&/^[A-Z]{2,10}$/.test(exchangeHint)?exchangeHint:
    /\./.test(ticker)?"OTHER":"US";
  // V2 snapshots declare the actual native currency; legacy reports keep exchange fallbacks.
  const currency=typeof snapshot?.currency==="string"&&/^[A-Z]{3}$/.test(snapshot.currency)?snapshot.currency:
    exchange==="US"?"USD":exchange==="ASX"?"AUD":exchange==="TWSE"?"TWD":exchange==="BURSA"?"MYR":"UNKNOWN";
  // Legacy report snapshots differ in shape; read only observed source fields.
  // New v2 snapshots use the exact canonical fields listed above.
  const entrySnapshot=snapshot?.entry||{},targetSnapshot=snapshot?.targets||{},buy=snapshot?.buy||{};
  const band=value=>Array.isArray(value)&&value.length===2?
    priceBand(value[0],value[1],currency):"";
  const preferred=priceBand(entrySnapshot.preferred_low,entrySnapshot.preferred_high,currency)||
    band(entrySnapshot.preferred)||band(snapshot?.entry_preferred)||
    band(snapshot?.preferred_buy_zone)||band(buy.preferred)||
    reportMetric(html,"Preferred buy zone")||namedField(fields,/^preferred\s+(?:buy\s+)?zone/i);
  const acceptable=priceBand(entrySnapshot.acceptable_low,entrySnapshot.acceptable_high,currency)||
    band(entrySnapshot.acceptable)||band(snapshot?.entry_acceptable)||
    band(snapshot?.acceptable_buy_zone)||band(buy.acceptable)||
    reportMetric(html,"Acceptable buy zone")||namedField(fields,/^acceptable\s+(?:buy\s+)?zone/i);
  const zones=preferred&&acceptable?preferred+" / "+acceptable:preferred||acceptable||"NOT RATED";
  const initial=currencyAmount(targetSnapshot?.stop??entrySnapshot?.initial_stop??snapshot?.stop??buy.stop,currency)||
    reportMetric(html,"Initial stop")||namedField(fields,/^initial stop/i);
  const chase=currencyAmount(entrySnapshot.no_chase??snapshot?.no_chase??buy.no_chase,currency)||
    reportMetric(html,"No chase")||namedField(fields,/^no[_\s-]?chase/i);
  const stops=initial&&chase?initial+" / "+chase:initial||chase||"NOT RATED";
  let earnings="";
  const next=snapshot?.next_earnings;
  if(typeof next==="string"&&next.trim())earnings=short(next,115);
  else if(next?.date){
    const date=reportDate(next.date);
    if(date)earnings=date+(next.confirmed===true?" confirmed":next.confirmed===false?" estimated":"");
  }
  const other=snapshot?.earnings;
  if(!earnings&&typeof other==="string"&&other.trim())earnings=short(other,115);
  if(!earnings&&other&&typeof other==="object"){
    const candidate=other.next_date||other.next_date_estimated;
    const date=reportDate(candidate);
    if(date)earnings=date+
      (other.next_date_estimated||/estimat|unconfirm/i.test(String(other.date_status||""))?
        " estimated":other.confirmed===true?" confirmed":"");
  }
  earnings=earnings||namedField(fields,/^(?:confirmed next earnings|next earnings|upcoming earnings)/i)||
    (reportMetric(html,"Next earnings")||"");
  if(!earnings){
    const match=strip(first.slice(0,10500)).match(/(?:confirmed\s+)?(?:fiscal\s+Q\d\s+\d{4}\s+)?earnings\s+on\s+[^.;]{7,120}/i);
    earnings=match?short(match[0],115):"NOT VERIFIED";
  }
  const musaffaSnap=snapshot?.musaffa||snapshot?.screening;
  // The canonical month-only field is screening_period. Historical reports
  // (including SU.PA) can instead use screening_month: preserve its precision.
  const screeningPeriods=[musaffaSnap?.screening_period,musaffaSnap?.screening_month]
    .filter(value=>typeof value==="string"&&value.trim())
    .map(value=>value.trim());
  const screeningPeriod=screeningPeriods[0]||"";
  const conflictingScreeningMonths=new Set(screeningPeriods).size>1;
  let musaffa;
  const status=typeof musaffaSnap?.classification==="string"?musaffaSnap.classification:
    typeof musaffaSnap?.status==="string"?musaffaSnap.status:"";
  if(status){
    const date=musaffaSnap.screening_date||musaffaSnap.screen_date||
      musaffaSnap.screened_date||musaffaSnap.date||screeningPeriod||"";
    const monthOnly=typeof date==="string"&&/^\d{4}-\d{2}$/.test(date);
    musaffa=short(status+
      (typeof musaffaSnap.grade==="string"&&musaffaSnap.grade?" · "+musaffaSnap.grade:"")+
      (typeof date==="string"&&date?" · "+date+(monthOnly?" (month)":""):"")+
      (typeof musaffaSnap.gate==="string"&&musaffaSnap.gate?" · "+musaffaSnap.gate:""),140);
  }else musaffa=short((screenBadge||pill||"NOT VERIFIED")+(screeningDate?" · "+screeningDate:""),140);
  const snapshotInvestment=snapshot?.scores?.investment??snapshot?.investment_score;
  const snapshotEntry=snapshot?.scores?.entry??snapshot?.entry_score;
  const investFallback=reportMetric(html,"Investment quality")||score(first,"Investment");
  const entryFallback=reportMetric(html,"Entry attractiveness")||score(first,"Entry");
  const investment=score100(snapshotInvestment,investFallback);
  const entry=score100(snapshotEntry,entryFallback);
  const action=short(snapshot?.actions?.new_position||snapshot?.actions?.new_buyer||
    snapshot?.new_buyer_action||newPill?.replace(/^IF I DON['’]?T OWN\s*:\s*/i,"")||
    acts[0]||namedField(fields,/^action\s+(?:if i don.t own|new buyer|new investor)/i)||"NOT RATED",140);
  const ownerAction=short(snapshot?.actions?.existing_holder||snapshot?.actions?.holder||
    snapshot?.existing_holder_action||snapshot?.holder_action||existingPill?.replace(/^IF I OWN\s*:\s*/i,"")||
    acts[1]||namedField(fields,/^action\s+if i own/i)||"NOT RATED",140);
  return {
    company:company||ticker,ticker,exchange,bucket:info.bucket,timestamp:info.timestamp,
    statusOnly:isStatus,
    action:isStatus?"SCREENING ONLY — NO INVESTMENT REPORT":action,
    ownerAction:isStatus?"RESEARCH SKIPPED":ownerAction,
    risk:isStatus?"NOT RATED":risk,
    investment:isStatus?"NOT RATED":investment,
    entry:isStatus?"NOT RATED":entry,
    musaffa,
    musaffaClassification:typeof status==="string"&&status?status:null,
    musaffaGate:typeof musaffaSnap?.gate==="string"?musaffaSnap.gate:null,
    musaffaScreeningDate:typeof (musaffaSnap?.screening_date||musaffaSnap?.screen_date||musaffaSnap?.screened_date||musaffaSnap?.date)==="string"?
      (musaffaSnap.screening_date||musaffaSnap.screen_date||musaffaSnap.screened_date||musaffaSnap.date):null,
    musaffaScreeningPeriod:screeningPeriod||null,
    musaffaScreeningMonthConflict:conflictingScreeningMonths,
    musaffaAssessment:typeof musaffaSnap?.assessment==="string"?musaffaSnap.assessment:null,
    musaffaReason:typeof musaffaSnap?.reason==="string"?short(musaffaSnap.reason,180):null,
    earnings:isStatus?"NOT RATED":earnings,
    zones:isStatus?"NOT RATED":zones,
    stops:isStatus?"NOT RATED":stops,
    nativeCurrency:currency,
    // Optional per-report market metadata; never replaces the required v2 keys.
    marketSchedule:snapshot?.market_schedule&&typeof snapshot.market_schedule==="object"?
      snapshot.market_schedule:null,
    sourceMarketTicker:typeof snapshot?.source_market_ticker==="string"?snapshot.source_market_ticker:null,
    zoneBands:!isStatus&&snapshot?.schema_version===2?
      [[snapshot.entry?.preferred_low,snapshot.entry?.preferred_high],
       [snapshot.entry?.acceptable_low,snapshot.entry?.acceptable_high]]
       .filter(p=>p.every(n=>typeof n==="number"&&Number.isFinite(n)&&n>0)&&p[0]<=p[1]):
      exchange==="US"&&!isStatus?numericBands(zones):[],
    reportUrl:GITHUB+info.path.split("/").map(encodeURIComponent).join("/"),
    reportPath:"/view-report?path="+encodeURIComponent(info.path),
    sourceFormat:"html",conflictingBuckets:false
  };
}
export const REPORT_CSP="default-src 'none'; script-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; style-src 'unsafe-inline'; img-src https: data:; font-src https: data:";
export function safeHtmlDocument(info,html){
  if(info.format!=="html"||typeof html!=="string"||html.length>2200000||!/<html\b/i.test(html)||!/<body\b/i.test(html))
    throw Error("Refusing malformed HTML archive");
  // Preserve the complete styled A–H report, including embedded SVG charts.
  // Keep scripts inert and disallow navigation tricks; CSP independently forbids all script execution.
  const stripped=html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,"")
    .replace(/<base\b[^>]*>/gi,"")
    .replace(/<meta\b(?=[^>]*http-equiv\s*=\s*["']?refresh\b)[^>]*>/gi,"")
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,"")
    .replace(/\s(?:href|src)\s*=\s*(?:"\s*(?:javascript|vbscript|data:text\/html):[^"]*"|'\s*(?:javascript|vbscript|data:text\/html):[^']*')/gi,' href="#"');
  const nav='<div role="navigation" style="padding:10px 18px;background:#15233a;color:#dbe7f7;font:600 14px system-ui,sans-serif;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap"><a style="color:#9cc7ff;text-decoration:none" href="/">← All stock reports</a><span>'+escaped(info.ticker)+' · '+escaped(info.timestamp)+'</span><a style="color:#9cc7ff" href="'+escaped(GITHUB+info.path.split("/").map(encodeURIComponent).join("/"))+'" target="_blank" rel="noopener noreferrer">Original GitHub HTML</a></div>';
  return stripped.replace(/(<body\b[^>]*>)/i,"$1"+nav);
}
