import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const config=JSON.parse(readFileSync(new URL("../worker/intraday.wrangler.jsonc",import.meta.url),"utf8"));
test("Separate intraday Worker stays private, preview-disabled and research-inactive",()=>{
 assert.equal(config.workers_dev,false);
 assert.equal(config.preview_urls,false);
 assert.equal(config.vars.INTRADAY_RESEARCH_ENABLED,"disabled");
 assert.equal(config.main,"./intraday-research-provider.mjs");
 assert.match(config.name,/intraday/);
 assert.doesNotMatch(JSON.stringify(config),/ALPACA_API_(?:KEY_ID|SECRET_KEY)|ALPACA_SECRET_KEY/);
});
