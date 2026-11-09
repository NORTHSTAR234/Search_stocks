import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const data=JSON.parse(readFileSync(new URL("../eodhd-candidates.json",import.meta.url),"utf8"));
test("EODHD candidate catalogue has 11 exact international tickers and no US replacements",()=>{
 assert.equal(data.status,"API_VERIFIED_10_OF_11_2026_11_09");
 assert.equal(data.instruments.length,11);
 assert.deepEqual([...new Set(data.instruments.map(x=>x.ticker))].length,11);
 assert.equal(data.instruments.filter(x=>x.exchange==="TWSE").length,8);
 assert.equal(data.instruments.filter(x=>x.exchange==="ASX").length,2);
 assert.equal(data.instruments.filter(x=>x.exchange==="BURSA").length,1);
 assert.equal(data.instruments.filter(x=>x.feedEnabled).length,10);
 assert.equal(data.instruments.filter(x=>!x.feedEnabled).length,1);
 assert.equal(data.instruments.find(x=>x.ticker==="CBHB").quoteValidation,"NO_USABLE_PRICE_2026_11_09");
 assert(data.instruments.filter(x=>x.feedEnabled).every(x=>x.quoteValidation==="VALID_DELAYED_PRICE_2026_11_09"));
 assert(data.instruments.every(x=>/^https:\/\/eodhd\.com\/financial-summary\/[A-Z0-9.-]+$/.test(x.catalogueUrl)));
});
test("EODHD local-market symbol remapping never substitutes a US ADR",()=>{
 const m=Object.fromEntries(data.instruments.map(x=>[x.ticker,x.eodhd]));
 assert.equal(m.ORG,"ORG.AU");
 assert.equal(m["APA.AX"],"APA.AU");
 assert.equal(m.CBHB,"0339.KLSE");
 for(const t of ["1519.TW","2330.TW","2377.TW","2379.TW","2383.TW","2449.TW","2454.TW","3034.TW"])assert.equal(m[t],t);
 assert(!Object.values(m).some(s=>s.endsWith(".US")));
});
