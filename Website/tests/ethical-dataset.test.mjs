import test from "node:test";
import assert from "node:assert/strict";
import {loadEthicalDataset,applyEthicalDataset} from "../lib/ethical-dataset.mjs";
const registry=loadEthicalDataset();
const base=(ticker,company,exchange="NASDAQ")=>({ticker,company,exchange,
  ethicalStatus:"BDS_LISTED",ethicalSourceUrl:"https://www.rizqinvests.com/ethical"});

test("November 2026 dataset imports exactly 491 unique, user-supplied ticker rows",()=>{
  assert.equal(registry.byTicker.size,491);
  assert.equal(registry.data.counts.neutral,431);
  assert.equal(registry.data.counts.unethical,60);
  assert.equal(registry.data.counts.bds_badge,40);
});
test("MU is neutral with direct issuer-matched stock URL, not a live screen",()=>{
  const r=applyEthicalDataset(base("MU","Micron Technology, Inc."),registry);
  assert.equal(r.ethicalStatus,"NEUTRAL");
  assert.equal(r.ethicalBdsListed,false);
  assert.equal(r.ethicalSourceKind,"USER_SNAPSHOT");
  assert.equal(r.ethicalAssessmentDate,null);
  assert.equal(r.ethicalSourceUrl,"https://www.rizqinvests.com/halal/stock/MU?view=both");
});
test("Explicit BDS badge is distinct from unethical without BDS badge",()=>{
  const b=applyEthicalDataset(base("NVDA","NVIDIA Corporation"),registry);
  const u=applyEthicalDataset(base("AAPL","Apple Inc.","NASDAQ"),registry);
  assert.equal(b.ethicalStatus,"BDS_LISTED");
  assert.equal(b.ethicalBdsListed,true);
  assert.equal(u.ethicalStatus,"UNETHICAL");
  assert.equal(u.ethicalBdsListed,null);
});
test("Name/exchange collision and missing tickers never inherit old or outside classifications",()=>{
  for(const r of [base("MU","Some Other Issuer"),base("MU","Micron Technology, Inc.","ASX"),base("MISSING","Unknown", "NYSE")]){
    const x=applyEthicalDataset(r,registry);
    assert.equal(x.ethicalStatus,"UNVERIFIED");
    assert.equal(x.ethicalSourceUrl,null);
    assert.equal(x.ethicalBdsListed,null);
  }
});
test("Provider halal label is not mapped into AAOIFI fields",()=>{
  const r=applyEthicalDataset({...base("CFG","Citizens Financial Group, Inc.","NYSE"),status:"SHARIAH REVIEW REQUIRED"},registry);
  assert.equal(r.ethicalStatus,"NEUTRAL");
  assert.equal(r.status,"SHARIAH REVIEW REQUIRED");
  assert.equal(Object.hasOwn(r,"provider_halal_label"),false);
});
