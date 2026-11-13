// Frozen, user-supplied RizqInvests ethical/BDS dataset. No live provider requests.
import fs from "node:fs";
const DATA_URL=new URL("../data/rizqinvests-ethical-bds-2026-11.json",import.meta.url);
const US_EXCHANGES=new Set(["US","NASDAQ","NYSE","AMEX","NYSEAMERICAN","NYSEARCA","ARCA","BATS","CBOE"]);
const suffixes=new Set(["THE","INC","INCORPORATED","CORP","CORPORATION","CO","COMPANY","LTD","LIMITED","PLC"]);
function issuerKey(value){
  return String(value||"").toUpperCase().replace(/&/g," AND ").replace(/[^A-Z0-9]+/g," ")
    .split(/\s+/).filter(x=>x&&!suffixes.has(x)).join(" ");
}
function sameIssuer(a,b){
  const x=issuerKey(a),y=issuerKey(b);
  return Boolean(x&&y&&(x===y||x.startsWith(y+" ")||y.startsWith(x+" ")));
}
export function loadEthicalDataset(){
  const data=JSON.parse(fs.readFileSync(DATA_URL,"utf8"));
  if(data.schema_version!==1||data.source_kind!=="user_supplied_snapshot"||
     data.source_period!=="2026-11"||data.ticker_count!==491||
     !Array.isArray(data.rows)||data.rows.length!==491)
    throw Error("Invalid user-supplied ethical dataset header");
  const byTicker=new Map();
  for(const r of data.rows){
    if(!/^[A-Z][A-Z0-9.-]*$/.test(r.ticker)||byTicker.has(r.ticker)||
       !["Neutral","Unethical","Ethical"].includes(r.ethical_label)||
       typeof r.bds_badge!=="boolean"||
       r.source_url!=="https://www.rizqinvests.com/halal/stock/"+encodeURIComponent(r.ticker)+"?view=both")
      throw Error("Invalid ethical dataset record "+r.ticker);
    byTicker.set(r.ticker,r);
  }
  return {data,byTicker};
}
export function applyEthicalDataset(row,registry){
  const ticker=String(row.ticker||"").toUpperCase();
  const candidate=registry.byTicker.get(ticker);
  const exchange=String(row.exchange||"").toUpperCase();
  const hit=US_EXCHANGES.has(exchange)&&candidate&&sameIssuer(row.company,candidate.company)?candidate:null;
  // Previous live-site or unrelated-provider values must never survive this source-locked snapshot.
  const base={...row,ethicalStatus:"UNVERIFIED",ethicalBdsListed:null,
    ethicalAssessmentDate:null,ethicalCheckedAt:null,ethicalReason:"No exact issuer match in the user-supplied RizqInvests Nov 2026 dataset. No external ethical/BDS lookup attempted.",
    ethicalSourceUrl:null,ethicalSourceKind:"USER_SNAPSHOT",ethicalDataAsOf:"2026-11",
    ethicalSnapshotImportedOn:"2026-11-13"};
  if(!hit)return base;
  const isBds=hit.bds_badge===true;
  const ethicalStatus=isBds?"BDS_LISTED":hit.ethical_label==="Unethical"?"UNETHICAL":
    hit.ethical_label==="Ethical"?"ETHICAL":"NEUTRAL";
  const bds=isBds?true:hit.ethical_label==="Unethical"?null:false;
  const reason="User-supplied RizqInvests table (Nov 2026): Ethical = "+hit.ethical_label+
    "; BDS badge "+(isBds?"present": "not shown")+
    ". Historical snapshot only; not a live or independent BDS check.";
  return {...base,ethicalStatus,ethicalBdsListed:bds,
    ethicalCheckedAt:"2026-11-13T00:00:00Z",ethicalReason:reason,
    ethicalSourceUrl:hit.source_url,ethicalProviderLabel:hit.ethical_label,
    ethicalSourceKind:"USER_SNAPSHOT"};
}
