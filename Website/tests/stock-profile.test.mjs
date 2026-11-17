import test from "node:test";
import assert from "node:assert/strict";
import {INDUSTRY_CATEGORIES,classifyArchivedReport,extractReportDividend,validIndustryCategory} from "../lib/stock-profile.mjs";
import {archiveInfo,parseHtmlReport} from "../lib/report-archive.mjs";
const stock=(ticker,company,snapshot={})=>classifyArchivedReport({ticker,company,snapshot,fields:new Map(),statusOnly:false});
test("Nine categories have unique spelling; construction remains with industrials",()=>{
 assert.equal(INDUSTRY_CATEGORIES.length,9);
 assert.equal(new Set(INDUSTRY_CATEGORIES).size,9);
 assert.equal(INDUSTRY_CATEGORIES[5],"Industrials, Construction & Transportation");
 assert.equal(validIndustryCategory("Real Estate"),"Real Estate");
 assert.equal(validIndustryCategory("Construction"),null);
});
test("Exact report-snapshot industry label takes priority; invalid classification never becomes valid",()=>{
 const r=stock("MU","Micron Technology, Inc.",{industry_category:"Consumer Discretionary",industry_detail:"Sample classification"});
 assert.equal(r.industryCategory,"Consumer Discretionary");
 assert.equal(r.industryCategorySource,"REPORT_SNAPSHOT");
 assert.equal(r.industryDetail,"Sample classification");
 const bad=stock("XYZ","Unknown",{industry_category:"Secret Category"});
 assert.equal(bad.industryCategory,null);
});
test("Archive issuer mapping classifies only matched historical issuers",()=>{
 const good=stock("HD","The Home Depot, Inc.");
 assert.equal(good.industryCategory,"Consumer Discretionary");
 assert.equal(good.industryCategorySource,"LEGACY_ISSUER_MAPPING");
 assert.equal(stock("NVDA","Some Other NVIDIA Company").industryCategory,null);
 assert.equal(stock("SU.PA","Schneider Electric SE").industryCategory,"Industrials, Construction & Transportation");
 assert.equal(stock("ORG.ASX","Origin Energy Limited").industryCategory,"Utilities");
});
test("Verified dividend yield and annual cash amount use snapshot keys and avoid false zeros",()=>{
 const r=extractReportDividend({snapshot:{dividend:{status:"PAYS",yield_percent:2.19,annual_dividend_per_share:2.12,currency:"USD",frequency:"Quarterly",next_payment_date:"2026-12-15"}},currency:"USD",fields:new Map()});
 assert.equal(r.dividendStatus,"PAYS");
 assert.equal(r.dividendYieldPercent,2.19);
 assert.equal(r.dividendAnnualPerShare,2.12);
 assert.equal(r.dividendPaymentDate,"2026-12-15");
 assert.equal(r.dividendDataSource,"REPORT_SNAPSHOT");
 const unknown=extractReportDividend({snapshot:{},currency:"USD",fields:new Map()});
 assert.equal(unknown.dividendStatus,"UNKNOWN");
 assert.equal(unknown.dividendYieldPercent,null);
});
test("Old report aliases yield percent and annualized dividend are read but not recomputed from live quotes",()=>{
 const r=extractReportDividend({snapshot:{dividend:{yield_pct:0.526,annual:3.48,quarterly:0.87}},currency:"USD",fields:new Map()});
 assert.equal(r.dividendYieldPercent,0.526);
 assert.equal(r.dividendAnnualPerShare,3.48);
 assert.equal(r.dividendYieldBasis,null);
 const none=extractReportDividend({snapshot:{dividend:{cash_dividend_per_share_usd:0,dividend_yield_pct:0}},currency:"USD",fields:new Map()});
 assert.equal(none.dividendStatus,"NONE");
 assert.equal(none.dividendYieldPercent,0);
});
test("Labeled HTML dividend rows are used only if no structured report data",()=>{
 const a=extractReportDividend({snapshot:{},currency:"AUD",fields:new Map([
  ["annualised yield at $25","3.41%"],["annualised dividend per share","A$0.82 / share"]
 ])});
 assert.equal(a.dividendStatus,"PAYS");
 assert.equal(a.dividendYieldPercent,3.41);
 assert.equal(a.dividendAnnualPerShare,0.82);
 assert.equal(a.dividendDataSource,"REPORT_TEXT");
});
test("Full HTML extractor reads standard fields without changing Aya v2 required contract",()=>{
 const info=archiveInfo("halal/PG/PG_2026-11-17_00-00-00Z.html");
 const obj={schema_version:2,ticker:"PG",canonical_archive_ticker:"PG",source_market_ticker:"PG",
  exchange:"NYSE",company:"The Procter & Gamble Company",currency:"USD",report_utc:"2026-11-17T00:00:00Z",report_type:"full",
  musaffa:{classification:"HALAL",grade:"A",screening_date:"2026-09-05",gate:"PASS"},
  actions:{new_position:"HOLD",existing_holder:"HOLD"},risk:"MODERATE",scores:{investment:70,entry:40},
  next_earnings:{date:null,confirmed:null},
  entry:{preferred_low:null,preferred_high:null,acceptable_low:null,acceptable_high:null,no_chase:null},
  targets:{stop:null,tp1:null,tp2:null},
  industry_category:"Consumer Essentials",industry_detail:"Household consumer staples",
  dividend:{status:"PAYS",yield_percent:2.58,annual_dividend_per_share:4.35,currency:"USD"}};
 const html='<!doctype html><html><body><h1>PG</h1><script type="application/json" id="aya-report-snapshot">'+JSON.stringify(obj)+'</script><p>Research.</p></body></html>';
 const r=parseHtmlReport(info,html);
 assert.equal(r.industryCategory,"Consumer Essentials");
 assert.equal(r.dividendYieldPercent,2.58);
 assert.equal(r.dividendAnnualPerShare,4.35);
});

test("Visible G. Dividends prose is parsed without mining unrelated forecast percentages",()=>{
 const cash=extractReportDividend({
  snapshot:{},currency:"USD",fields:new Map(),
  dividendText:"Micron's announced quarterly cash dividend was $0.15/share. Annualized $0.60/share implies ~0.083% at this intraday quote."
 });
 assert.equal(cash.dividendYieldPercent,0.083);
 assert.equal(cash.dividendAnnualPerShare,0.60);
 assert.equal(cash.dividendDataSource,"REPORT_TEXT");
 const noSection=extractReportDividend({snapshot:{},currency:"USD",fields:new Map(),
  dividendText:"Revenue rose 17% and margins widened 5%; no cash dividend information supplied."});
 assert.equal(noSection.dividendYieldPercent,null);
 assert.equal(noSection.dividendStatus,"UNKNOWN");
});
