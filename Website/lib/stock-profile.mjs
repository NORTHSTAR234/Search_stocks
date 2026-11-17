// Canonical nine-category stock taxonomy and historic report-only income parser.
// Do not infer dividend yields from live quotes or from a company name.
export const INDUSTRY_CATEGORIES=Object.freeze([
 "Technology & Communications",
 "Healthcare & Pharmaceuticals",
 "Financial Services",
 "Consumer Essentials",
 "Consumer Discretionary",
 "Industrials, Construction & Transportation",
 "Energy & Resources",
 "Utilities",
 "Real Estate"
]);
const CATEGORY_SET=new Set(INDUSTRY_CATEGORIES);
export function validIndustryCategory(value){
 return typeof value==="string"&&CATEGORY_SET.has(value)?value:null;
}
// Existing immutable HTML snapshots predate industry_category. These exact
// symbol+issuer matches are curated one-time migration entries, NOT claims
// that an old report explicitly provided an industry category.
const LEGACY=new Map([
 ["1519.TWSE",["FORTUNE ELECTRIC",5]],
 ["2330.TWSE",["TAIWAN SEMICONDUCTOR",0]],
 ["2377.TWSE",["MICRO STAR",0]],
 ["2379.TWSE",["REALTEK",0]],
 ["2383.TWSE",["ELITE MATERIAL",0]],
 ["2449.TWSE",["KING YUAN",0]],
 ["2454.TWSE",["MEDIATEK",0]],
 ["3034.TWSE",["NOVATEK",0]],
 ["AAPL",["APPLE",0]],
 ["ABBN.SIX",["ABB",5]],
 ["AMAT",["APPLIED MATERIALS",0]],
 ["AMD",["ADVANCED MICRO DEVICES",0]],
 ["ASM.XAMS",["ASM INTERNATIONAL",0]],
 ["CSCO",["CISCO",0]],
 ["CVX",["CHEVRON",6]],
 ["HD",["HOME DEPOT",4]],
 ["JNJ",["JOHNSON AND JOHNSON",1]],
 ["KO",["COCA COLA",3]],
 ["LLY",["ELI LILLY",1]],
 ["MA",["MASTERCARD",2]],
 ["MRK",["MERCK",1]],
 ["MU",["MICRON",0]],
 ["NVDA",["NVIDIA",0]],
 ["ORG.ASX",["ORIGIN ENERGY",7]],
 ["PG",["PROCTER AND GAMBLE",3]],
 ["SU.PA",["SCHNEIDER ELECTRIC",5]],
 ["TSLA",["TESLA",4]],
 ["V",["VISA",2]],
 ["XOM",["EXXONMOBIL",6]]
]);
function issuerKey(s){return String(s||"").toUpperCase().replace(/&/g," AND ").replace(/[^A-Z0-9]+/g," ").replace(/^THE /,"").trim();}
export function classifyArchivedReport({snapshot,fields,ticker,company,statusOnly=false}){
 if(statusOnly)return {industryCategory:null,industryDetail:null,industryCategorySource:"UNVERIFIED"};
 const sector=snapshot?.industry||snapshot?.industry_detail||snapshot?.sector||
   fields?.get("industry")||fields?.get("sub-industry")||null;
 const fromSnapshot=validIndustryCategory(snapshot?.industry_category||snapshot?.industryCategory||
   snapshot?.category);
 if(fromSnapshot)return {industryCategory:fromSnapshot,industryDetail:typeof sector==="string"?sector:null,industryCategorySource:"REPORT_SNAPSHOT"};
 const visible=validIndustryCategory(fields?.get("industry category")||fields?.get("stock category"));
 if(visible)return {industryCategory:visible,industryDetail:typeof sector==="string"?sector:null,industryCategorySource:"REPORT_TEXT"};
 const old=LEGACY.get(String(ticker||"").toUpperCase());
 if(old&&issuerKey(company).startsWith(old[0])&&(!snapshot?.security_type||snapshot.security_type!=="ETF"))
   return {industryCategory:INDUSTRY_CATEGORIES[old[1]],industryDetail:typeof sector==="string"?sector:null,industryCategorySource:"LEGACY_ISSUER_MAPPING"};
 return {industryCategory:null,industryDetail:typeof sector==="string"?sector:null,industryCategorySource:"UNVERIFIED"};
}
const numeric=x=>typeof x==="number"&&Number.isFinite(x)?x:null;
const numberOrNull=x=>x===null||x===undefined?null:numeric(x);
const firstNumber=(data,names)=>{for(const name of names){const v=numeric(data?.[name]);if(v!==null)return v;}return null;};
const yieldKeys=["yield_percent","yield_pct","indicative_yield_percent","indicative_yield_pct","annualized_yield_pct","annualized_yield_percent","cash_yield_percent","dividend_yield_pct","dividend_yield_percent"];
const annualKeys=["annual_dividend_per_share","annualized_per_share","annualized","annualised","annual","annual_cash_per_share","fy26_cash_per_share","last_annual_chf"];
const dateKeys={ex:["next_ex_dividend_date","next_ex_date","ex_dividend_date","ex_date","last_ex_date","last_ex"],
 payment:["next_payment_date","payment_date","pay_date","last_payment"]};
