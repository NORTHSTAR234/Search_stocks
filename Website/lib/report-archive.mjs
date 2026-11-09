// Pure archive helpers shared by the Pages build and the live GitHub HTML check.
const PATTERN=/^(halal|nonhalal)\/([A-Za-z0-9.-]+)\/([A-Za-z0-9.-]+)_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})Z(?:(_chat_response))?\.(md|html)$/i;
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

function snapshotFromHtml(html,expectedTicker){
  const m=html.match(/<script\b(?=[^>]*\bid\s*=\s*["']aya-report-snapshot["'])[^>]*>([\s\S]*?)<\/script\s*>/i);
  if(!m)return null;
  if(m[1].length>150000)throw Error("Oversized research snapshot");
  let snap;
  try{snap=JSON.parse(m[1]);}catch{throw Error("Invalid research snapshot JSON");}
  if(!snap||typeof snap!=="object"||String(snap.ticker||"").toUpperCase()!==expectedTicker)
    throw Error("Research snapshot security identity mismatch");
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
    m?.[1]||heading.replace(/\s*[—–-]\s*(?:\d{1,2}\s+\w+\s+\d{4}|\w+\s+\d{4}).*$/i,"")||ticker,95)
    .replace(/\s+(?:NASDAQ|NYSE|NYSEARCA|ASX|TWSE|Bursa|MYX|KLSE)\s*:\s*[A-Z0-9.-]+$/i,"");
  const statusFromSnapshot=snapshot?.report_type==="screening_only";
  const isStatus=statusFromSnapshot||
    /(?:HALAL\s+STATUS(?:\s+ONLY)?|FINANCIAL\s+RESEARCH\s+SKIPPED|RESEARCH\s+SKIPPED|FULL INVESTMENT RESEARCH SKIPPED)/i.test(first.slice(0,10000))||
    info.bucket==="nonhalal"&&!/<(?:div|section)\b[^>]*class=["'][^"']*(?:dashboard|scoregrid)/i.test(first);
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
  const exchange=ticker.endsWith(".TW")?"TWSE":ticker.endsWith(".AX")?"ASX":
    /\.(?:KL|MY)$/.test(ticker)?"BURSA":
    ["ASX","TWSE","BURSA","KLSE","MYX"].includes(exchangeHint)?(exchangeHint==="ASX"?"ASX":exchangeHint==="TWSE"?"TWSE":"BURSA"):
    /\b(?:ASX\s*:|AUSTRALIAN SECURITIES EXCHANGE)\b/i.test(upperHead)?"ASX":
    /\b(?:BURSA|MALAYSIA|KLSE|MYX)\b/i.test(upperHead)?"BURSA":
    /\b(?:TWSE|TAIWAN STOCK EXCHANGE)\b/i.test(upperHead)?"TWSE":
    /\./.test(ticker)?"OTHER":"US";
  const currency=exchange==="US"?"USD":exchange==="ASX"?"AUD":exchange==="TWSE"?"TWD":exchange==="BURSA"?"MYR":"UNKNOWN";
  const entrySnapshot=snapshot?.entry||{},targetSnapshot=snapshot?.targets||{};
  const preferred=priceBand(entrySnapshot.preferred_low,entrySnapshot.preferred_high,currency)||
    reportMetric(html,"Preferred buy zone")||namedField(fields,/^preferred\s+(?:buy\s+)?zone/i);
  const acceptable=priceBand(entrySnapshot.acceptable_low,entrySnapshot.acceptable_high,currency)||
    reportMetric(html,"Acceptable buy zone")||namedField(fields,/^acceptable\s+(?:buy\s+)?zone/i);
  const zones=preferred&&acceptable?preferred+" / "+acceptable:preferred||acceptable||"NOT RATED";
  const initial=currencyAmount(targetSnapshot.stop,currency)||reportMetric(html,"Initial stop")||
    namedField(fields,/^initial stop/i);
  const chase=currencyAmount(entrySnapshot.no_chase,currency)||reportMetric(html,"No chase")||
    namedField(fields,/^no[_\s-]?chase/i);
  const stops=initial&&chase?initial+" / "+chase:initial||chase||"NOT RATED";
  let earnings="";
  const next=snapshot?.next_earnings;
  if(next?.date){
    const date=reportDate(next.date);
    if(date)earnings=date+(next.confirmed===true?" confirmed":next.confirmed===false?" estimated":"");
  }
  earnings=earnings||namedField(fields,/^(?:confirmed next earnings|next earnings|upcoming earnings)/i)||
    (reportMetric(html,"Next earnings")||"");
  if(!earnings){
    const match=strip(first.slice(0,10500)).match(/(?:confirmed\s+)?(?:fiscal\s+Q\d\s+\d{4}\s+)?earnings\s+on\s+[^.;]{7,120}/i);
    earnings=match?short(match[0],115):"NOT VERIFIED";
  }
  const musaffaSnap=snapshot?.musaffa;
  let musaffa;
  if(musaffaSnap&&typeof musaffaSnap.classification==="string"){
    musaffa=short(musaffaSnap.classification+
      (typeof musaffaSnap.grade==="string"&&musaffaSnap.grade?" · "+musaffaSnap.grade:"")+
      (typeof musaffaSnap.screening_date==="string"&&musaffaSnap.screening_date?" · "+musaffaSnap.screening_date:"")+
      (typeof musaffaSnap.gate==="string"&&musaffaSnap.gate?" · "+musaffaSnap.gate:""),140);
  }else musaffa=short((screenBadge||pill||"NOT VERIFIED")+(screeningDate?" · "+screeningDate:""),140);
  const snapshotInvestment=snapshot?.scores?.investment;
  const snapshotEntry=snapshot?.scores?.entry;
  const investFallback=reportMetric(html,"Investment quality")||score(first,"Investment");
  const entryFallback=reportMetric(html,"Entry attractiveness")||score(first,"Entry");
  const investment=score100(snapshotInvestment,investFallback);
  const entry=score100(snapshotEntry,entryFallback);
  const action=short(snapshot?.actions?.new_position||newPill?.replace(/^IF I DON['’]?T OWN\s*:\s*/i,"")||
    acts[0]||namedField(fields,/^action\s+(?:if i don.t own|new buyer|new investor)/i)||"NOT RATED",140);
  const ownerAction=short(snapshot?.actions?.existing_holder||existingPill?.replace(/^IF I OWN\s*:\s*/i,"")||
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
    earnings:isStatus?"NOT RATED":earnings,
    zones:isStatus?"NOT RATED":zones,
    stops:isStatus?"NOT RATED":stops,
    nativeCurrency:currency,
    zoneBands:exchange==="US"&&!isStatus?numericBands(zones):[],
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
