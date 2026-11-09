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
