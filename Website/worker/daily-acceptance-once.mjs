// One-time Cloudflare API-triggered daily acceptance. No public route or credentials.
// Called only through Cloudflare's authenticated Workflows API and private service binding.
import {WorkflowEntrypoint} from "cloudflare:workers";
export class DailyAcceptanceOnce extends WorkflowEntrypoint {
 async run(event,step){
  if(event?.payload?.purpose!=="daily_signals_final_acceptance_20261112")
   return {status:"INVALID_PURPOSE"};
  return step.do("generate-first-daily-report",{
   retries:{limit:0,delay:"1 second",backoff:"constant"},timeout:"90 seconds"
  },async()=>{
   const x=await this.env.DAILY_PRIVATE_RUNNER.runOnce("DAILY_ACCEPTANCE_20261112");
   return {status:x?.status||"UNKNOWN",date:x?.date||null,
    tickers:Number(x?.tickers)||0,counts:x?.counts||{},
    source:x?.source||null,feed:x?.feed||null,
    generatedAt:x?.generatedAt||null};
  });
 }
}
export default {fetch(){return new Response("Not found",{status:404});}};
