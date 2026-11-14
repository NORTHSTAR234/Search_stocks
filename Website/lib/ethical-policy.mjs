// Final ethical decision only: preserve the independent archived provider findings.
// First: RizqInvests (Nov 2026). Red is decisive, including explicit BDS badge.
// Second: Investigate (Jul 2025) overturns a Rizq Neutral/Ethical label.
// Neither source is a live assessment or a substitute for Musaffa Shariah.
const RIZQ_RED=new Set(["BDS_LISTED","UNETHICAL"]);
const RIZQ_GREEN=new Set(["NEUTRAL","ETHICAL"]);
export function applyCombinedEthicalScreening(row){
 const rizq=String(row.ethicalStatus||"UNVERIFIED").toUpperCase();
 const matchedRizq=row.ethicalSourceKind==="USER_SNAPSHOT"&&
  /^https:\/\/www\.rizqinvests\.com\/halal\/stock\//.test(String(row.ethicalSourceUrl||""));
 const status=matchedRizq?rizq:"UNVERIFIED";
 const matchedInvestigate=row.investigateListed===true&&row.investigateSourceKind==="USER_SNAPSHOT";
 const flags=Array.isArray(row.investigateCategories)?row.investigateCategories:[];
 const original=matchedRizq?row.ethicalProviderLabel:null;
 // Never overwrite the original source's ethicalStatus or BDS flag.
 const base={...row,ethicalFinalStatus:"UNVERIFIED",ethicalFinalSource:"NONE",
   ethicalFinalSourceUrl:null,ethicalFinalReason:"No matching archived ethical record",
   ethicalFinalBdsListed:false,ethicalFinalColor:"NONE",
   ethicalRizqOriginalLabel:original};
 if(RIZQ_RED.has(status)){
  const bds=status==="BDS_LISTED"||row.ethicalBdsListed===true;
  return {...base,ethicalFinalStatus:bds?"BDS_LISTED":"UNETHICAL",
   ethicalFinalSource:"RIZQINVESTS",ethicalFinalSourceUrl:row.ethicalSourceUrl,
   ethicalFinalBdsListed:bds,ethicalFinalColor:"RED",
   ethicalFinalReason:bds?"RizqInvests Nov 2026 snapshot explicitly shows BDS badge.":
     "RizqInvests Nov 2026 snapshot explicitly says Unethical."};
 }
 if(matchedInvestigate){
  const providerNote=RIZQ_GREEN.has(status)?
    "RizqInvests Nov 2026 says "+(original||status)+" but Investigate also lists this issuer.":
    "RizqInvests exact-match status is unavailable; Investigate lists this issuer.";
  return {...base,ethicalFinalStatus:"UNETHICAL",
   ethicalFinalSource:"INVESTIGATE",
   ethicalFinalSourceUrl:row.investigateSourceUrl||null,
   ethicalFinalColor:"RED",ethicalFinalBdsListed:false,
   ethicalFinalReason:providerNote+" Investigate July 2025 source categories: "+flags.join(", ")+
     ". Historical source concern, not independently established wrongdoing or an official BDS listing."};
 }
 if(RIZQ_GREEN.has(status)){
  return {...base,ethicalFinalStatus:status,ethicalFinalSource:"RIZQINVESTS",
   ethicalFinalSourceUrl:row.ethicalSourceUrl,ethicalFinalColor:"GREEN",
   ethicalFinalReason:"RizqInvests Nov 2026 says "+(original||status)+
     "; no exact issuer listing in the uploaded Investigate July 2025 dataset. Not universal ethical clearance."};
 }
 return base;
}
