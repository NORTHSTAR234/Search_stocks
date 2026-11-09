# EODHD feasibility — international quote coverage

Verified date: **9 November 2026**. This is a **catalogue/entitlement feasibility check**, not a verified quote-feed acceptance.

## Findings

- EODHD's official catalogue provides an issuer page for **all 11 international symbols** from the GitHub report archive: 2 Australia, 8 Taiwan, 1 Malaysia.
- EODHD's `/api/real-time/{SYMBOL}?api_token=...&fmt=json` endpoint advertises **15–20-minute-delayed worldwide equities**. The `timestamp` must be shown as the observation time. The `close` is the latest delayed snapshot; `change_p` is **relative to the previous session close, NOT a rolling 24-hour return**.
- A single HTTP batch request can include multiple symbols through `s=`, with 15–20 symbols recommended. **API credits are billed per ticker**, even when one HTTP request contains all 11. A dashboard polling 11 symbols every five minutes around the clock would incur **3,168 ticker-call credits/day**; an owner-visible-only tab generally uses less.
- EODHD's free trial/demo token permits **six demonstration instruments only** (US equities, a fund, forex, crypto) and **cannot test the delayed quotes for these 11 international securities**. The registered free tier offers **20 API calls/day and one year of historical EOD data**, not ongoing 5-minute delayed quotes for the full international watchlist. No EODHD key is presently present in Cloudflare.
- Advertised paid **All World EOD Historical Data** plan begins at **US$19.99/month** and includes Live (Delayed), with 100,000 ticker-call credits/day. **No plan has been purchased or configured.**
- EODHD personal-use terms permit personal display to the owner on their own devices, but **not display or distribution of feed prices to friends, even through an otherwise private website**. Obtain express vendor authorisation/commercial licensing before sharing data beyond the owner.
- Some public EODHD issuer pages expose historical or stale snapshot dates. **A listed instrument page does not prove the quote endpoint currently provides timely or accurate 15–20-minute data**. Live endpoint test is still required with an entitled key.

## Exact instrument mapping

| Archive ticker | EODHD ticker | Quote currency | Provider catalogue identity |
|---|---|---|---|
| ORG | ORG.AU | AUD | [Origin Energy Ltd](https://eodhd.com/financial-summary/ORG.AU) |
| APA.AX | APA.AU | AUD | [APA Group](https://eodhd.com/financial-summary/APA.AU) |
| 1519.TW | 1519.TW | TWD | [Fortune Electric Co Ltd](https://eodhd.com/financial-summary/1519.TW) |
| 2330.TW | 2330.TW | TWD | [Taiwan Semiconductor Manufacturing Co Ltd](https://eodhd.com/financial-summary/2330.TW) |
| 2377.TW | 2377.TW | TWD | [Micro-Star International Co Ltd](https://eodhd.com/financial-summary/2377.TW) |
| 2379.TW | 2379.TW | TWD | [Realtek Semiconductor Corp](https://eodhd.com/financial-summary/2379.TW) |
| 2383.TW | 2383.TW | TWD | [Elite Material Co Ltd](https://eodhd.com/financial-summary/2383.TW) |
| 2449.TW | 2449.TW | TWD | [King Yuan Electronics Co Ltd](https://eodhd.com/financial-summary/2449.TW) |
| 2454.TW | 2454.TW | TWD | [MediaTek Inc](https://eodhd.com/financial-summary/2454.TW) |
| 3034.TW | 3034.TW | TWD | [Novatek Microelectronics Corp](https://eodhd.com/financial-summary/3034.TW) |
| CBHB | 0339.KLSE | MYR | [CBH Engineering Holding Berhad](https://eodhd.com/financial-summary/0339.KLSE) |

## Release criteria (NOT MET)

1. Obtain a personal EODHD API key with delayed international quote entitlement. Store only as an encrypted Cloudflare Worker secret; never commit it to GitHub or send it in chat.
2. Run a **read-only, one-shot API batch** for all 11 symbols and verify exact issuer/exchange mapping, non-zero price, currency and source Unix timestamp against source exchange hours, and per-ticker entitlement errors.
3. Reject zero/null/stale observations, weirdly large data lags and alternate listing proxies; report missing tickers separately, never synthesize prices. A 15–20-minute vendor delay can coexist with a 5-minute browser refresh.
4. Display vendor **previous-close change** separately and explicitly (not as a rolling 24-hour change); only calculate rolling 24-hour changes if a comparable historical observation from the same feed/session/adjustment basis is available.
5. Preserve current Alpaca US quotes, existing named `WebsitePrices` service binding, owner-only Cloudflare Access and original research archive. Do not enable an EODHD feed until entitlement and licensing are established.
6. Do not show EODHD prices to friends without vendor permission.

## Sources

- https://eodhd.com/financial-apis/live-ohlcv-stocks-api
- https://eodhd.com/financial-apis/exchanges-api-list-of-tickers-and-trading-hours
- https://eodhd.com/pricing
- https://eodhd.com/help/plans
- https://eodhd.com/help/personal-use
- Each EODHD catalogue listing linked in the table above.

**Current website behavior:** Alpaca US prices continue refreshing every five minutes while the tab is visible. International quotes remain unavailable within the table, with existing Yahoo link-outs; this feasibility file does not enable automatic non-US price fetching.
