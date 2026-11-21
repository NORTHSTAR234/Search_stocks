import test from "node:test";
import assert from "node:assert/strict";
import {
  onRequestGet,onRequestPost,validTicker,validState,validVersion,
  readRowPreferences,setRowPreference
} from "../functions/api/row-preferences.js";

function mockD1(){
  const records=new Map();
  const prepare=sql=>({bind:(...args)=>({
    async first(){
      if(sql.startsWith("INSERT")){
        const [ticker,state]=args;
        if(records.has(ticker))return null;
        const r={ticker,state,version:1};records.set(ticker,r);return {...r};
      }
      if(sql.startsWith("UPDATE")){
        const [state,ticker,version]=args,r=records.get(ticker);
        if(!r||r.version!==version)return null;
        const changed={ticker,state,version:r.version+1};records.set(ticker,changed);return {...changed};
      }
      if(sql.startsWith("SELECT"))return records.get(args[0])||null;
      throw Error("Unexpected SQL");
    },
    async all(){
      if(!sql.startsWith("SELECT"))throw Error("Unexpected SQL");
      return {success:true,results:[...records.values()].sort((a,b)=>a.ticker.localeCompare(b.ticker))};
    }
  }),all:async()=>{
    if(!sql.startsWith("SELECT"))throw Error("Unexpected SQL");
    return {success:true,results:[...records.values()].sort((a,b)=>a.ticker.localeCompare(b.ticker))};
  }});
  return {prepare,records};
}
test("row-preferences API denies anonymous reads and writes even if database is bound",async()=>{
  const env={ROW_PREFERENCES_DB:mockD1(),ACCESS_TEAM_DOMAIN:"test.cloudflareaccess.com",ACCESS_AUD:"aud",OWNER_EMAIL:"owner@example.com"};
  const base="https://owner.example/api/row-preferences";
  const read=await onRequestGet({request:new Request(base),env});
  assert.equal(read.status,403);
  const post=await onRequestPost({request:new Request(base,{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({ticker:"2330.TWSE",state:"favourite",version:0})}),env});
  assert.equal(post.status,403);
  assert.equal(env.ROW_PREFERENCES_DB.records.size,0);
});
test("versioned stock preference writes preserve separate ticker updates and normal tombstones",async()=>{
  const db=mockD1();
  assert.equal((await setRowPreference(db,{ticker:"2330.TWSE",state:"favourite",version:0})).body.record.version,1);
  assert.equal((await setRowPreference(db,{ticker:"AAPL",state:"minimized",version:0})).status,200);
  const conflict=await setRowPreference(db,{ticker:"2330.TWSE",state:"normal",version:0});
  assert.equal(conflict.status,409);
  assert.equal(conflict.body.record.state,"favourite");
  const good=await setRowPreference(db,{ticker:"2330.TWSE",state:"normal",version:1});
  assert.equal(good.status,200);
  assert.equal(good.body.record.version,2);
  assert.equal((await setRowPreference(db,{ticker:"2330.TWSE",state:"favourite",version:1})).status,409);
  const rows=await readRowPreferences(db);
  assert.deepEqual(rows.map(r=>[r.ticker,r.state,r.version]),[
    ["2330.TWSE","normal",2],["AAPL","minimized",1]
  ]);
});
test("ticker, state and version validation fails closed",async()=>{
  const db=mockD1();
  for(const ticker of ["","../../secret","A B","aapl","<script>","N".repeat(31)])assert(!validTicker(ticker));
  for(const ticker of ["AAPL","2330.TWSE","SU.PA","000660.KRX"])assert(validTicker(ticker));
  for(const state of ["other","star","X",null])assert(!validState(state));
  for(const state of ["normal","favourite","minimized"])assert(validState(state));
  for(const version of [-1,1.2,"0",NaN,Infinity])assert(!validVersion(version));
  for(const request of [
    {ticker:"../../secret",state:"favourite",version:0},
    {ticker:"NVDA",state:"favourite",version:NaN},
    {ticker:"NVDA",state:"X",version:0}
  ])assert.equal((await setRowPreference(db,request)).status,400);
  assert.equal((await readRowPreferences(db)).length,0);
});
