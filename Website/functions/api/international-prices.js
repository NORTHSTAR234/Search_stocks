import { authenticatedOwner } from "./prices.js";

// Explicitly disabled to prevent any consumption of limited EODHD API credits.
// Keep the endpoint owner-protected and non-caching even when called manually.
// Future licensed providers must use a new, deliberately enabled implementation.
export async function onRequestGet({request,env}){
  const headers={"Content-Type":"application/json; charset=utf-8","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
  if(!(await authenticatedOwner(request,env)))
    return new Response(JSON.stringify({error:"NOT_AUTHORIZED"}),{status:403,headers});
  return new Response(JSON.stringify({error:"INTERNATIONAL_AUTOMATIC_FEED_PAUSED",quotes:{},
    reason:"The free EODHD quota is insufficient for five-minute multi-ticker polling."}),{status:410,headers});
}
