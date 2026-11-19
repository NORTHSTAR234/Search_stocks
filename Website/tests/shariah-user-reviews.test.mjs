import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
const registry=JSON.parse(readFileSync(new URL("../data/shariah-user-reviews.json",import.meta.url),"utf8"));
const builder=readFileSync(new URL("../scripts/build-live-reports.mjs",import.meta.url),"utf8");
const app=readFileSync(new URL("../assets/app.js",import.meta.url),"utf8");
test("owner registry is OPEN-ENDED, no exact stock is hard-coded in the index or router",()=>{
 assert.equal(registry.schema_version,1);
 assert.equal(registry.provenance,"USER_REQUEST");
 for(const entry of registry.rows){
   assert.match(entry.ticker,/^[A-Z0-9]+(?:[.-][A-Z0-9]+)*$/);
   assert(["DOUBTFUL","NON_HALAL"].includes(entry.label));
   assert.equal(entry.bucket,"nonhalal");
   assert(existsSync(new URL("../../nonhalal/"+entry.ticker+"/",import.meta.url)));
 }
 assert(builder.includes('const validLabels=new Set(["DOUBTFUL","NON_HALAL"])'));
 assert(builder.includes('row.screeningReviewStatus=manualReview.label'));
 assert(builder.includes("manualReview.company.trim()"));
 assert(!builder.includes('row.musaffaAssessment==="INCONCLUSIVE"'));
 assert(app.includes("ownerFlagged||musaffaVisual(r).tone"));
});
test("owner label is separate from original Musaffa and financial recommendations",()=>{
 assert(app.includes('OWNER: NON-HALAL'));
 assert(app.includes('OWNER: DOUBTFUL'));
 assert(app.includes('Musaffa: '));
 assert(app.includes('r.screeningReviewSource==="USER_REQUEST"'));
 assert(!builder.includes('row.musaffaClassification="DOUBTFUL"'));
});

test("any exact owner-flagged stock is automatically cloned into nonhalal if newer source was in halal",()=>{
  const reconcile=readFileSync(new URL("../scripts/reconcile-owner-screening-reviews.mjs",import.meta.url),"utf8");
  const workflow=readFileSync(new URL("../../.github/workflows/publish-html-reports.yml",import.meta.url),"utf8");
  assert(reconcile.includes("latestArchive(reports)"));
  assert(reconcile.includes('if(info.bucket==="nonhalal")continue;'));
  assert(reconcile.includes('snap.owner_review={status:review.label,source:"USER_REQUEST"'));
  assert(reconcile.includes('fs.writeFileSync(dest,updated,{flag:"wx"})'));
  assert(reconcile.includes('requiredDepth.some(rx=>!rx.test(visible))'));
  assert(reconcile.includes('check.musaffaClassification!==parsed.musaffaClassification'));
  assert(workflow.includes("node Website/scripts/reconcile-owner-screening-reviews.mjs"));
  assert(workflow.includes("git add Website/live-reports.json nonhalal/"));
});
