import test from "node:test";
import assert from "node:assert/strict";
import { cleanQuote } from "../worker/international-quote-ingest.js";
const now=Date.parse("2026-11-21T09:30:00Z");
const quote={price:5578,currency:"JPY",exchange:"TSE",sourceSymbol:"6301.T",
  asOf:"2026-11-20T06:30:00Z",feed:"YFINANCE_YAHOO_5M_BAR_DELAYED",
  previousClose:5732,
  hourly:{feed:"YFINANCE_YAHOO_1H_BAR_DELAYED",interval:"1h",
    sourceSymbol:"6301.T",exchange:"TSE",currency:"JPY",
    bars:[[Math.floor(Date.parse("2026-11-19T01:00:00Z")/1000),5715],
          [Math.floor(Date.parse("2026-11-20T01:00:00Z")/1000),5578]]}};
test("Tokyo 6301.T quote and actual hourly history are accepted intact",()=>{
  const actual=cleanQuote("6301.T",quote,now);
  assert.equal(actual?.price,5578);
  assert.equal(actual?.sourceSymbol,"6301.T");
  assert.equal(actual?.exchange,"TSE");
  assert.equal(actual?.currency,"JPY");
  assert.equal(actual?.hourly?.bars?.length,2);
});
test("one-letter Yahoo suffix remains restricted to verified Tokyo JPY exchange",()=>{
  for(const update of [
    {exchange:"XSTO"},{exchange:"TSX"},{currency:"CAD"},
    {sourceSymbol:"6302.T"},{sourceSymbol:"6301.VI"}]){
    assert.equal(cleanQuote("6301.T",{...quote,...update},now),null,
      "Rejected mismatched Tokyo identity "+JSON.stringify(update));
  }
  assert.equal(cleanQuote("6301.X",{...quote,sourceSymbol:"6301.X"},now),null);
  assert.equal(cleanQuote("6301.T",{...quote,asOf:"2026-10-01T00:00:00Z"},now),null);
});
