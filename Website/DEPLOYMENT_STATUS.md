# Cloudflare website deployment status

As of 9 November 2026:

- Production site: https://search-stocks-research.pages.dev
- Cloudflare Pages project: `search-stocks-research`; `Website/` root on `NORTHSTAR234/Search_stocks` `main`
- Dashboard: **deployed**; 28 latest ticker reports generated from 97 archival Markdown files at the last verified build
- Frontend: 10-column Summary_Stock structure, frozen ticker column, sorting/filtering, accurate WATCH orange / BUY green / SELL/AVOID red, native HTML report pages
- Access: production and wildcard deployment URL applications use owner-only email allow policies; user confirmed incognito authentication challenge; preview publishing remains disabled
- Pages price gateway: configured to call `PRICE_PROVIDER` service binding with owner-only verified Access JWT
- Underlying Worker: `stockresearch-fred-mcp` named `WebsitePrices` entrypoint deployed; existing encrypted Alpaca keys reused; original OAuth/FRED handlers and all eight bindings preserved
- Alpaca quote source: latest IEX trade observations; exact 24-hour reference only when an eligible IEX 1Min bar exists within 30 minutes of T−24h. All unsupported/non-US quotes remain unavailable
- FRED regression smoke test succeeded after Worker deployment
- Website tests: **7/7 passed** as part of Cloudflare production build
- End-to-end owner-browser quote display: **not independently verified yet**; refresh in an authenticated browser to confirm or identify any 403/503 error
- Automatic rebuild on GitHub push: **not independently verified**; last releases were triggered explicitly through Cloudflare API
- The original `halal/` and `nonhalal/` folders were **not modified**
- The original GitHub repository is public; Cloudflare Access protects the website, **not the public GitHub Markdown URLs**

Do not add new secrets to this repository or enable external price redistribution without the required provider permission.

## 9 November 2026 — Quote gateway repair and verification

- Root cause of the HTTP 503 price outage: the Cloudflare Workers runtime rejects `fetch(...,{redirect:"error"})`. The isolated named entrypoint used that unsupported option for Alpaca latest trades and historical minute bars. Fixed both to `redirect:"manual"`, preserving explicit rejection of non-2xx/redirect responses and preventing credentials from following redirects.
- Production FRED Worker named entrypoint `WebsitePrices` version `b359e452-473d-4bb9-8561-22100edbc7be` deployed. Existing OAuth/MCP default handler, encrypted secrets, KV and unrelated research integrations preserved.
- Independently verified the private service-binding request with a temporary, no-price-output internal diagnostic: `HTTP 200`, **17 of 17 US ticker quotes**, **16 exact-24h eligible reference bars**, zero missing tickers. FRED `DGS10` source smoke test also returned VERIFIED.
- `ORG` was recognized as Origin Energy on ASX despite its unsuffixed archive ticker; this is now excluded from the Alpaca US feed, with a website regression test. The Pages deployment succeeded with 8/8 tests. No changes to `halal/` or `nonhalal/` archives.
- Removed the temporary diagnostic Queue, consumer, Worker and KV namespace. No temporary diagnostic resources remain active.
- **Final browser check still required:** the owner should reload the website or press **Refresh prices**. The previously failing backend is now confirmed working; the authenticated browser UI has not been observed by the assistant after the repair.
- **Automatic GitHub-push-to-Pages trigger remains unverified**. Pages source is GitHub-connected but verified deployments to date were explicitly triggered through the Cloudflare API.

## 9 November 2026 — International EODHD prices deployed (latest status)

