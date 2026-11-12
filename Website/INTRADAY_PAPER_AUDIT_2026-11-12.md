# Intraday pilot: extended IEX historical paper audit
Research date: 12 November 2026. **Not a live system. No trades placed.**

## Scope and reproducibility

- Primary tickers: MU, NVDA, AMD, AAPL. Sector/broad benchmarks: SOXX, SPY and QQQ.
- Provider: the connected Alpaca paper-data API, **IEX-only 5-minute historical bars**; data windows start 10–12 calendar days before each evaluated month to provide five previous same-time volume profiles.
- Evaluated period: **3 August through 11 November 2026**. The four monthly groups below cover August, September, October and the first eight US sessions of November.
- Historical data were requested in **small per-symbol, per-window batches**, rejecting pagination-incomplete responses. No raw source bars or sensitive account data were uploaded to this public GitHub repository.
- Price engine: Website/lib/intraday-signals.mjs; replay: Website/scripts/backtest-intraday.mjs; paper fills: Website/lib/paper-long.mjs; identical baseline comparison: Website/scripts/paper-backtest.mjs.
- The rule produces at most the **first qualified signal per ticker per session**, and separates downside **SELL_RISK warnings** from bullish paper buys.

### Paper assumptions (not actual market execution)

Every qualified BUY_CANDIDATE is reviewed **only after its five-minute signal bar completes**. The model attempts a long fill at the **NEXT** bar's IEX opening observation, never at the already-completed breakout close. It skips opening back below the trigger, gaps more than **0.75%** above the signal close, or initial planned stop distances over **3%**. Stops use the opposite 30-minute opening-range extreme; profit target is **1.5x planned stop risk**. If stop and target both touch inside one five-minute bar, the stop wins. A gap through the stop exits at the worse available opening observation. Every simulated entry and exit is charged an illustrative **8 basis points per side**, for 16 basis points round trip. This is **not a verified IBKR commission/spread model**; real spreads, queue position, market impact, suspensions, taxes and missed fills are not reconstructed.

### Month-by-month results

| Evaluated month | Qualified BUY candidates | Simulated long fills | Positive net paper fills | Mean net % per filled trade | Baseline breakout fills | Baseline positive / fills | Baseline mean net % |
|---|---:|---:|---:|---:|---:|---:|---:|
| August 2026 | 0 | 0 | — | — | 24 | 11/24 | −0.083% |
| September 2026 | 5 | 3 | 3/3 | +0.406% | 34 | 16/34 | −0.183% |
| October 2026 | 2 | 2 | 1/2 | −0.538% | 40 | 15/40 | −0.291% |
| November 1–11, 2026 | 2 | 0 | — | — | 4 | 1/4 | −0.792% |
| **Combined** | **9** | **5** | **4/5** | **+0.028%** | **102** | **43/102** | **−0.226%** |

There were also **nine downside SELL_RISK alerts** across these four groups, but these were **not short trades** and must not be counted as profits.

Among the five simulated pilot long fills: three were from September (AMD once, AAPL twice) and two from October (NVDA twice). MU produced no filled pilot longs. Four other bullish candidates were rejected because the required initial stop distance exceeded 3%. The five filled trade outcomes were approximately +0.141%, +0.582%, +0.496%, −1.487%, and +0.411% net. Their arithmetic mean was **+0.0283%**, before portfolio taxes, funding, non-modeled spread/impact, any brokerage-specific commissions or delayed fills. The sum of five separate percentage trade outcomes is **not a portfolio return**.

### Sensitivity to assumed costs (same five paper fills)

Repricing the *same five simulated entry/exit observations*, without changing trade eligibility, produces:

| Assumed total cost per side | Mean net paper outcome per fill |
|---|---:|
| 0 bps | +0.189% |
| 8 bps (base case) | +0.028% |
| **10 bps** | **−0.012%** |
| 12 bps | −0.052% |
| 15 bps | −0.112% |
| 20 bps | −0.211% |

These are arithmetical stress estimates from the rounded recorded five-trade results, **not actual brokerage quotations**. A mere **two extra basis points per side** reverses the apparent mean. That sensitivity is an additional reason to reject a profitability claim.

### What the results do and do not mean

1. The filtered candidate universe was **far smaller** than baseline (nine versus 140 signals, only five modeled long fills). A four-of-five favourable count is statistically weak; approximate 95% Wilson interval for the underlying win rate spans **about 38%–96%**. It cannot be interpreted as an 80% expected win rate.
2. The pilot's +0.028% arithmetic result is much smaller than realistic uncertainties around IEX-only pricing, bid/ask spreads and execution. A modest increase in assumed costs may eliminate it.
3. The baseline is contextual, not randomized. It does not establish that the more complex filter is superior on risk-adjusted return or after realistic live fills. The two strategies have very different trade frequencies and market-day eligibility.
4. The comparison is **NOT a true forward-only, never-before-seen holdout**: the pilot rule and thresholds were devised after reviewing some October/November moves. The available sample also omits a timestamp-complete historical **news feed**. Real governance, macro and earnings alerts may suppress or alter the technical signals.
5. The position simulator assumes a research long only, not an investor's actual stock holding. A SELL_RISK signal asks for a risk review; it does not authorize shorting, an exit order, or selling a long-term investment.

## Release verdict: NOT VALIDATED

Keep the Worker disabled, with no live BUY/SELL-style UI and no brokerage order execution. An adequate release decision requires multi-year walk-forward history, verified point-in-time news/event corpus, reliable consolidated or appropriately licensed data, correct market holidays/earnings events, realistic IBKR fees and spreads, genuine prospective paper-trade logging, and error/latency monitoring. Do not use this small and retrospective paper sample to infer profitability.

Run the code locally with legitimately licensed data using:

```bash
cd Website
npm test
node scripts/paper-backtest.mjs /absolute/path/to/private-iexbars.json
```

The input is the same private JSON structure as in INTRADAY_SIGNALS_V1.md. Only test results and public methodology—not the proprietary raw feed—are stored in this repository.
