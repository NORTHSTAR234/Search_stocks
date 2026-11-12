import test from "node:test";
import assert from "node:assert/strict";
import {runIntradayCredentialProbe} from "../worker/intraday-readonly-probe.mjs";
const now=new Date("2026-11-12T06:35:00.000Z");
const secrets={ALPACA_API_KEY_ID:"test-id",ALPACA_SECRET_KEY:"test-secret"};
const response=x=>({ok:true,status:200,text:async()=>JSON.stringify(x)});
const mkBars=()=>[{t:"2026-11-11T20:55:00Z",o:100,h:101,l:99,c:100,v:1000,vw:100}];
const mkNews=()=>[{created_at:"2026-11-11T21:00:00Z",headline:"Market update",symbols:["NVDA"]}];
test("Probe checks only Alpaca GET bars and news, without trading calls",async()=>{
 const calls=[];
 const fetcher=async(uri,init)=>{
   const u=new URL(uri);calls.push({origin:u.origin,path:u.pathname,method:init.method,
     headers:init.headers});
   return u.pathname==="/v2/stocks/bars"?response({bars:{MU:mkBars()}}):
     response({news:mkNews()});
 };
 const x=await runIntradayCredentialProbe(secrets,fetcher,now);
 assert.equal(x.overall,"PASS");
 assert.equal(x.bars.items,1);
 assert.equal(x.news.items,1);
 assert.equal(calls.length,2);
 assert(calls.every(c=>c.origin==="https://data.alpaca.markets"&&c.method==="GET"));
 assert(calls.every(c=>!c.path.includes("/orders")));
 const safe=JSON.stringify(x);
 assert(!safe.includes("test-id")&&!safe.includes("test-secret"));
 assert(!safe.includes("Market update")&&!safe.includes('"o":100'));
 assert.equal(x.execution,"READ_ONLY_NO_ORDERS");
});
test("Missing credential creates zero external requests",async()=>{
 let n=0;const x=await runIntradayCredentialProbe(
  {ALPACA_API_KEY_ID:"test-id"},async()=>{n++;throw Error("call");},now);
 assert.equal(x.bars.code,"MISSING_SECRETS");
 assert.equal(x.news.code,"MISSING_SECRETS");
 assert.equal(n,0);
});
test("Authentication rejection is sanitized as a code, never log response bodies",async()=>{
 const x=await runIntradayCredentialProbe(secrets,async()=>({
   ok:false,status:401,text:async()=>"TOP SECRET"
 }),now);
 assert.equal(x.overall,"INCOMPLETE");
 assert.equal(x.bars.code,"UPSTREAM_UNAUTHORIZED");
 assert.equal(x.news.code,"UPSTREAM_UNAUTHORIZED");
 assert(!JSON.stringify(x).includes("TOP SECRET"));
});
test("No bars, malformed news and future time cannot be successes",async()=>{
 const x=await runIntradayCredentialProbe(secrets,async uri=>
   uri.includes("/bars")?response({bars:{MU:[]}}):
     response({news:[{created_at:"2026-11-13T00:00:00Z"}]}),now);
 assert.equal(x.bars.code,"EMPTY_SAMPLE");
 assert.equal(x.news.code,"FUTURE_TIMESTAMP");
 assert.equal(x.overall,"INCOMPLETE");
});
test("Partial upstream failure doesn't stop independent other data source",async()=>{
 const x=await runIntradayCredentialProbe(secrets,async uri=>{
  if(uri.includes("/v2/stocks"))throw Error("connection dropped: sample-secret");
  return response({news:mkNews()});
 },now);
 assert.equal(x.bars.code,"FETCH_FAILED");
 assert.equal(x.news.code,"OK");
 assert.equal(x.overall,"INCOMPLETE");
 assert(!JSON.stringify(x).includes("sample-secret"));
});
