# Intraday data and news integration — isolated Worker deployed, NOT ACTIVATED

Last reviewed: 12 November 2026. This implementation remains on the draft feature branch. A separate Cloudflare Worker **search-stocks-intraday-research-disabled** was deployed with no Alpaca secrets, plain-text feature flag **disabled**, and workers.dev and preview URL access **disabled**. Its settings and empty secret list were verified by Cloudflare read-only inspection. It is **not bound to the Pages site** and is not a live alerting system. It does not place trades, issue notifications, create recurring checks, or change the authenticated production website without being explicitly configured and merged.

## Architecture and trust boundary

| Component | Purpose | Security / status |
|---|---|---|
| Website/worker/intraday-research-provider.mjs | Private named Worker RPC entrypoint: IntradayResearchProvider, fetching Alpaca IEX 5-minute OHLCV and article metadata | Worker exists but remains disabled and isolated; no public URL, no secrets; default HTTP endpoint returns 404 |
| Website/lib/news-risk.mjs | Triage high-precision material-risk headlines with provider-created timestamps | Reported headline remains **reported**, not confirmed |
| Website/lib/intraday-signals.mjs | Completed regular-session five-minute bars, VWAP, opening range, five-prior-session same-clock volume, sector and QQQ context | Every classification RESEARCH_ONLY_NOT_EXECUTABLE and validated:false |
| Website/functions/api/intraday-research.js | Cloudflare Pages GET /api/intraday-research?symbols=MU,NVDA | Requires exact owner Access JWT, private RPC binding and read_only flag; defaults to 403/503 |
| Website/lib/intraday-gateway.mjs | Reject stale, mismatched, executable-looking or malformed RPC responses | Test-covered |
| Website/tests/intraday-*.test.mjs and news-risk.test.mjs | Automated contract/provider simulation tests | No real secrets, no network access in CI |

Supported pilot tickers: MU, NVDA, AMD, AAPL; up to TWO at a time. Sector benchmark: SOXX for MU/NVDA/AMD, SPY for AAPL, with QQQ broad market. Feed is explicitly IEX, not consolidated SIP. No market-holiday calendar or ASX/TWSE/MYX intraday integration yet.

**Important:** News comes from Alpaca's news API. The created_at field is the *provider's created timestamp*, not automatically a verified first-publication or original issuer timestamp. A negative headline can produce a **reported risk alert**, but this does not establish the reported event actually happened. Missing negative headlines does not prove the stock is safe. No news headline is executed as instructions.

## Explicit activation prerequisites — do not turn on until reviewed

The current Cloudflare Pages site uses an owner-only Access JWT gateway for ordinary prices. The new pilot API reuses that owner check but has an **independent** service binding so the production PRICE_PROVIDER remains untouched.

1. Isolated research Worker already provisioned under name search-stocks-intraday-research-disabled, with repository configuration Website/worker/intraday.wrangler.jsonc. Verify the exact deployed source/configuration before future changes; do not replace or reconfigure the production price Worker. Its current configuration is deliberately disabled and without Alpaca credentials.
2. Provision **encrypted Worker secrets** ALPACA_API_KEY_ID and ALPACA_API_SECRET_KEY through Cloudflare's secure dashboard or CLI only. Never commit, log or paste secrets in chat/GitHub. A ChatGPT Alpaca connection does not automatically grant Cloudflare the same credentials.
3. Disable public routes/workers.dev for the Worker. Only named entrypoint IntradayResearchProvider should be callable via explicit service binding. Default HTTP handler returns 404. Preserve least privilege, GET-only data access and separate Worker isolation.
4. Configure the Pages project's service binding INTRADAY_RESEARCH_PROVIDER to that Worker **with the named entrypoint**, then set INTRADAY_RESEARCH_ENABLED=read_only in both the Worker and intended Pages environment. The flags are absent/disabled by default. Preserve all existing owner Access JWT settings.
5. Verify authenticated GET /api/intraday-research?symbols=MU,NVDA displays only research metadata, not raw API keys/orders. Anonymous requests must yield 403; missing flag or binding returns 503; unsupported tickers yield 400 **after owner authentication**.
6. Keep the trading UI **disabled** during the research phase: receiving a valid research-only API response is not a verified trading opportunity. Do not merge/deploy until licensing, tests, Access protections, event timestamps and historical research are reviewed.

There is **no always-on background job** yet. The staged API only runs on demand and cannot warn about breaking events while no request is made. A future periodic poller would need strict API rate budgets, deduplication, secured retention, and verified notification rules. Do not add an unconditional browser polling loop.

## Data freshness and known limitations

- Alpaca bars: GET https://data.alpaca.markets/v2/stocks/bars with explicit timeframe=5Min, feed=iex, adjustment=raw, 18-calendar-day lookback and up to three pages of 10,000 bars. Filter 09:30–15:55 in America/New_York. Missing contiguous opening bars **fail closed**.
- Alpaca news: GET https://data.alpaca.markets/v1beta1/news, 48-hour lookback, at most two pages of 50 items. Incomplete pagination preserves an attributable material negative risk alert but suppresses an ordinary bullish candidate.
- Private RPC sends **derived research, not raw historical bars**; the Access-protected Pages endpoint responds Cache-Control: private, no-store. Every output remains validated:false and RESEARCH_ONLY_NOT_EXECUTABLE.
- Personal/feed entitlements and IEX trade volume differ from consolidated markets; five-minute data can be delayed/sparse. A last IEX trade is not a consolidated US close, and news provider-created timestamps need not reflect when the issuer first announced an event. If data are stale, output NO_DATA / MARKET_CLOSED rather than inferred actionable entry.
- Headline classification is conservative, intentionally imperfect and requires source manual review. A comprehensive timestamped news corpus is needed for historical evaluation.
- Scheduled macro releases, earnings/calendar surprises, holiday handling, options flow, spread/liquidity safeguards, risk calibration and broad out-of-sample testing are **not included yet**. Do not assume this model has a statistical edge.

Reference documentation:
- https://docs.alpaca.markets/us/reference/stockbars
- https://docs.alpaca.markets/us/reference/news-3
- https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/rpc/
- https://developers.cloudflare.com/pages/functions/bindings/

## Operational acceptance gate

Before enabling any BUY/SELL-style user interface, preserve production report HTML and schema; verify quote/feed entitlement and observation latency; prevent a reported headline from being described as confirmed; complete a multi-year walk-forward comparison against the unfiltered opening-range baseline including fees, spreads, execution and zero-lookahead; paper-test privately over an extended sample. Automatic order execution is outside this project.

## Latest historical paper result

See [INTRADAY_PAPER_AUDIT_2026-11-12.md](INTRADAY_PAPER_AUDIT_2026-11-12.md): replay of August–11 November 2026 IEX five-minute data across four primary equities. Only five pilot long fills after risk/no-chase gates, of which four were positive, with **+0.028% average illustrative net paper return** (16bps round-trip assumed) and no historical news feed. This is NOT enough evidence for active entry signals. Keep disabled.
