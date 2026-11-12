# Intraday signals v1 — research pilot (12 November 2026)

**Status: EXPERIMENTAL / NOT DEPLOYED / NO EXECUTION.** This branch adds a read-only engine and an offline replay script. It does not activate live alerts, broker orders, new stock ratings or proven profitable trades. No old HTML archives are rewritten and no licensed bar history is committed to the public repository.

## Purpose

An initial review of MU and NVDA during 2–11 November 2026 found both continuing and failing opening-range breakouts. News about material company-specific risks can override bullish charts. This pilot separates intraday research from the established A–H investment report, Shariah classification, long-horizon scores, and long-term sell / take-profit plan.

## Signal engine

Source: Website/lib/intraday-signals.mjs — evaluateIntradaySignal(input).

Required input:
- ticker, asOf (ISO UTC), feed (IEX or SIP), sectorFeed, broadFeed.
- bars, sectorBars, broadBars: completed 5-minute US regular-session candles, each with t (UTC **bar start**), o, h, l, c, v and vw.
- historicalDays: at least five earlier same-feed sessions with day, feed and bars. Same-clock relative volume uses cumulative volume through the *completed* 5-minute bar divided by the average cumulative volume at that time for those five earlier sessions.
- events: optional attributable negative material events, with publishedAt, direction, severity, verification (confirmed or reported), and sourceUrl (HTTPS). Future or un-attributed events cannot be promoted as confirmed.
- position: optional explicit long position entryPrice, stopPrice and takeProfitPrice for a separate exit review. No position is inferred.

Output categories: RISK_ALERT, BUY_CANDIDATE, SELL_RISK, WAIT, NO_DATA, MARKET_CLOSED, EXIT_RISK and TAKE_PROFIT_REVIEW. Every result explicitly carries validated:false and execution:RESEARCH_ONLY_NOT_EXECUTABLE. SELL_RISK means downside caution / existing-long exit review, not a recommendation to sell short.

A BUY_CANDIDATE needs a **new**, completed five-minute close above the first 30-minute high, price above VWAP, relative volume at least 1.5, and matching positive sector and broad-market moves. SELL_RISK applies the corresponding downside conditions. Recent material attributable negative news suppresses bullish signals. Missing timestamps, opening bars, same-feed history, aligned benchmarks, valid session times or a completed/fresh candle must fail closed to NO_DATA, WAIT or MARKET_CLOSED. A signal has an ID for caller-side deduplication; nothing is delivered as a live notification in this version.

## Offline replay

Run from Website with a local JSON file of legitimately licensed five-minute historical bars:

~~~sh
npm test
node scripts/backtest-intraday.mjs /absolute/path/to/private-5min-bars.json
~~~

Minimal JSON shape (illustrative, **insufficient** for analysis until complete multi-day data exists):

~~~json
{"feed":"IEX","bars":{"MU":[],"NVDA":[],"AMD":[],"AAPL":[],"SOXX":[],"QQQ":[],"SPY":[]},"events":{}}
~~~

Historical input must contain a chronology of sessions, with regular session bars and benchmark observations. The script replays bars in timestamp order and computes signed *directional* moves from candidate timestamp to that day's close, not actual executions or investment returns. Keep licensed datasets private. The script does not query any third-party service.

## Exploratory historical audit — no statistical validation

Alpaca IEX 5-minute historical bars were inspected for MU, NVDA, AMD, AAPL, SOXX, QQQ and SPY from **26 October through 11 November 2026** (13 US sessions). An initial first-opening-range-breakout audit, using rolling five-prior-session cumulative volume and sector/broad filters, produced the following illustrative counts:

| Metric | First breakout, unrestricted | Combined filters |
|---|---:|---:|
| Observations | 27 | 5 |
| Positive signed outcomes | 17/27 (63%) | 2/5 (40%) |
| Average signed outcome | +0.873% | +1.257% |

The audit used an idealized opposite-opening-range stop and no fees, spread, slippage, delays, missed fills, tax or capital constraints. These are **NOT actual strategy returns**. Five selected observations and 2 successes cannot validate a signal rule; the positive mean is fragile and influenced by outliers. This was a related rule audit, NOT a full point-in-time replay using the exact checked-in engine. Treat any apparent improvement as unproven.

Examples:
- MU and NVDA on 5 November: downside breaks continued, but significant earlier losses had already occurred.
- MU on 10 November: upside breakout with weak relative volume reversed.
- MU on 11 November: first upside break was followed by +2.14% to the IEX session end but lacked the proposed simultaneous volume and sector confirmation. **It would NOT have been a confirmed v1 buy.**
- NVDA on 11 November: first upside break was followed by roughly -1% to the IEX session end, despite an initially constructive session.

## Validation requirements before live display

1. Obtain an appropriately licensed, timely intraday OHLCV feed for symbols and benchmarks. Today's latest IEX trade plus five-minute website refresh is insufficient to recreate correctly completed bar histories or reliably timed alerts.
2. Build point-in-time news ingestion, distinguish unconfirmed reporting from issuer verification, account for market holidays and after-hours events.
3. Evaluate multiple years across up/down/sideways regimes in walk-forward tests. Benchmark against plain opening-range rules. Include realistic latency, transaction costs, spreads, stop slippage and invalid fills; provide uncertainty intervals.
4. Paper trade with recorded timestamped decisions and study false alerts, drawdowns and event overrides.
5. After those gates, add a separate owner-only intraday card to the website and an optional snapshot object to reports, without altering version-2 investment actions, scores, entries, targets or Musaffa screening.

**Until explicitly validated and deployed, the correct displayed state is NOT ACTIVE / NO VERIFIED LIVE SIGNAL.** Never silently convert unavailable or stale data into BUY or SELL.