const dateOrNull=x=>typeof x==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+"T00:00:00Z"))?x:null;
const validUrl=x=>typeof x==="string"&&/^https:\/\//i.test(x)&&x.length<1500?x:null;
function displayedAmount(value,currency){
 if(value===null)return null;
 if(value===0)return (currency||"")+" 0";
 return (currency||"")+" "+value.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:4});
}
function labelledNumber(fields,regex,suffix=false){
 if(!fields)return null;
 for(const [k,v] of fields){
   if(!regex.test(k))continue;
   const text=String(v||"");
   const match=suffix?text.match(/(\d+(?:\.\d+)?)\s*%/):text.match(/(?:[A-Z]{3}\s*)?[$€£¥]?\s*(\d+(?:\.\d+)?)/);
   if(match){const n=Number(match[1]);if(Number.isFinite(n))return n;}
 }
 return null;
}
function dividendProseNumbers(value){
 // Restrict extraction to the actual visible G. Dividends section supplied by
 // report-archive; never scan general news, forecast or valuation percentages.
 const text=String(value||"").slice(0,2400);
 if(!text)return {yieldPercent:null,annual:null};
 const percent=text.match(/(?:dividend\s+yield|indicated\s+yield|annualis(?:ed)?\s+yield|annualiz(?:ed)?\s+yield|yield\s+at|yield\s+of|implies?|implying|or about)\b[^%]{0,95}?(\d{1,2}(?:\.\d{1,5})?)\s*%/i)||
   text.match(/(\d{1,2}(?:\.\d{1,5})?)\s*%\s*(?:cash\s+|annuali[sz]ed\s+|indicated\s+|dividend\s+)?dividend\s+yield\b/i);
 const annualText=text.match(/\bannual(?:iz|is)ed\b[^\n$]{0,110}[$€£]\s*(\d+(?:\.\d{1,5})?)\b/i)||
   text.match(/[$€£]\s*(\d+(?:\.\d{1,5})?)\s*\/\s*year\b/i)||
   text.match(/\bannual\s+(?:cash\s+)?dividend\b[^\n$]{0,80}[$€£]\s*(\d+(?:\.\d{1,5})?)\b/i);
 return {yieldPercent:percent?Number(percent[1]):null,
   annual:annualText?Number(annualText[1]):null};
}
export function extractReportDividend({snapshot,fields,currency,statusOnly=false,dividendText=""}){
 const raw=snapshot?.dividend&&typeof snapshot.dividend==="object"&&!Array.isArray(snapshot.dividend)?snapshot.dividend:
  snapshot?.dividends&&typeof snapshot.dividends==="object"&&!Array.isArray(snapshot.dividends)?snapshot.dividends:null;
 let yieldPercent=firstNumber(raw,yieldKeys);
 let annual=firstNumber(raw,annualKeys);
 const status=String(raw?.status||"").toUpperCase();
 const fromSnapshot=yieldPercent!==null||annual!==null||["NONE","PAYS","UNKNOWN"].includes(status);
 let fromText=false;
 if(!statusOnly&&status!=="NONE"){
   // Supplement missing fields, retaining already-sourced snapshot values.
   if(yieldPercent===null){
     const n=labelledNumber(fields,/(?:^|\b)(?:annuali[sz]ed\s+)?(?:dividend\s+)?yield\b/i,true);
     if(n!==null){yieldPercent=n;fromText=true;}
   }
   if(annual===null){
     const n=labelledNumber(fields,/(?:annuali[sz]ed|annual|per year).*(?:dividend|cash|amount|share)|(?:dividend|cash).*(?:annuali[sz]ed|annual)|^annualized$|^annualised$|^annualised at/i,false);
     if(n!==null){annual=n;fromText=true;}
   }
   if(yieldPercent===null||annual===null){
     const prose=dividendProseNumbers(dividendText);
     if(yieldPercent===null&&prose.yieldPercent!==null){yieldPercent=prose.yieldPercent;fromText=true;}
     if(annual===null&&prose.annual!==null){annual=prose.annual;fromText=true;}
   }
 }
 if(yieldPercent!==null&&(yieldPercent<0||yieldPercent>100))yieldPercent=null;
 if(annual!==null&&(annual<0||annual>1e9))annual=null;
 const explicitNone=status==="NONE"||status==="DOES_NOT_PAY"||
   (yieldPercent===0&&(annual===0||raw?.cash_dividend_per_share_usd===0));
 const resultStatus=explicitNone?"NONE":statusOnly?"UNKNOWN":
   (yieldPercent!==null||annual!==null)?"PAYS":"UNKNOWN";
 const ex=raw&&dateKeys.ex.map(k=>dateOrNull(raw[k])).find(Boolean)||null;
 const payment=raw&&dateKeys.payment.map(k=>dateOrNull(raw[k])).find(Boolean)||null;
 const source=fromSnapshot&&fromText?"REPORT_MIXED":fromSnapshot?"REPORT_SNAPSHOT":fromText?"REPORT_TEXT":"UNVERIFIED";
 return {dividendStatus:resultStatus,dividendYieldPercent:resultStatus==="UNKNOWN"?null:yieldPercent,
  dividendAnnualPerShare:resultStatus==="UNKNOWN"?null:annual,
  dividendCurrency:typeof raw?.currency==="string"&&/^[A-Z]{3}$/.test(raw.currency)?raw.currency:
   /^[A-Z]{3}$/.test(currency||"")?currency:null,
  dividendFrequency:typeof raw?.frequency==="string"&&raw.frequency.length<40?raw.frequency:null,
  dividendExDate:ex,dividendPaymentDate:payment,
  dividendAsOf:dateOrNull(raw?.as_of||raw?.as_of_date||raw?.reference_date||null),
  dividendYieldBasis:typeof raw?.yield_basis==="string"&&raw.yield_basis.length<45?raw.yield_basis:null,
  dividendSourceUrl:validUrl(raw?.source_url),dividendDataSource:source};
}
