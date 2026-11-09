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
