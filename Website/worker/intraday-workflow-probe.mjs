// Cloudflare REST-created one-shot Workflow. The Worker itself has no public route.
// No Alpaca credentials exist in this Workflow; it calls the private named RPC binding.
import {WorkflowEntrypoint} from "cloudflare:workers";
export class AlpacaConnectivityOnce extends WorkflowEntrypoint {
  async run(event,step){
    if(event?.payload?.purpose!=="read_only_alpaca_smoke_20261112")
      return {kind:"INTRADAY_WORKFLOW_SMOKE_V1",overall:"INVALID_PURPOSE"};
    return await step.do("authenticated-data-probe",{
      retries:{limit:0,delay:"1 second",backoff:"constant"},timeout:"30 seconds"
    },async()=>{
      const result=await this.env.PRIVATE_ALPACA_PROBE.smoke();
      // Keep only the short, sanitized data contract, not prices, headline bodies,
      // secrets, account metadata or a serialized external upstream response.
      const sanitize=x=>({ok:x?.ok===true,code:String(x?.code||"NOT_REPORTED").slice(0,60),
        items:Number.isSafeInteger(x?.items)?Math.min(50,Math.max(0,x.items)):0,
        firstTimestamp:typeof x?.firstTimestamp==="string"?x.firstTimestamp:null,
        lastTimestamp:typeof x?.lastTimestamp==="string"?x.lastTimestamp:null});
      return {kind:"INTRADAY_WORKFLOW_SMOKE_V1",
        execution:"READ_ONLY_NO_ORDERS",overall:result?.overall==="PASS"?"PASS":
          result?.overall==="NOT_ARMED"?"NOT_ARMED":"INCOMPLETE",
        bars:sanitize(result?.bars),news:sanitize(result?.news),
        observedAt:typeof result?.observedAt==="string"?result.observedAt:null};
    });
  }
}
// Even accidental public routing cannot execute a probe through HTTP.
export default {fetch(){return new Response("Not found",{status:404});}};
