// One-shot authenticated Alpaca connectivity test for an OFFLINE, private Worker.
// Reads only IEX historical 5m candles and timestamped news. Never creates an order.
// Output has sanitized status/coverage metadata ONLY; no prices, raw headlines, auth values.
const API_ORIGIN="https://data.alpaca.markets";
const standard={ok:false,code:"NOT_RUN",items:0,firstTimestamp:null,lastTimestamp:null};
function iso(t){const n=Date.parse(t);return Number.isFinite(n)?new Date(n).toISOString():null;}
function safeCodes(status){return status===401?"UPSTREAM_UNAUTHORIZED":status===403?"UPSTREAM_FORBIDDEN":
  status===429?"UPSTREAM_RATE_LIMIT":status>=500?"UPSTREAM_SERVER_ERROR":"UPSTREAM_HTTP_ERROR";}
async function requestJson(path,query,env,fetcher){
  const url=new URL(API_ORIGIN+path);
  Object.entries(query).forEach(([k,v])=>url.searchParams.set(k,String(v)));
  const r=await fetcher(url.toString(),{
    method:"GET",
    headers:{"APCA-API-KEY-ID":env.ALPACA_API_KEY_ID,
      "APCA-API-SECRET-KEY":env.ALPACA_SECRET_KEY,Accept:"application/json"},
    signal:AbortSignal.timeout(12000)});
  if(!r.ok)return {ok:false,code:safeCodes(r.status)};
  const s=await r.text();
  if(s.length>180000) return {ok:false,code:"RESPONSE_LIMIT"};
  try{return {ok:true,data:JSON.parse(s)};}
  catch{return {ok:false,code:"BAD_JSON"};}
}
export async function runIntradayCredentialProbe(env,fetcher=fetch,at=new Date()){
  const now=at instanceof Date?at:new Date(at);
  const result={kind:"INTRADAY_READONLY_CREDENTIAL_SMOKE_V1",
    observedAt:now.toISOString(),execution:"READ_ONLY_NO_ORDERS",
    barFeed:"IEX",bars:{...standard},news:{...standard}};
  if(!env?.ALPACA_API_KEY_ID||!env?.ALPACA_SECRET_KEY){
    result.bars.code="MISSING_SECRETS";result.news.code="MISSING_SECRETS";
    return result;
  }
  const end=now.toISOString();
  const barQuery={symbols:"MU",timeframe:"5Min",feed:"iex",sort:"desc",limit:50,
    adjustment:"raw",start:new Date(now.getTime()-5*86400000).toISOString(),end};
  const newsQuery={symbols:"NVDA",sort:"desc",limit:10,
    start:new Date(now.getTime()-48*3600000).toISOString(),end};
  const fetchOne=async(path,q,which)=>{
    try{
      const rsp=await requestJson(path,q,env,fetcher);
      if(!rsp.ok)return {...standard,code:rsp.code};
      const rows=which==="bars"?rsp.data?.bars?.MU:rsp.data?.news;
      if(!Array.isArray(rows))return {...standard,code:"SCHEMA_MISMATCH"};
      if(rows.length>50&&which==="bars"||rows.length>10&&which==="news")
        return {...standard,code:"UNEXPECTED_ROW_COUNT"};
      const dates=rows.map(x=>which==="bars"?iso(x.t):iso(x.created_at)).filter(Boolean).sort();
      if(rows.length>0&&dates.length!==rows.length)
        return {...standard,code:"INVALID_TIMESTAMPS"};
      if(dates.some(d=>Date.parse(d)>now.getTime()))
        return {...standard,code:"FUTURE_TIMESTAMP"};
      return {ok:rows.length>0,code:rows.length?"OK":"EMPTY_SAMPLE",
        items:rows.length,firstTimestamp:dates[0]||null,lastTimestamp:dates.at(-1)||null,
        hasMore:Boolean(rsp.data?.next_page_token)};
    }catch{return {...standard,code:"FETCH_FAILED"};}
  };
  [result.bars,result.news]=await Promise.all([
    fetchOne("/v2/stocks/bars",barQuery,"bars"),
    fetchOne("/v1beta1/news",newsQuery,"news")]);
  result.overall=result.bars.ok&&result.news.ok?"PASS":"INCOMPLETE";
  return result;
}
