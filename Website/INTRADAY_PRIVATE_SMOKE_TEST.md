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
