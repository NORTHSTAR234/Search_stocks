// Pure validation of the optional private worker's research-only RPC reply.
// Does not confer any authority to place trades.
const allSignals=new Set(["RISK_ALERT","BUY_CANDIDATE","SELL_RISK","WAIT",
  "NO_DATA","MARKET_CLOSED","EXIT_RISK","TAKE_PROFIT_REVIEW"]);
export function validateIntradayResearchPayload(payload,tickers,now=Date.now()){
  if(!payload||typeof payload!=="object"||payload.status!=="RESEARCH_ONLY"||
     payload.validated!==false||payload.execution!=="RESEARCH_ONLY_NOT_EXECUTABLE"||
     payload.feed!=="IEX"||!Array.isArray(tickers)||!Array.isArray(payload.signals)||
     payload.signals.length!==tickers.length)return false;
  const asOf=Date.parse(payload.asOf);
  if(!Number.isFinite(asOf)||asOf>now+120000||now-asOf>300000)return false;
  const seen=new Set();
  for(const entry of payload.signals){
    if(!entry||!tickers.includes(entry.ticker)||seen.has(entry.ticker))return false;
    seen.add(entry.ticker);
    const a=entry.assessment;
    if(!a||!allSignals.has(a.signal)||a.validated!==false||
       a.execution!=="RESEARCH_ONLY_NOT_EXECUTABLE"||
       !Array.isArray(a.reasonCodes)||a.reasonCodes.length>12)return false;
    if(!entry.marketData||entry.marketData.feed!=="IEX"||
       !["PARTIAL","SAMPLED"].includes(entry.newsCoverage)||!Array.isArray(entry.riskHeadlines)||
       entry.riskHeadlines.length>5)return false;
  }
  return JSON.stringify(payload).length<=30000;
}
