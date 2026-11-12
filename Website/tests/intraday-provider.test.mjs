import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
import {summarizeNewsRisk} from "../lib/news-risk.mjs";

const original=readFileSync(new URL("../worker/intraday-research-provider.mjs",import.meta.url),"utf8");
function loadProvider({fetcher,engine}){
  const source=original
    .replace(/^import\s+.*?;\s*$/gm,"")
    .replace("export class IntradayResearchProvider","class IntradayResearchProvider")
    .replace(/export default \{[\s\S]*$/,"");
  const context={WorkerEntrypoint:class {},fetch:fetcher,AbortSignal,URL,Response,Date,Intl,
    summarizeNewsRisk,evaluateIntradaySignal:engine};
  vm.createContext(context);
  const ctor=vm.runInContext(source+"\nIntradayResearchProvider;",context);
  return ctor;
}
const engine=({ticker,events=[]})=>({
  ticker,signal:events.length?"RISK_ALERT":"BUY_CANDIDATE",
  validated:false,execution:"RESEARCH_ONLY_NOT_EXECUTABLE",
  reasonCodes:events.length?["RECENT_MATERIAL_NEGATIVE_NEWS"]:["MOCK_BUY"],
  triggerPrice:100,invalidationPrice:99
});
const goodEnv={INTRADAY_RESEARCH_ENABLED:"read_only",
  ALPACA_API_KEY_ID:"test-only",ALPACA_SECRET_KEY:"test-only"};
const ok=body=>({ok:true,status:200,text:async()=>JSON.stringify(body)});
test("Worker has a private named entrypoint and denies default public HTTP",()=>{
  assert.match(original,/export class IntradayResearchProvider extends WorkerEntrypoint/);
  assert.match(original,/fetch\(\)\{return new Response\("Not found",\{status:404\}\);\}/);
  assert.doesNotMatch(original,/\/v2\/orders|submitOrder|placeOrder/);
  assert.match(original,/env\.ALPACA_SECRET_KEY/);
  assert.doesNotMatch(original,/env\.ALPACA_API_SECRET_KEY/);
});
test("RPC flags disabled means no credentials or upstream call used",async()=>{
  let n=0;
  const C=loadProvider({fetcher:async()=>{n++;throw Error("should never call");},engine});
  const p=new C();p.env={};
  assert.equal((await p.snapshot(["MU"])).status,"NOT_ACTIVE");
  assert.equal(n,0);
});
test("Rejects non-whitelisted symbols without contacting upstream",async()=>{
  let n=0;
  const C=loadProvider({fetcher:async()=>{n++;throw Error("bad");},engine});
  const p=new C();p.env=goodEnv;
  assert.equal((await p.snapshot(["TSLA"])).status,"INVALID_SYMBOLS");
  assert.equal((await p.snapshot(["MU","MU"])).status,"INVALID_SYMBOLS");
  assert.equal(n,0);
});
test("Missing secrets or upstream outage returns DATA_UNAVAILABLE, never BUY",async()=>{
  const C=loadProvider({fetcher:async()=>{throw Error("outage");},engine});
  const p=new C();p.env=goodEnv;
  const x=await p.snapshot(["MU"]);
  assert.equal(x.status,"DATA_UNAVAILABLE");
  assert.equal(x.signals.length,0);
});
test("A timestamped reported governance headline overrides a mocked buy",async()=>{
  let requested=[];
  const article={id:1,created_at:new Date(Date.now()-3600000).toISOString(),
    headline:"NVIDIA Board Reportedly Considering CEO Removal",
    url:"https://example.org/news",symbols:["NVDA"],source:"sample-provider"};
  const fetcher=async uri=>{
    const u=new URL(uri);requested.push(u.pathname);
    if(u.pathname==="/v2/stocks/bars")return ok({bars:{NVDA:[],SOXX:[],QQQ:[]},next_page_token:null});
    return ok({news:[article],next_page_token:null});
  };
  const C=loadProvider({fetcher,engine});
  const p=new C();p.env=goodEnv;
  const x=await p.snapshot(["NVDA"]);
  assert.equal(x.status,"RESEARCH_ONLY");
  assert.equal(x.execution,"RESEARCH_ONLY_NOT_EXECUTABLE");
  assert.equal(x.validated,false);
  assert.equal(x.signals[0].assessment.signal,"RISK_ALERT");
  assert.equal(x.signals[0].riskHeadlines[0].verification,"reported");
  assert(requested.includes("/v2/stocks/bars"));
  assert(requested.includes("/v1beta1/news"));
});
test("Unfinished news pagination suppresses bullish candidate",async()=>{
  const fetcher=async uri=>{
    const u=new URL(uri);
    if(u.pathname==="/v2/stocks/bars")return ok({bars:{MU:[],SOXX:[],QQQ:[]}});
    return ok({news:[],next_page_token:"CONTINUE"});
  };
  const C=loadProvider({fetcher,engine});
  const p=new C();p.env=goodEnv;
  const x=await p.snapshot(["MU"]);
  assert.equal(x.status,"RESEARCH_ONLY");
  assert.equal(x.signals[0].newsCoverage,"PARTIAL");
  assert.equal(x.signals[0].assessment.signal,"NO_DATA");
  assert.equal(x.signals[0].assessment.triggerPrice,null);
});

test("Attributable risk headline remains visible when Alpaca candle endpoint fails",async()=>{
 const article={id:9,created_at:new Date(Date.now()-600000).toISOString(),
   headline:"NVIDIA Board Initiates Independent Investigation into CEO Jensen Huang",
   url:"https://example.org/board/statement",symbols:["NVDA"],source:"test-news"};
 const C=loadProvider({fetcher:async uri=>{
   if(new URL(uri).pathname==="/v2/stocks/bars")throw Error("bar outage");
   return ok({news:[article],next_page_token:null});
 },engine});
 const p=new C();p.env=goodEnv;
 const r=await p.snapshot(["NVDA"]);
 assert.equal(r.status,"RESEARCH_ONLY");
 assert.equal(r.sourceStatus,"NEWS_ONLY_BAR_FEED_UNAVAILABLE");
 assert.equal(r.signals[0].assessment.signal,"RISK_ALERT");
 assert.equal(r.signals[0].marketData.barsAvailable,false);
 assert.equal(r.signals[0].marketData.observationAsOf,null);
 assert.equal(r.signals[0].assessment.execution,"RESEARCH_ONLY_NOT_EXECUTABLE");
});
test("No price bars and zero detectable risk cannot create a BUY",async()=>{
 const C=loadProvider({fetcher:async uri=>{
   if(new URL(uri).pathname==="/v2/stocks/bars")throw Error("bar outage");
   return ok({news:[],next_page_token:null});
 },engine});
 const p=new C();p.env=goodEnv;
 const r=await p.snapshot(["MU"]);
 assert.equal(r.status,"RESEARCH_ONLY");
 assert.equal(r.signals[0].assessment.signal,"NO_DATA");
 assert(r.signals[0].assessment.reasonCodes.includes("BARS_UNAVAILABLE"));
 assert.equal(r.signals[0].marketData.barsAvailable,false);
});
