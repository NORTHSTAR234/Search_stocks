# Private Alpaca integration smoke test (12 November 2026)

**Scope:** Isolated Cloudflare Worker `search-stocks-intraday-research-disabled`. The existing dashboard, price Worker, and Alpaca trading account are not changed. **No trades or live intraday recommendations.**

## Secret verification

Cloudflare read-only inspection showed:
- `ALPACA_API_KEY_ID` — `secret_text`, value never read.
- `ALPACA_SECRET_KEY` — `secret_text`, value never read.
- `INTRADAY_RESEARCH_ENABLED` — `disabled`.
- `workers.dev` — disabled.
- Preview URLs — disabled.
- Production Cloudflare Pages keeps the original `PRICE_PROVIDER` binding, without an intraday integration.

The connected Alpaca Plugin has separately retrieved IEX bars and news; this does **not** by itself establish the separately deployed Cloudflare Worker can authenticate.

## One-shot diagnostic implementation

Code: `Website/worker/intraday-readonly-probe.mjs`. The isolated Worker has a default HTTP handler returning 404 and a **strictly guarded** scheduled handler:

- Run only when research remains disabled AND a separate short-lived `INTRADAY_DIAGNOSTIC_MODE=armed_20261112` flag is set AND the dedicated result KV is available.
- Read KV sentinel `intraday-smoke-20261112`. Skip if a result/start marker already exists.
- Write a STARTED marker, then execute exactly two Alpaca data requests with the attached **private** secrets, only to `https://data.alpaca.markets`:
  1. `GET /v2/stocks/bars`: last five days, MU IEX five-minute bars, maximum 50.
  2. `GET /v1beta1/news`: previous 48h of NVDA news, maximum 10.
- Persist at most status codes, counts and ISO timestamp ranges, with a 24-hour TTL. Never store credentials, raw headlines, price candles, account metadata or order information.
- Reject bad HTTP status, malformed JSON, invalid timestamps and empty data. A successful metadata probe is **not** proof of realtime market data, consolidated SIP, completeness of news history, or a profitable entry signal.
- Remove the temporary Cron Trigger promptly, and change diagnostic flag to disarmed. Keep `INTRADAY_RESEARCH_ENABLED=disabled`.

## Temporary diagnostic resource

Dedicated Workers KV namespace: `SEARCH_STOCKS_INTRADAY_PROBE_20261112`. It is separate from existing FRED OAuth and international quote caches. This storage is designed only for sanitized one-shot records; it may be deleted after verification.

**Acceptance:**
1. GitHub Action Website tests green.
2. Cloudflare Worker secret metadata unchanged.
3. No public or preview endpoint.
4. Only sanitized KV test result, or an explicit NOT_OBSERVED result if Cloudflare Cron never runs in the testing window.
5. Cron removed and diagnostic mode disarmed.

**Post-smoke work:** A real end-to-end intraday signal RPC test, behind an owner-only authenticated service binding in a separately isolated preview environment, is a different acceptance gate. The production website must not be merged or enabled merely because Alpaca data returned successful responses.

## Actual observed outcome — smoke did not complete

The two encrypted secrets were confirmed by binding **names and types only**. The private probe code passed independent automated tests, and the standalone Worker deployment preserved its secret bindings. A temporary minute-based Cron was registered to trigger the one-shot read-only diagnostic, but **no KV result was observed before rollback**. Therefore the isolated Cloudflare-to-Alpaca network request, API-key validity, and downstream data entitlement were **NOT VERIFIED**. Neither successful authentication nor a data-source failure is implied by the missing result.

For security, the Worker was reuploaded with only the two inherited encrypted Alpaca secrets and `INTRADAY_RESEARCH_ENABLED=disabled`. Follow-up inspection verified **no scheduled Cron trigger, no diagnostic armed flag, no diagnostic KV binding, no public or preview URL**, and the unchanged encrypted secret names. The dedicated, empty one-shot KV namespace was **deleted**. Existing production Pages `PRICE_PROVIDER` was not modified. No orders, alerts or live signal activation occurred.

Cloudflare documents that new Cron Trigger deployments can take up to 15 minutes to propagate. Consequently a short diagnostic execution window without a KV record is an inconclusive integration test, not evidence of invalid credentials. A future authorized attempt should use a separately authenticated private invocation pathway or explicitly allow for schedule propagation, with the same disabled-by-default and one-shot cleanup guarantees.
