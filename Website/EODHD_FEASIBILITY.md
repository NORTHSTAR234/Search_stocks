# EODHD delayed international quotes — live acceptance

Status: **DEPLOYED FOR 10/11 INTERNATIONAL LISTINGS** · 9 November 2026

## Verified live API results

The owner installed `EODHD_API_KEY` as an encrypted Cloudflare Worker secret. An authenticated, one-shot read-only EODHD batch request via a private service binding returned **HTTP 200** and **10 valid international quotes** out of **11 exact tickers**:

- **ASX:** ORG → ORG.AU and APA.AX → APA.AU, quote currency **AUD**, approximately 20-minute delayed at the test time.
- **TWSE:** 1519.TW, 2330.TW, 2377.TW, 2379.TW, 2383.TW, 2449.TW, 2454.TW, 3034.TW, quote currency **TWD**, approximately 20–22-minute delayed at test time.
- **Bursa Malaysia:** CBHB → 0339.KLSE was included and recognized but returned **no usable positive intraday price**, so it remains `LIVE DATA UNAVAILABLE`, with a Yahoo link-out. Do not fabricate or substitute a US-listed proxy.

A second read-only live test of the *permanent* `WebsiteInternationalPrices` named Worker entrypoint returned **HTTP 200, 10 verified, 1 missing (CBHB)**. The new Pages `INTERNATIONAL_PRICE_PROVIDER` binding is separate from the existing `PRICE_PROVIDER` (Alpaca) binding.

The current website build includes a separately authenticated `/api/international-prices` route. Both routes verify the owner's Cloudflare Access JWT **cryptographically** and exact owner email before invoking backend service bindings. The EODHD API token is **never sent to the browser or committed to GitHub**. Production/preview hostname Access policies remain in place. The new 16/16 website unit/integration build tests passed.

## Price and market-time handling

- EODHD source `timestamp` is Unix seconds, the quote's original observation time in UTC, shown in Melbourne local time on the dashboard.
- Prices are **delayed** (typically 15–20 min during trading), refreshed by client every **5 minutes** while the page is visible. Delayed data is not guaranteed to be only 5 minutes old.
- The EODHD `change_p` field means **change versus the previous trading session's closing price**. It is displayed explicitly as **vs prev close** and **not misrepresented as a 24h return**; the rolling 24h figure remains `N/A` for these markets.
- The gateway verifies exact provider symbol, native currency and exchange, rejects invalid, zero, future, >7-day-old and mismatched observations, and never substitutes report archival prices.
- **Alpaca US quotes remain independent**; a temporary failure of either provider does not clear the other provider's verified quotes.
- After closing the page, the browser makes no new requests. Returning to a visible page or pressing **Refresh prices** fetches observations again.

## Pricing, limits and licensing

The currently connected EODHD key's **live delayed quote entitlement is verified for ASX and TWSE**, but no purchase details or subscription amount were inspected or inferred.

The EODHD personal-use licence allows displaying prices to **the account owner on their own devices** only. Friends, family, other Access users, public dashboards, shared spreadsheets or downstream data distribution are **not permitted without an appropriate commercial licence**. The new Pages API additionally rejects any non-owner JWT even if they later receive website Access.

One batch request covers up to 11 exact international symbols; EODHD usage accounting is per **instrument**, even in a batched HTTP request. If a single browser tab stays visible 24 hours, polling 11 symbols every 5 minutes could consume **3,168 ticker-data credits/day**. Only the site owner's active browser requests prices; there is no background Cloudflare cron. Monitor account usage to avoid exceeding subscription limits.

## Cleanup and pending checks

The temporary test Queue, consumer, Worker, KV and unused temporary Worker version have been deleted. No public EODHD probe endpoint remains.

Remaining: owner browser sign-in and one refresh to verify the expected **27 quote observations** (17 Alpaca + 10 EODHD) under current data availability. Actual counts vary if provider responses or exchanges are unavailable. Confirm newer quotes during market hours.

Automatic GitHub-push-to-Pages deployment remains a separate pending issue. EODHD **API quote refreshing does not require a GitHub deployment** for every quote update.

## Sources

- https://eodhd.com/financial-apis/live-ohlcv-stocks-api
- https://eodhd.com/help/personal-use
- https://eodhd.com/help/plans
- `Website/eodhd-candidates.json` — precise instrument mappings and observed availability
