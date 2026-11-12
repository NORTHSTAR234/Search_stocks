import test from "node:test";
import assert from "node:assert/strict";
import {classifyNewsRisk,summarizeNewsRisk} from "../lib/news-risk.mjs";

const at="2026-11-12T04:00:00Z";
const base={id:101,created_at:"2026-11-12T00:01:45Z",
  headline:"NVIDIA Board Reportedly Considering CEO Removal Amid Leadership Scandal",
  symbols:["NVDA"],url:"https://example.org/news/1",source:"news-feed"};
test("Material CEO removal reporting produces a REPORTED event, not a confirmed fact",()=>{
  const e=classifyNewsRisk(base,"NVDA",at);
  assert(e);
  assert.equal(e.riskCode,"LEADERSHIP_DISRUPTION");
  assert.equal(e.verification,"reported");
  assert.equal(e.sourceTimestampField,"created_at");
  assert.match(e.caveat,/not independently confirmed/);
});
test("Published-after-as-of headlines cannot be used in historical scenarios",()=>{
  assert.equal(classifyNewsRisk({...base,created_at:"2026-11-12T05:00:00Z"},"NVDA",at),null);
});
test("Timestamped ticker linkage is compulsory",()=>{
  assert.equal(classifyNewsRisk({...base,symbols:["AMD"]},"NVDA",at),null);
  assert.equal(classifyNewsRisk({...base,created_at:"not-a-date"},"NVDA",at),null);
});
test("Denials and speculative stories avoid automatic strong risk assertions",()=>{
  assert.equal(classifyNewsRisk({...base,headline:"Nvidia Board Denies CEO Removal Rumor"},"NVDA",at),null);
  assert.equal(classifyNewsRisk({...base,headline:"Stock analysts debate semiconductor valuation"},"NVDA",at),null);
});
test("Only safe attributable HTTPS URLs are accepted",()=>{
  assert.equal(classifyNewsRisk({...base,url:"http://example.org/news"},"NVDA",at),null);
  assert.equal(classifyNewsRisk({...base,url:"https://user:pass@example.org/news"},"NVDA",at),null);
  assert.equal(classifyNewsRisk({...base,url:"javascript:alert('x')"},"NVDA",at),null);
});
test("News classification distinguishes guidance, regulatory, financial integrity",()=>{
  assert.equal(classifyNewsRisk({...base,headline:"Company cuts revenue outlook amid warnings"},"NVDA",at)?.riskCode,"GUIDANCE_SHOCK");
  assert.equal(classifyNewsRisk({...base,headline:"SEC investigation into export controls"},"NVDA",at)?.riskCode,"REGULATORY_SHOCK");
  assert.equal(classifyNewsRisk({...base,headline:"Company announces financial restatement"},"NVDA",at)?.riskCode,"FINANCIAL_INTEGRITY");
});
test("Deduplicates by article id and does not claim full event coverage",()=>{
  const r=summarizeNewsRisk([base,base,{...base,id:102,url:"https://example.org/news/2"}],"NVDA",at);
  assert.equal(r.events.length,2);
  assert.equal(r.coverage,"PROVIDER_NEWS_SAMPLED");
  assert.match(r.caveat,/not proof/);
});
test("Historical risk event is ignored after 48 hours",()=>{
  assert.equal(classifyNewsRisk({...base,created_at:"2026-11-09T00:00:00Z"},"NVDA",at),null);
});