- Encrypted `EODHD_API_KEY` was detected in the FRED Worker's secrets. No credentials were read or exposed.
- Permanent FRED Worker version `91c4de8c-017d-4319-accb-348eb292a661` exposes **two private named entrypoints**: original `WebsitePrices` for Alpaca and new `WebsiteInternationalPrices` for EODHD. Original OAuth/MCP/default entrypoint preserved; nine secret/KV bindings retained.
- Live read-only EODHD batch API returned **10/11 valid quotes**; a second test of the permanent named entrypoint returned HTTP 200, 10 valid, 1 missing. 2 ASX (AUD), 8 TWSE (TWD), **CBHB Malaysia unavailable**.
- New owner-JWT-protected Pages `/api/international-prices` route and `INTERNATIONAL_PRICE_PROVIDER` service binding deployed independently of the original Alpaca API/binding. No EODHD API token reaches the browser.
- The client retrieves both sources **every five minutes while open**; failure of one does not disable the other. EODHD returns native currencies, original observation timestamps and the **previous-close change** with explicit label; not a rolling 24-hour return.
- Published production Pages deployment `ef5ea292-8f30-4d34-8264-fbc55c3c3e2f`, built `28` latest ticker reports; **16/16 tests passed**, `PUBLISH_REPORTS=yes`, Access remains owner-only, and fail-open remains false.
- Temporary EODHD test consumer, queue, Worker, KV namespace and unused probe version were deleted.
- **Owner browser acceptance pending**: should show approximately 27 quote observations (17 US + 10 international) when all providers return verified data. CBHB stays unavailable.
- EODHD personal-use rights require owner-only display; do not grant prices to friends or publish their snapshots without an appropriate provider licence.
- GitHub-push-triggered rebuild remains independently unverified; every-five-minute API price refresh does **not** require rebuilds.

## 9 November 2026 — HTML reports integrated into five-minute checks

- Archive scanner accepts legacy `.md` and current standalone `.html` report filenames, including early `_chat_response.html` suffixes. Newest UTC archive wins by exact ticker across both bucket folders; HTML wins timestamp ties. Full HTML style, inline SVG chart and report sections are preserved, with executable scripts disabled in rendered site output.
- Verified first GitHub Actions workflow (`Publish HTML stock-report index`) **completed successfully** and committed `Website/live-reports.json` to `main` with 3 HTML files across 2 ticker identities, including newly saved nonhalal status-only `1519.TW`.
- A read-only Cloudflare Worker verified direct public raw GitHub URLs: the manifest returned **HTTP 200**, and the new report HTML returned **HTTP 200**. The REST tree endpoint returned **HTTP 403 due to anonymous shared-IP rate limits**, hence the permanent site now reads only the generated raw manifest.
- The existing dashboard checks the manifest and Alpaca/EODHD quotes in one five-minute cycle while open. New ticker rows are added and old report rows replaced from the manifest without rebuilding Cloudflare Pages. A separate owner-JWT-protected `/view-report` route serves newly saved standalone HTML.
- Security: owner-only Cloudflare Access and exact JWT gates are unchanged. Original repository `halal/` and `nonhalal/` archive files were never edited by development; only new user-plugin HTML files were read. No GitHub API token or Cloudflare deploy hook is needed for the live report index.
- Still verify a final owner-authenticated browser refresh, particularly the new report's HTML view and GitHub sync status banner. Five-minute check occurs while the browser is open/visible, **not** via a background cron when nobody is viewing the site.

## 9 November 2026 — Consolidated regular close vs indicative overnight comparison

- Completed the dual-session US market quote display requested by the owner. The website's **Latest price / 24h change** column now shows the latest validated **Alpaca derived overnight** price (explicitly indicative and 15-minute-delayed), the **last completed consolidated regular-session close** from Alpaca `delayed_sip`, and the price amount/percentage movement **between these two observations**.
- Existing IEX last-trade observation, its original timestamp and any eligible rolling-24h calculation are still shown separately. The new overnight-versus-close percentage **is NOT a rolling 24h change**.
- The private FRED Worker `WebsitePrices` named service entrypoint was updated to version `67570e53-5a3b-4e45-ab00-b21c82f32591`. It performs two additional optional batched read-only market data requests: `/v2/stocks/snapshots?feed=delayed_sip` and `/v2/stocks/trades/latest?feed=overnight`. Unsupported feeds or empty data do not suppress the existing US IEX prices.
- Regular close source is only used for a completed US session: an in-progress NY trading day uses `prevDailyBar` until 16:20 ET, allowing for the consolidated feed delay; the bar's **NY session date**, not its midnight timestamp, is labeled. Overnight quotes must be timestamped after that regular close, within the NY 20:00–04:00 session, and recent. Cross-feed movement is labeled as indicative, not executable or official.
- Cloudflare's live encrypted-key one-shot read-only diagnostic returned **HTTP 200** and two verified samples:
  - **NVDA**: regular close US$186.64, session **2026-11-06**, overnight US$178.45 at **2026-11-09T05:36:17Z**; **−US$8.19 (−4.388%)** versus regular close. The separate last IEX trade remained US$187.62.
  - **AAPL**: regular close US$342.37, session **2026-11-06**, overnight US$344.06 at **2026-11-09T05:18:51Z**; **+US$1.69 (+0.494%)**. The separate last IEX trade remained US$342.41.
