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
