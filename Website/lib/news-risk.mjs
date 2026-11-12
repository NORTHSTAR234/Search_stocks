// Research-only headline triage. An event is a *reported risk headline*,
// NOT evidence that the reported event actually happened. No LLM inference.
const MAX_ARTICLES=100;
const riskPatterns=[
  {code:"LEADERSHIP_DISRUPTION",pattern:/\b(?:ceo|chief executive|chief financial officer|cfo|board)\b.{0,100}\b(?:oust(?:er|ed)?|remov(?:e|al|ing)|replac(?:e|ement|ing)|resign(?:ation|ed|s)?|fired|step(?:s|ping)? down|succession|investigation|probe)\b/i},
  {code:"LEADERSHIP_DISRUPTION",pattern:/\b(?:oust(?:er|ed)?|remov(?:e|al|ing)|replac(?:e|ement|ing)|resign(?:ation|ed|s)?|fired|investigation|probe)\b.{0,100}\b(?:ceo|chief executive|cfo|board)\b/i},
  {code:"REGULATORY_SHOCK",pattern:/\b(?:sec|doj|fbi|regulator|antitrust|sanction|export control)\b.{0,85}\b(?:probe|investigat|ban|restriction|charge|lawsuit|fine|raid|action)\w*/i},
  {code:"FINANCIAL_INTEGRITY",pattern:/\b(?:accounting fraud|financial restatement|restat(?:e|ed|ement)\s+(?:earnings|financial)|material weakness|chapter 11|files for bankruptcy)\b/i},
  {code:"GUIDANCE_SHOCK",pattern:/\b(?:slashes|withdraws|cuts)\b.{0,45}\b(?:earnings guidance|revenue outlook|profit forecast)\b/i}
];
const disclaimer=/\b(?:denies|denied|debunked|false rumor|hoax|unfounded|not considering|not planning|refutes)\b/i;
const safeHttps=s=>{
  try{const u=new URL(s);return u.protocol==="https:"&&!u.username&&!u.password&&u.hostname.includes(".")&&s.length<=1800;}
  catch{return false;}
};
export function classifyNewsRisk(article,ticker,asOf){
  const now=Date.parse(asOf),observed=Date.parse(article?.created_at);
  const symbols=article?.symbols;
  if(!Number.isFinite(now)||!Number.isFinite(observed)||observed>now||
     now-observed>48*3600000||!Array.isArray(symbols)||
     !symbols.includes(ticker)||!safeHttps(article?.url))return null;
  const headline=String(article.headline||"").slice(0,500);
  if(!headline||disclaimer.test(headline))return null;
  const risk=riskPatterns.find(x=>x.pattern.test(headline));
  if(!risk)return null;
  return {publishedAt:new Date(observed).toISOString(),direction:"negative",
    severity:"material",verification:"reported",sourceUrl:article.url,
    riskCode:risk.code,headline,provider:String(article.source||"unknown").slice(0,80),
    caveat:"Headline triage only; event not independently confirmed",
    sourceTimestampField:"created_at"};
}
export function summarizeNewsRisk(news,ticker,asOf){
  if(!/^[A-Z][A-Z0-9.-]{0,11}$/.test(ticker)||!Array.isArray(news))
    return {events:[],coverage:"UNVERIFIED"};
  const events=[],seen=new Set();
  for(const article of news.slice(0,MAX_ARTICLES)){
    const ev=classifyNewsRisk(article,ticker,asOf);
    if(!ev)continue;
    const key=String(article?.id??article?.url);
    if(seen.has(key))continue;
    seen.add(key);events.push(ev);
  }
  events.sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt));
  return {events:events.slice(0,12),coverage:"PROVIDER_NEWS_SAMPLED",
    caveat:"No articles found is not proof that no material event occurred; provider may be delayed, partial or incomplete."};
}