- Published production Pages deployment `98900c46-ec89-4f9a-8aa8-52a43684efaf`, website commit `12e5e5b2d1a48c9f26d142edacc87cc6dfdceb1c`, **28/28 tests passed**, 28 latest report tickers. Original EODHD international pricing and GitHub five-minute HTML archive sync preserved.
- Access is owner-JWT-gated, Cloudflare Access applications remain active, fail-open remains false, and the nine original FRED Worker bindings remain inherited. No Alpaca credentials were printed or saved in GitHub.
- Removed the temporary private test consumer, Queue, Worker and KV namespace after successful acceptance; further browser-facing confirmation can be made by opening the owner-authenticated website.

## 9 November 2026 — EODHD polling stopped to protect free daily quota

- Website no longer calls `/api/international-prices` on opening, manual refresh, visibility change, or recurring five-minute checks. Only Alpaca US prices and GitHub HTML report index are refreshed.
- International Pages API is changed into an owner-protected HTTP 410 no-upstream-call stub. The production Pages `INTERNATIONAL_PRICE_PROVIDER` service binding is disabled. Original Cloudflare FRED Worker and encrypted EODHD secret remain unchanged and unused.
- International ticker rows and report ratings remain visible with Yahoo Finance link-outs, but no previously cached international quote is shown as live.
- `eodhd-candidates.json` reflects `feedEnabled:false` for all 11 and retains historical live validation metadata.
- Preserve GitHub report indexing, original report folders, and existing Alpaca and FRED Worker services.

## International personal delayed quote cache — 10 November 2026

**Current implementation:** GitHub Actions `.github/workflows/refresh-international-prices.yml` checks market hours every 20 minutes using `Website/market-exchanges.json`. While a tracked ASX, Taiwan TWSE, Bursa MYX or future verified exchange is in its regular weekday session, one Python runner uses `yfinance` to collect 5-minute Yahoo historical bar closes for all ticker folders in a batch (up to 25 Yahoo symbols per request). No individual ticker needs its own job, and the normal US Alpaca five-minute browser refresh continues unchanged.

**Sydney-time presentation:** Each ticker's regular exchange hours are converted by `Intl.DateTimeFormat` to Australia/Sydney (AEDT/AEST) at display time. Normal Monday–Friday sessions, including Malaysia's afternoon break, are observed. Market holiday calendars were deliberately removed at the owner's request. The softly glowing yellow/orange ticker shows *scheduled* trading hours, **not** verified holiday status, quote freshness or a trading recommendation. The UI updates the glow every minute while visible, without another price request.

**Private storage and authentication:** The Actions job obtains a short-lived signed GitHub OIDC JWT with audience `search-stocks-personal-yfinance-v1`. An independent Cloudflare Worker `search-stocks-international-ingest` validates GitHub issuer/signature and *exact repository, repository ID, main ref and workflow path*, then updates one `latest` record in private Cloudflare KV namespace `SEARCH_STOCKS_PERSONAL_INTERNATIONAL_QUOTES`. No Yahoo snapshots or secrets are committed to the public repository. The Pages API `/api/international-prices` reads that cache only for the authenticated owner, using the original strict Cloudflare Access JWT email validation. No EODHD API requests or credits are consumed. A quote uses the real Yahoo 5-minute bar timestamp and exact local currency, and is explicitly labeled delayed. Some Yahoo symbols may be unavailable, throttled or delayed; the cached quote must not be called real time. Personal-use and market-data terms remain applicable.

**Adding new tickers:** `Search_stock` records `market_schedule` in new non-US HTML snapshots, displays Sydney trading times, and updates `Website/market-exchanges.json` for any new verified exchange, with Yahoo ticker overrides where needed. The Actions collector discovers ticker folders from both classifications; the HTML index continues independently as before. New market schedule config requires a successful Cloudflare Pages deployment to refresh the browser's fallback hours registry. The stock report index itself still checks every 5 minutes while the tab is visible.

**Verification:** On 10 November 2026 Cloudflare Pages production deployment `e0d56126-f52c-41ac-8b83-ff039486ff90` succeeded, and GitHub Actions report-index regression run `42774512800` passed the full Node test suite, Python `py_compile`, normal trading-session preflight and report-index builder. The first actual yfinance data-collection run and authenticated-browser price display require separate receipt checks; passing tests alone is not proof of live quote acquisition.
