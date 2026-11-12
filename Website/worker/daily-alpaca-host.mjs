// Preserve the encrypted Alpaca credentials on their existing private Worker.
// This Worker has NO public route and deliberately offers read-only US daily bars.
// The former experimental intraday pilot is archived in draft PR #1; no live consumer binds it.
import {DailyHistoryProvider} from "./daily-alpaca-provider.mjs";
export {DailyHistoryProvider};
export default {fetch(){return new Response("Not found",{status:404});}};
