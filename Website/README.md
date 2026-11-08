# Stock Research Website

Private-ready Cloudflare Pages frontend for the *latest* archived Search_stock reports. All website source files live **only in Website/**. The existing halal/ and nonhalal/ report trees are read-only and are never modified by this build.

## Status and security

**Not yet deployed.** The GitHub repository is public. The default build intentionally publishes **only a setup placeholder**, not research reports. This prevents accidental publication during the first Pages deployment. The X-Robots-Tag and robots.txt files are not access controls. Set PUBLISH_REPORTS=yes only after Cloudflare Access is configured and verified on the production pages.dev URL, previews, and any custom domain.

The price gateway is **fail-closed**. It cannot return market data until the Cloudflare Access team domain, Access application AUD, owner email, and a Worker service binding to an approved read-only price provider have been configured. The existing stockresearch-fred-mcp Worker is **not modified**. An existing encrypted Alpaca credential alone does not establish a callable quote endpoint.

## Cloudflare Pages setup

- Git provider: GitHub; repository: NORTHSTAR234/Search_stocks
- Framework: None
- Production branch: main
- Root directory (advanced): Website
- Build command: npm install --no-audit --no-fund && npm run build
- Build output directory: dist
- Runtime: Node.js 22
- Pages Functions: Website/functions/api/prices.js (automatically detected under configured Pages root)

**Two-stage private rollout:** (1) Leave PUBLISH_REPORTS absent. Deploy the harmless setup placeholder and note the actual pages.dev hostname. (2) Create restrictive Cloudflare Access applications for this production hostname, preview hostnames and any custom domain. The preview-only Access toggle does not protect production pages.dev. (3) Confirm an unauthenticated browser is denied. (4) In Pages build environment variables set PUBLISH_REPORTS=yes and redeploy; repeat anonymous checks for /, /reports/<ticker>/, /data/reports.json and /api/prices. Restrict preview deployments before enabling the flag. Do not assume the GitHub repository is private.

## Price integration (future wiring)

The dashboard polls /api/prices every 60 seconds when visible and on manual refresh. It never embeds Alpaca keys or directly fetches Alpaca from browsers. The Pages Function authenticates the owner's Access JWT cryptographically, validates the email and allowed application audience, and requests data through a private Cloudflare Worker **service binding** named PRICE_PROVIDER. The Function never accepts arbitrary target URLs.

Set Pages Function runtime values:
- ACCESS_TEAM_DOMAIN: your-team.cloudflareaccess.com (not secret)
- ACCESS_AUD: the specific Access application's audience tag (not secret)
- OWNER_EMAIL: exact owner's Access-authenticated email (configure privately)
- PRICE_PROVIDER: Service Binding to a dedicated, read-only, approved quote endpoint **only after inspecting the existing Worker**.

The bound price provider must implement GET /quotes?symbols=AAPL,AMD and return JSON of this shape:

~~~json
{
  "quotes": {
    "AAPL": {
      "price": 123.45,
      "currency": "USD",
      "asOf": "2026-11-06T20:00:00Z",
      "feed": "IEX",
      "session": "last_close",
      "sessionScope": "regular",
      "adjustment": "raw",
      "reference24h": {
        "price": 122.00,
        "currency": "USD",
        "asOf": "2026-11-05T20:00:00Z",
        "feed": "IEX",
        "sessionScope": "regular",
        "adjustment": "raw"
      }
    }
  }
}
~~~

These are schema example numbers **only, not real market observations**. The Pages Function independently checks time proximity (24 hours +/- 30 min), feed, session, currency, and adjustment before computing any 24-hour return. When no valid 24h reference exists, it returns null, displayed as 24h N/A. Market-closed prices must be marked last_close. Never replace unavailable quotes with prices found in old reports or standard prior-session daily percent changes.

**Market-data licence:** Personal Alpaca data must not automatically be redistributed to friends. The gateway permits only OWNER_EMAIL until display/redistribution rights are confirmed. ASX, Bursa, Taiwan, and other non-US markets are not covered by the Alpaca US quote feed; the dashboard shows unavailable instead of matching unrelated US symbols. Existing FRED Worker deployment/keys remain untouched.

## Local build and tests

From Website/ run:

~~~sh
npm install
npm test
PUBLISH_REPORTS=yes npm run build
~~~

The full (PUBLISH_REPORTS=yes) build reads ../halal and ../nonhalal read-only. Without that flag the build produces only the safe setup page. Outputs: dist/index.html, dist/data/reports.json, and one dist/reports/TICKER/index.html for every latest exact ticker. The latest status-only record replaces previous investment analysis; no stale scores are backfilled. The generated HTML renders Markdown with raw HTML **disabled**. Data fields are best-effort conservative extraction, and any unrecognized field is shown as NOT RATED/NOT VERIFIED rather than invented.

## Checklist before launch

1. Confirm Access blocks anonymous requests to every hostname and its report/data paths.
2. Inspect stockresearch-fred-mcp source and its actual endpoints. Reuse a read-only price path if genuinely available, or create a dedicated verified adapter, without changing existing trading/MCP behavior.
3. Connect the private service binding and test with an owner Access session and with an unapproved account.
4. Verify feed/license entitlement, regular vs extended session, weekend 24h N/A, date-zone currency matching, and international unsupported handling.
5. Verify report extraction against current full and screening-only examples. Do not claim the website is private or the quote feed is live before tests pass.
