// Regression: old Epiroc A/B full research archives use uncommon Unicode
// symbols. The owner viewer must show font-independent, accessible reason
// markers without rewriting the archived source or affecting other tickers.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {archiveInfo,safeHtmlDocument} from "../lib/report-archive.mjs";

const root=fileURLToPath(new URL("../../",import.meta.url));

for(const item of [
  {path:"halal/EPI-A.STO/EPI-A.STO_2026-11-20_20-03-34Z.html",count:4},
  {path:"nonhalal/EPI-B.STO/EPI-B.STO_2026-11-20_20-02-35Z.html",count:3}
]){
  test(item.path+" shows every reason marker in the owner viewer",()=>{
    const source=readFileSync(path.join(root,item.path),"utf8");
    const info=archiveInfo(item.path);
    assert(info,"valid archive path");
    assert.equal((source.match(/<span class="ico" aria-hidden="true">/g)||[]).length,item.count,
      "the archival source retains its original Unicode symbols");
    const rendered=safeHtmlDocument(info,source);
    assert.match(rendered,/<style id="report-reason-marker-fallback">/,
      "responsive high-contrast marker styling is added in viewer only");
    assert.equal((rendered.match(/class="ico report-reason-marker"/g)||[]).length,item.count);
    for(let i=1;i<=item.count;i++)
      assert(rendered.includes('role="img" aria-label="Reason '+i+'">'+i+'</span>'),
        "literal visible numeric marker "+i+" must survive without glyph fonts or CSS");
    assert.match(rendered,/Why the price moved/i);
    assert.match(rendered,/CONFIRMED FACT|CONFIRMED figures/i);
    assert.doesNotMatch(rendered,/<script\b/i,"snapshot script is still stripped for CSP");
    assert(!source.includes("report-reason-marker-fallback"),"original HTML was not changed");
  });
}

test("unrelated archived reports are not modified by Epiroc fallback",()=>{
  const p="halal/DEMO/DEMO_2026-11-20_12-00-00Z.html";
  const source='<html><head></head><body><section><div class="reason">'
    +'<span class="ico">◆</span><div>Reason</div></div></section></body></html>';
  const rendered=safeHtmlDocument(archiveInfo(p),source);
  assert(rendered.includes('<span class="ico">◆</span>'));
  assert(!rendered.includes("report-reason-marker-fallback"));
});
