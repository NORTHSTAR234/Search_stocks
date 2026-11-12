# Owner action: connect isolated paper-data credentials (no keys in chat)

Status as of 12 November 2026: independent Worker **search-stocks-intraday-research-disabled** exists in Cloudflare. Its flag is `INTRADAY_RESEARCH_ENABLED=disabled`, it has **zero secrets**, `workers.dev` and preview URLs are disabled, and there is **no Pages binding**. Existing stock-research Worker, price gateway, GitHub main and trading accounts are untouched.

## What the repository integration can and cannot do

The standalone research Worker only makes authenticated Alpaca **GET** requests for IEX five-minute stock bars and news headlines. It has no order placement code and no trading execution route. The secure secrets already attached to the **different** original Worker cannot be read or copied through Cloudflare's secret metadata API. There is no supported mechanism in this implementation to transfer those original values automatically.

**The owner must provision two new secrets in the isolated Worker.** Prefer API credentials from an Alpaca **paper** account, not a live-trading account. Even paper credentials can be sensitive; do not share them in ChatGPT, GitHub issues, repository files or Cloudflare public environment variables.

### Cloudflare dashboard procedure

1. Open Cloudflare dashboard → **Workers & Pages** → Worker **search-stocks-intraday-research-disabled**.
2. Open **Settings** → **Variables and Secrets** → Add Secret (Cloudflare labels may differ).
3. Add the exact secret names **`ALPACA_API_KEY_ID`** and **`ALPACA_SECRET_KEY`**. Both must be entered using Cloudflare's **Secret** type—not plaintext variable. Obtain their values yourself from your Alpaca paper-account API credentials. Do not use the existing stock-research Worker's secret metadata values; these are not retrievable.
4. Redeploy the private Worker if Cloudflare requires it. **DO NOT** change `INTRADAY_RESEARCH_ENABLED`: it must remain **`disabled`**. Do not enable `workers.dev`, preview URLs, a route, public Access bypass, or any browser-side API keys.
5. The owner can return to ChatGPT and say **"Verify the isolated Alpaca secrets and continue"**. Only **secret names and binding types** will be inspected to confirm presence; secret values must remain unread and unreported.

### Still required after provisioning

- Verify exact feature flag and absence of public routes, and confirm both secret bindings are present in the isolated Worker.
- Establish a **separate private Pages service binding** to the named entrypoint `IntradayResearchProvider`, but only after confirming the Pages owner-only Cloudflare Access policy protects both production and preview routes. Keep the public app's existing `PRICE_PROVIDER` unchanged.
- Perform an authenticated, read-only diagnostic request, with verified IEX entitlement, 5-minute bar freshness and sample-news publication timing, and maintain a fail-closed response on any 401/403, 429, timeout or incomplete feed.
- Consider enabling `INTRADAY_RESEARCH_ENABLED=read_only` **only for private smoke testing**, never as a live BUY/SELL alert launch. Preserve an immediate rollback to `disabled`.
- Do **not** run scheduled polling, write to broker orders, expose raw licensed market data publicly, or claim performance based on the tiny 2026 retrospective sample.

Before activating any live alerting, complete extended prospective paper tracking with a point-in-time, sufficiently complete news corpus, realistic brokerage execution costs and a secure privacy policy for market-data storage. An absent data feed or headline coverage yields **NO DATA / NOT ACTIVE**; it is never evidence to buy.
