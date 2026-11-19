import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
const registry=JSON.parse(readFileSync(new URL("../data/shariah-user-reviews.json",import.meta.url),"utf8"));
const build=readFileSync(new URL("../scripts/build-live-reports.mjs",import.meta.url),"utf8");
const ui=readFileSync(new URL("../assets/app.js",import.meta.url),"utf8");
test("Korean owner-requested doubtful reviews are explicit and in nonhalal without pretending Musaffa found noncompliance",()=>{
  assert.equal(registry.schema_version,1);
  assert.equal(registry.provenance,"USER_REQUEST");
  assert.deepEqual(registry.rows.map(v=>v.ticker).sort(),["000660.KRX","005930.KRX"]);
  for(const item of registry.rows){
    assert.equal(item.bucket,"nonhalal");
    assert.equal(item.label,"DOUBTFUL");
    assert.match(item.reason,/inconclusive/i);
    assert(existsSync(new URL("../../nonhalal/"+item.ticker+"/",import.meta.url)),
      item.ticker+" must remain archived in nonhalal");
  }
});
test("doubtful badge is user-labelled amber only and keeps exact first-party Musaffa classifications independent",()=>{
  assert(build.includes('row.screeningReviewStatus="DOUBTFUL"'));
  assert(build.includes('row.screeningReviewSource="USER_REQUEST"'));
  assert(build.includes('row.musaffaAssessment==="INCONCLUSIVE"'));
  assert(build.includes('row.bucket==="nonhalal"'));
  assert(ui.includes('tone:"warn",label:"DOUBTFUL"'));
  assert(ui.includes('tone:"bad",label:"VERIFIED NON-COMPLIANT"'));
  assert(ui.includes('tone:"good",label:"VERIFIED HALAL"'));
  assert(!build.includes('row.musaffaClassification="DOUBTFUL"'));
});
