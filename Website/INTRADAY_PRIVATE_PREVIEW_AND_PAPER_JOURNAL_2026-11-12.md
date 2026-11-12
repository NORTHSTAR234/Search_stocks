# Private intraday preview & prospective paper journal — first acceptance
**12 November 2026 (Australian AEDT), Cloudflare execution at 07:42 UTC.**

## Summary

The existing Pages project `search-stocks-research` has `preview_deployment_setting=none`. Its **preview** environment has **no owner Access environment variables**. Accordingly, no publicly routable preview website was created and **no preview Pages service binding** was added. The existing production Pages project, `main`, and `PRICE_PROVIDER` remain unchanged.

Instead, a **temporary account-authenticated Cloudflare Workflows execution** privately called a new `IntradayPrivatePreview.snapshot(["MU","NVDA"])` named service binding on the already isolated, credential-bearing Cloudflare Worker. This was a single explicitly authorized **read-only research inspection**. All HTTP default handlers returned 404 and workers.dev + preview URLs were disabled.

## Live private research result (unvalidated)

Workflow instance `cf_15d96bf32ab7dd814d87c42ffbd967f1ddab68fdd9f922b9635671d44bb20a04` completed successfully with **one step, no retries, no orders**, result as of **2026-11-12T07:42:08.226Z**.

| Ticker | Research status | Reasons / research-only interpretation | News coverage | Prior valid historical sessions |
|---|---|---|---|---:|
| MU | `MARKET_CLOSED` | `OUTSIDE_REGULAR_SESSION`, no open intraday candidate | `PARTIAL` | 5 |
| NVDA | `RISK_ALERT` | `RECENT_MATERIAL_NEGATIVE_NEWS`, a **reported, unverified** `LEADERSHIP_DISRUPTION` risk classification, **not a recommendation to sell** | `PARTIAL` | 5 |

The 48-hour news feed reached its configured pagination cap, so risk screening is **incomplete**. No provider headline may be treated as independently verified. The pilot was run outside US regular trading hours. No BUY_CANDIDATE, SELL_RISK, or executable trade occurred; the result is **not evidence of a profitable strategy**.

The Workflow returned only tickers, category/reason codes, as-of and observation timestamps, feed names and completeness flags. It did not return raw price candles, entry/exit numbers, news bodies, Alpaca credentials, account metadata or order instructions.

## Private paper journal

Created independent Workers KV namespace **`SEARCH_STOCKS_INTRADAY_PAPER_JOURNAL`** with no public URL. Cloudflare read-back verified **two actual paper observations** at `2026-11-12T07:42:11.344Z`:

- `paper:2026-11-12T07:42:08.226Z:MU` — `MARKET_CLOSED`.
- `paper:2026-11-12T07:42:08.226Z:NVDA` — `RISK_ALERT` with risk code `LEADERSHIP_DISRUPTION`, **reported only**.

Each record is labeled `paperOnly=true`, `unvalidated=true`, `feed="IEX"`, and uses a **90-day expiration**. Neither is a paper long trade; the initial **paper trade count is zero**. This is a truly prospective timestamped observation, not a reconstructed historical signal.

### Future scoring

`Website/scripts/score-paper-journal.mjs` accepts a *privately exported sanitized journal* and licensed historical IEX bars. It reconstructs opening-range setup prices only **after** a previously recorded BUY candidate, rejects missing/partial sessions or unmatched signal times, and uses the conservative `paper-long.mjs` fill assumptions. Crucially, if the cloud record was captured **after** the next five-minute bar already opened, it refuses the impossible retroactive fill rather than pretending it was executable. It does not count MARKET_CLOSED or RISK_ALERT observations as trades.

Local owner-only command (never commit private raw bars or dump the KV journal into GitHub):

```bash
cd Website
npm test
node scripts/score-paper-journal.mjs /private/journal.json /private/iex-bars.json
```

Paper scoring assumes a deliberately pessimistic next-candle-open/no-chase model with illustrative costs; it is **not IBKR execution or a trading P&L**. A future prospective candidate must be observed **during** the US session, timestamped at source, and matched to later completed bars before any scoring can be made. Sample size at this checkpoint: **two observations, zero trades**.

## Deployment and privacy receipt

After the two records were read back:

1. Reuploaded `search-stocks-intraday-research-disabled` with `bindings_inherit=strict` and only `INTRADAY_RESEARCH_ENABLED="disabled"`; the short-lived diagnostic arm was removed. Encrypted `ALPACA_API_KEY_ID` and `ALPACA_SECRET_KEY` are preserved, values never accessed.
2. Deleted temporary Cloudflare Workflow **`search-stocks-intraday-paper-preview-once`**.
3. Deleted its temporary credential-free Worker of the same name after verifying it had no public route or secrets.
4. Retained only the **private, minimal 90-day paper journal** and the original disabled research Worker. No Cron or background recorder is enabled; there will be **no further observations unless a future run is explicitly triggered**.
5. Existing production Pages, the original price Worker, and the unrelated international-quote Worker are unchanged.

The research model is still **NOT VALIDATED** for live investment decisions. A protected web preview would require an explicit Access policy for preview domains, JWT verification, and fresh preview-only bindings; the present Pages preview is not configured for those controls. Do **not** enable public BUY/SELL alerts or trading execution.
