# Stock Research Website

Cloudflare Pages website for the **latest archived Search_stock report for each exact ticker**. Website source files live in `Website/`; `halal/` and `nonhalal/` are read-only build inputs and must never be rewritten by the site.

## Production status (9 November 2026)

- Website: https://search-stocks-research.pages.dev
- Pages project: `search-stocks-research`
- Source: `NORTHSTAR234/Search_stocks`, branch `main`, root directory `Website`
- Build: `npm install --no-audit --no-fund && npm test && npm run build`
- Output: `dist`
- `PUBLISH_REPORTS=yes` is enabled **only in production** after the owner confirmed an anonymous incognito browser is redirected to Cloudflare Access sign-in.
- Cloudflare Access owner-only policies protect the production hostname and wildcard deployment URLs. Access must also protect any custom domain added in future.
- Cloudflare Pages deployment and regression tests have passed. The dashboard builds one HTML report for each ticker's latest canonical report across both archive buckets, and retains status-only rows without backfilling old scores.
- The GitHub source repository is **public**. The website's login protection does **not** make the Markdown files in GitHub private; do not put confidential information into this public repository.

## Alpaca price service

The dashboard requests `/api/prices` for US-listed symbols only, on page load, manual refresh, and at most once per 5 minutes while visible. This Pages Function cryptographically checks the owner's Cloudflare Access JWT and exact email before calling a private `PRICE_PROVIDER` service binding.

The `PRICE_PROVIDER` binding connects to named entrypoint `WebsitePrices` of the existing `stockresearch-fred-mcp` Worker. The named entrypoint uses the Worker's **existing encrypted Alpaca API credentials**, calls read-only Alpaca IEX endpoints, and returns timestamped observations. It has no public route, no trading methods, and no use of portfolio/account data. The Worker's original OAuth/MCP default handler and all original secret/KV bindings were preserved. The existing FRED tool was checked successfully after deployment.

**Data quality rules:**

- IEX prices are **latest observed IEX trades**, not a consolidated US-market (SIP) price or necessarily an official regular-session close. Show the original trade timestamp, currency and feed.
- A 24-hour percentage is calculated **only** when a same-feed, raw-basis IEX minute-bar observation exists within 30 minutes of the exact T minus 24 elapsed hours. Otherwise show `24h N/A` (never substitute the previous session's daily change).
- Positive verified 24h percentages are green; negative are red; unavailable or zero are neutral.
- A matching valid quote can independently highlight archived preferred/acceptable buy zones. Buy zones and recommendation scores themselves are not refreshed.
- Non-US exchanges are **not supported by Alpaca IEX**. A separate EODHD service supplies ten verified delayed ASX/TWSE quote symbols; CBHB remains unavailable. There are no US proxy quotes.
- The Alpaca owner-browser price flow was confirmed by the owner. The new EODHD backend was independently verified for 10 symbols; the **owner's browser check for the combined dashboard is still pending**.
- Owner-only live market-data access avoids automatic redistribution to friends. Expanding access requires checking Alpaca licensing and quote redistribution rights.

## Safe rollout and fallback

Without `PUBLISH_REPORTS=yes`, the build creates only a harmless setup placeholder. This is a deliberate fail-closed fallback if access needs to be disabled or reconfigured.

Only enable `PUBLISH_REPORTS=yes` after confirming Cloudflare Access for production, preview and custom hostnames. Preview builds do not currently have this flag. Robots and noindex headers are **not security controls**.

The Pages price function also fails closed with 403/503 when owner JWT, binding, or valid upstream quote data is unavailable. No archived price should be presented as a current quote. No trades are placed.

## Development

From `Website/`:

```sh
npm install
npm test
PUBLISH_REPORTS=yes npm run build
```

Website regression tests cover archive handling, exact listing/market identity, recommendation colors, both owner-only quote gateways, 5-minute polling and fail-closed authorization. Cloudflare Pages runs these tests as part of its build command, so a failing test blocks new deployments.

The full build creates `dist/index.html`, `dist/data/reports.json`, and `dist/reports/<ticker>/index.html` from the latest eligible Markdown file per exact listing. It renders Markdown with raw embedded HTML disabled and preserves source reports in their original directory.

## Operational checks

1. Refresh the website in an owner-authenticated browser; confirm verified IEX quotes display where available, with actual timestamps and correct 24-hour N/A/return formatting.
2. Confirm unauthenticated browsers cannot access `/`, `/data/reports.json`, `/reports/<ticker>/` or either `/api/prices` or `/api/international-prices`; production and deployment alias hostname protection must remain active.
3. Verify FRED/MCP remains operational following any future `stockresearch-fred-mcp` deployments; the GitHub source for that Worker contains both the `WebsitePrices` and `WebsiteInternationalPrices` private named entrypoints.
4. Confirm the Cloudflare Pages GitHub integration actually triggers an automatic rebuild on a new report commit; initial releases were manually triggered through the Cloudflare API even though Git integration is configured.
5. Do not add friends to the quote API until market-data licensing permits redistribution. Friends can receive research access through explicit additional Access allowlist policies.


## International EODHD delayed quote service (9 November 2026)

The owner-installed encrypted `EODHD_API_KEY` is used by a read-only `WebsiteInternationalPrices` named entrypoint in the existing `stockresearch-fred-mcp` Worker. Cloudflare Pages binds to it using `INTERNATIONAL_PRICE_PROVIDER`. An independent `/api/international-prices` endpoint verifies the exact owner's Cloudflare Access JWT before retrieving prices.

The live backend returned **10/11 valid international market quotes**: 2 ASX in AUD and 8 TWSE in TWD, delayed approximately 20–22 minutes during testing. **CBHB / 0339.KLSE provided no valid price**, and remains unavailable. Backend mapping is strict to the local listing and quote currency.

The EODHD quote's **previous-close percentage** is displayed explicitly as **vs prev close**; it is not a rolling 24-hour change. Source timestamps are shown; market holidays and closures may make the last trade older than 20 minutes. The dashboard polls Alpaca and EODHD **independently every 5 minutes when visible**.

Under EODHD personal-use terms, these EODHD prices are shown **to the owner only**. No friends or other Access users may receive them without provider licensing. The quote endpoint is separately owner-authenticated even if website Access policies change. The source key stays encrypted in Cloudflare; no data is scraped from Yahoo. Yahoo Finance is retained only as a link for unsupported symbols.

See [EODHD_FEASIBILITY.md](EODHD_FEASIBILITY.md) and [eodhd-candidates.json](eodhd-candidates.json) for live acceptance and mapping.

## Five-minute price refresh (9 November 2026)

The authenticated dashboard requests Alpaca and EODHD quotes immediately on page open, every **300,000 milliseconds (5 minutes)** while the page remains visible, on manual **Refresh prices**, and when switching back to a visible page. There is no 24/7 background polling when the site is closed. A five-minute *refresh frequency* is not an assurance of a five-minute *quote age*; the UI continues to show the source observation timestamp and IEX feed. The US feed remains Alpaca IEX; the international feed is EODHD delayed. CBHB still displays a Yahoo link because EODHD provided no valid quote. Archived research fields update only with new GitHub reports and successful Pages builds.
