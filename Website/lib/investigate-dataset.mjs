// Source-locked July 2025 Investigate company concerns, entirely from the
// user-uploaded spreadsheet. Never infer an official BDS designation.
import fs from "node:fs";
const SOURCE=new URL("../data/investigate-ethical-concerns-2025-07.json",import.meta.url);
const US=new Set(["US","NYSE","NASDAQ","AMEX","NYSEAMERICAN","ARCA","NYSEARCA","BATS","CBOE"]);
const SUFFIX={"ASX":"ASX","AX":"ASX","SIX":"SWX","SW":"SWX","PA":"PAR","XPAR":"PAR",
 "L":"LSE","LON":"LSE","T":"TKS","JP":"TKS","HK":"HKG","TO":"TSE","TSX":"TSE",
 "ST":"STO","CO":"STO","MI":"MIL","DE":"ETR","AS":"AMS","BR":"BRU","MC":"BME"};
const EXCHANGE={
 "ASX":new Set(["ASX"]), "SWX":new Set(["SWX","SIX"]), "PAR":new Set(["PAR","XPAR"]),
 "LSE":new Set(["LSE","LON"]), "TKS":new Set(["TKS","JPX","TSE_JAPAN"]),
 "HKG":new Set(["HKG","HKEX"]), "TSE":new Set(["TSE","TSX","TORONTO"]),
 "STO":new Set(["STO","ST","CPH","COPENHAGEN","OMX","XCSE"]),
 "MIL":new Set(["MIL","XMIL"]), "ETR":new Set(["ETR","XETRA","XETR","DE"]),
 "ASX":new Set(["ASX"]), "AMS":new Set(["AMS","XAMS"]), "BRU":new Set(["BRU","XBRU"]),
 "BME":new Set(["BME","BMAD"])
};
const SUFFIX_WORDS=new Set(["THE","INC","INCORPORATED","CORP","CORPORATION","CO","COMPANY","LTD","LIMITED","PLC","AG","SA","NV","SE","LLC"]);
function issuer(value){
 return String(value||"").toUpperCase().replace(/&/g," AND ").replace(/[^A-Z0-9]+/g," ")
  .split(/\s+/).filter(x=>x&&!SUFFIX_WORDS.has(x)).join(" ");
}
function sameIssuer(a,b){const x=issuer(a),y=issuer(b);return Boolean(x&&y&&(x===y||x.startsWith(y+" ")||y.startsWith(x+" ")));}
function tickerListing(row){
 const sym=String(row.ticker||"").toUpperCase().trim(),match=sym.match(/^(.*)\.([A-Z]{1,5})$/);
 if(match&&Object.hasOwn(SUFFIX,match[2]))return {ticker:match[1],exchange:SUFFIX[match[2]]};
 return {ticker:sym,exchange:String(row.exchange||"").toUpperCase().trim()};
}
function exchangeMatches(source,request){
 const s=String(source||"").toUpperCase(),r=String(request||"").toUpperCase();
 if(US.has(r))return US.has(s)&&(r==="US"||r===s);
 if(US.has(s))return false;
 if(s===r)return true;
 return EXCHANGE[s]?.has(r)||false;
}
export function loadInvestigateDataset(){
 const data=JSON.parse(fs.readFileSync(SOURCE,"utf8"));
 if(data.schema_version!==1||data.source_kind!=="user_supplied_snapshot"||
    data.source_period!=="2025-07"||data.ticker_count!==255||
    !Array.isArray(data.rows)||data.rows.length!==255)throw Error("Invalid Investigate dataset header");
 const byTicker=new Map(),unique=new Set();
 for(const item of data.rows){
  if(!item.ticker||!item.company||!item.exchange||!item.isin||!item.summary||
     !/^https:\/\/investigate\.info\//.test(String(item.source_url))||
     !["divestment_shortlist","prisons","occupations","borders"].every(k=>typeof item[k]==="boolean")||
     !["divestment_shortlist","prisons","occupations","borders"].some(k=>item[k]))
    throw Error("Invalid Investigate row: "+item.ticker);
  const id=item.ticker.toUpperCase()+"|"+item.exchange.toUpperCase();
  if(unique.has(id))throw Error("Duplicate Investigate listing "+id);unique.add(id);
  const key=item.ticker.toUpperCase();
  if(!byTicker.has(key))byTicker.set(key,[]);
  byTicker.get(key).push(item);
 }
 return {data,byTicker};
}
export function matchInvestigate(row,registry){
 const listing=tickerListing(row),possible=registry.byTicker.get(listing.ticker)||[];
 const isin=String(row.isin||row.ISIN||"").toUpperCase();
 const hits=possible.filter(x=>exchangeMatches(x.exchange,listing.exchange)&&sameIssuer(row.company,x.company)&&
   (!isin||isin===String(x.isin).toUpperCase()));
 return hits.length===1?hits[0]:null;
}
export function applyInvestigateDataset(row,registry){
 const hit=matchInvestigate(row,registry);
 const base={...row,investigateListed:false,investigateCategories:[],investigateSourceUrl:null,
  investigateSourceKind:"USER_SNAPSHOT",investigateDataAsOf:"2025-07",
  investigateSummary:null,investigateCompany:null,investigateIsin:null,
  investigateDivestmentShortlist:false,investigateSourceLinkWarning:null};
 if(!hit)return base;
 const cats=[["divestment_shortlist","Divestment shortlist"],["prisons","Prisons"],
  ["occupations","Occupations"],["borders","Borders"]].filter(([k])=>hit[k]).map(([,v])=>v);
 return {...base,investigateListed:true,investigateCategories:cats,
  investigateSourceUrl:hit.source_link_warning?null:hit.source_url,
  investigateSourceLinkWarning:hit.source_link_warning||null,
  investigateSummary:hit.summary,investigateCompany:hit.company,
  investigateIsin:hit.isin,investigateDivestmentShortlist:hit.divestment_shortlist};
}
