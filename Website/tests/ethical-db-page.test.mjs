import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const here=new URL("../",import.meta.url);
const read=path=>fs.readFileSync(new URL(path,here),"utf8");
const data=JSON.parse(read("data/rizqinvests-ethical-bds-2026-11.json"));
const html=read("ethical-database/index.html");
const js=read("assets/ethical-db.js");
const css=read("assets/ethical-db.css");
const build=read("build.mjs");

test("self-contained ethical directory page publishes all 491 records from local JSON",()=>{
  assert.equal(data.rows.length,491);
  assert.equal(new Set(data.rows.map(x=>x.ticker)).size,491);
  assert.match(html,/ethical-db\.js/);
  assert.match(html,/ethical-db\.css/);
  assert.match(js,/fetch\("\/data\/rizqinvests-ethical-bds-2026-11\.json"/);
  assert.match(build,/ethicalPage=path\.join\(output,"ethical-database"\)/);
  assert.match(build,/rizqinvests-ethical-bds-2026-11\.json/);
  assert.match(build,/ethical-db\.css","ethical-db\.js/);
});

test("last column has a clickable circled i for each distinct ticker URL",()=>{
  assert.match(html,/<th scope="col">Original source<\/th>/);
  assert.match(js,/const src=cell\(tr,""\)/);
  assert.match(js,/link\.href="https:\/\/www\.rizqinvests\.com\/halal\/stock\/"\+encodeURIComponent\(r\.ticker\)\+"\?view=both"/);
  assert.match(js,/info\.className="info-circle"/);
  assert.match(js,/link\.append\(info,text\)/);
  assert.match(js,/link\.target="_blank"/);
  assert.match(js,/link\.rel="noopener noreferrer"/);
  assert.match(css,/\.info-circle\{display:inline-flex/);
  for(const ticker of ["ZTS","CFG","EEM"]){
    const entry=data.rows.find(x=>x.ticker===ticker);
    assert(entry);
    assert.equal(entry.source_url,"https://www.rizqinvests.com/halal/stock/"+encodeURIComponent(ticker)+"?view=both");
  }
});

test("ethics/BDS classifications remain independent and fixed to November 2026",()=>{
  assert.equal(data.source_kind,"user_supplied_snapshot");
  assert.equal(data.source_period,"2026-11");
  assert.equal(data.rows.filter(x=>x.ethical_label==="Neutral").length,431);
  assert.equal(data.rows.filter(x=>x.ethical_label==="Unethical").length,60);
  assert.equal(data.rows.filter(x=>x.bds_badge).length,40);
  assert.match(js,/r\.bds_badge\?"BDS badge":"Not shown"/);
  assert(!js.includes("api.rizqinvests.com"));
});
