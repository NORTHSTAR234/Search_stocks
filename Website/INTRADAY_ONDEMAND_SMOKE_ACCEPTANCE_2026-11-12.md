# Private Cloudflare-to-Alpaca connection acceptance — PASSED
**Verified 12 November 2026, 07:13 UTC.** Research-only. No orders or signals activated.

## Purpose

Replace the earlier inconclusive Cloudflare Cron smoke test with an **on-demand**, Cloudflare-API-triggered Workflow. The production Pages project and original price provider are not involved. The Worker with actual Alpaca secrets stays privately isolated, with no workers.dev or preview URLs.

## Evidence

Cloudflare Workflow name: `search-stocks-intraday-smoke-once` (temporary, now **deleted**).
Transient Workflow Worker: `search-stocks-intraday-smoke-once` (no Alpaca secrets, no public URL, now **deleted**).
Private Alpaca Worker: `search-stocks-intraday-research-disabled` (retained, feature disabled).

The Workflow used Cloudflare's account-authenticated REST API to initiate an instance, then called the named private service binding `PRIVATE_ALPACA_PROBE` → `search-stocks-intraday-research-disabled` → `IntradayCredentialProbe.smoke()`. The private entrypoint ran only when `INTRADAY_RESEARCH_ENABLED=disabled` and `INTRADAY_DIAGNOSTIC_MODE=armed_on_demand_20261112`. It called **GET**-only Alpaca data endpoints via the two encrypted secrets stored on that private Worker. The Workflow result was restricted to status, counts and ISO timestamp ranges; no price values, headlines, credentials, account identifiers or trades were returned.

### Verified Cloudflare Workflow execution

The FIRST diagnostic attempt failed **before contacting Alpaca**, because Workflow rejected an incomplete step-retry configuration. Fixed by supplying the required `retries.delay` and `retries.backoff` values. The SECOND attempt completed with exactly one successful Workflow step, **no retry attempts**, and the following sanitized result:

| Attribute | Verified result |
|---|---|
| Workflow overall | **PASS**, completed |
| Source | Alpaca `data.alpaca.markets` using the isolated Worker's encrypted credentials |
| Execution mode | `READ_ONLY_NO_ORDERS` |
| MU 5-minute OHLCV bars | HTTP/data/schema success, **50 rows** (probe-request limit) |
| First/last MU observation timestamps | `2026-11-11T17:35:00Z` to `2026-11-11T21:50:00Z` |
| NVDA timestamped news | HTTP/data/schema success, **10 rows** (probe-request limit) |
| First/last NVDA provider-created timestamps | `2026-11-12T00:07:51Z` to `2026-11-12T06:00:43Z` |
| Recorded probe time | `2026-11-12T07:13:36.437Z` |
| Workflow state | `complete`, success true, one successful step |
| Calls to Alpaca brokerage order API | **None** |

The MU sample spans some extended-hours timestamps; this does **not** establish a 78/78 complete regular session, real-time streaming entitlement, consolidated SIP, news coverage completeness, execution-ready quotes, profitability, or sufficient historical walk-forward validation.

### Verified teardown / rollback

After saving the result, the isolated Alpaca Worker was reuploaded with `bindings_inherit=strict` for the same two encrypted secrets, and **only** `INTRADAY_RESEARCH_ENABLED=disabled` as a plaintext configuration variable. Final settings inspection confirmed:

- `ALPACA_API_KEY_ID` and `ALPACA_SECRET_KEY`: encrypted `secret_text` bindings, preserved; never read their values.
- Intraday signal feature: **disabled**. Diagnostic flag: **absent/disarmed**.
- Public workers.dev and preview URL exposure: **off**. Cron schedules: **zero**.
- No standalone diagnostic KV store or permanent diagnostic workflow route.
- Temporary Workflow resource **deleted**, and its separate Worker **deleted**; only the isolated disabled Alpaca research Worker remains, alongside the user's original Workers.
- Existing Pages production and original `PRICE_PROVIDER` binding: **unchanged**.

This is the first **actual cloud-executed, private Cloudflare-to-Alpaca bar/news credential test** in this pilot. Prior connected-ChatGPT Alpaca calls and local mocks were useful but did not prove the private Cloudflare credential path; this verified Workflow execution did.

## Remaining launch gates

1. Owner-only authenticated *Pages* RPC endpoint integration and authorization/preview isolation in a later stage; do not enable the production website directly.
2. Confirm long-term source-time news coverage, IEX session completeness/latency and proper market hours/holidays, earnings risk and provider entitlements.
3. Multi-year walk-forward backtesting with actual fees/spreads, and prospective paper-trading observation. Previous nine-candidate/five-paper-fill result is **not sufficient** to claim reliable profitability.
4. Keep all trading actions disabled; no auto-execution, scheduled signals, BUY/SELL alerts or active investment recommendations based on this experimental model.

Reproduction source (draft branch only): `Website/worker/intraday-workflow-probe.mjs`, `Website/worker/intraday-readonly-probe.mjs`, and their focused `Website/tests` regression files. Creating new test workflows is not required for ordinary website operation.
