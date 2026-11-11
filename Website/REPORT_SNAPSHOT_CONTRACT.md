# Search_stock HTML Snapshot Contract v2 (canonical keys)

The **single canonical, machine-readable field contract** for every **new** Search_stock HTML archive. **From Aya v3.5 onward, Musaffa screening is informational, not a research gate:** all properly identified tickers receive full financial research, and screening status is independently displayed with GREEN/YELLOW/RED colours. GitHub Actions reads it through `Website/lib/report-archive.mjs` and produces `Website/live-reports.json`. This document is shared by the website parser, the GitHub `Aya_Prompt.md` and the private `Search_stock` skill.

## Exact placement

Embed **one** inert JSON object inside the complete HTML5 report, with the exact identifier:

```html
<script type="application/json" id="aya-report-snapshot">
{ ... JSON object ... }
</script>
```

Produce the same report values visibly in the main HTML cards/tables. JSON keys are **case-sensitive** and must not be renamed, translated, omitted or swapped for synonyms. The HTML is still a full readable report, not a JSON-only report. Escape literal closing script sequences in serialized values. Do not embed secrets.

## Required exact keys for new full investment reports

All the following fields are required. If a financial value cannot legitimately be established, use JSON `null` instead of inventing a number; still include the key and show `NOT RATED` / `NOT VERIFIED` as appropriate in the visible HTML and dashboard. A missing, stale, doubtful or non-compliant Musaffa classification must NEVER suppress otherwise supportable business research; use normal financial values or null for genuinely missing market data.

```json
{
  "schema_version": 2,
  "ticker": "PG",
  "canonical_archive_ticker": "PG",
  "source_market_ticker": "PG",
  "exchange": "NYSE",
  "company": "The Procter & Gamble Company",
  "currency": "USD",
  "report_utc": "2026-11-09T21:27:38Z",
  "report_type": "full",
  "musaffa": {
    "classification": "HALAL",
    "grade": "A-",
    "screening_date": "2026-08-10",
    "gate": "PASS"
  },
  "actions": {
    "new_position": "WATCH",
    "existing_holder": "HOLD"
  },
  "risk": "MODERATE",
  "scores": {
    "investment": 73,
    "entry": 35
  },
  "next_earnings": {
    "date": "2027-01-20",
    "confirmed": false
  },
  "entry": {
    "preferred_low": 147,
    "preferred_high": 154,
    "acceptable_low": 155,
    "acceptable_high": 161,
    "no_chase": 168
  },
  "targets": {
    "stop": 139,
    "tp1": 172,
    "tp2": 182
  }
}
```

**The example above illustrates the structure and uses historical PG report numbers. It is not a fresh investment recommendation.** Replace with newly verified numbers and security information for the requested instrument; preserve the same keys.

### Field meaning, exact spelling and types

| JSON key | Type | Usage |
|---|---|---|
| `schema_version` | number `2` | Activates strict v2 contract validation in the parser |
| `ticker` | string | Must exactly equal canonical folder name and filename prefix |
| `canonical_archive_ticker` | string | Identical to `ticker`; e.g. `ORG.ASX`, `1519.TWSE`, `CBHB.MYX`; unsuffixed US ticker `NVDA` |
| `source_market_ticker` | string | Exact symbol required by price data/Musaffa source (can differ from archive ticker, e.g. `ORG.AX`) |
| `exchange` | string | Actual listed exchange, e.g. NYSE, NASDAQ, ASX, TWSE, MYX |
| `company` | string | Verified company or ETF legal/display name |
| `currency` | string | Native trading currency ISO 4217, such as USD, AUD, TWD, MYR |
| `report_utc` | string | Timestamp in valid ISO 8601 UTC, consistent with filename |
| `report_type` | string | **`full` for EVERY newly researched ticker**, in either `halal/` or `nonhalal/`, regardless of Musaffa result; `screening_only` is only for immutable legacy screening records |
| `musaffa.classification` | string or null | First-party Musaffa status, **not inferred** |
| `musaffa.grade` | string or null | Exact grade when verified; else null |
| `musaffa.screening_date` | `YYYY-MM-DD` string or null | Official attributable screening date (not quote/crawl date) |
| `musaffa.gate` | string | Historical-compatible *screening assessment* `PASS`, `STALE`, `UNVERIFIED` or `FAIL`, **not permission to do financial research** |
| `actions.new_position` | string or null | New-buyer rating `BUY`, `BUY GRADUALLY`, `WATCH`, `AVOID` or `INSUFFICIENT DATA` |
| `actions.existing_holder` | string or null | Holder rating `ADD`, `HOLD`, `REDUCE`, `SELL` or `INSUFFICIENT DATA` |
| `risk` | string | Assessed risk level, `NOT RATED` if no financial research |
| `scores.investment` | integer 0–100 or null | Fundamental investment score; not a probability |
| `scores.entry` | integer 0–100 or null | Entry attractiveness score; not a probability |
| `next_earnings.date` | `YYYY-MM-DD` string or null | Exact upcoming earnings date only when verified/credible |
| `next_earnings.confirmed` | boolean or null | true = issuer confirmed, false = estimated, null = uncertain |
| `entry.preferred_low` / `entry.preferred_high` | numbers or null | Preferred buy range bounds in native currency |
| `entry.acceptable_low` / `entry.acceptable_high` | numbers or null | Acceptable buy range bounds in native currency |
| `entry.no_chase` | number or null | Do-not-chase price level |
| `targets.stop` | number or null | Initial stop-loss **reference**, not a guaranteed execution price |
| `targets.tp1` / `targets.tp2` | numbers or null | Target profit-taking levels |

Recommended optional `musaffa` detail fields for clarity: `assessment` = `VERIFIED_HALAL`, `VERIFIED_NONCOMPLIANT` or `INCONCLUSIVE`, `screening_period` = `YYYY-MM` when only the official month is known, `source_url` = verified Musaffa page, `cutoff_utc` = four-month UTC cutoff, `reason` = concise evidence explanation. Keep the four required `musaffa` keys and never fabricate a day for month-only evidence. **Colour mapping:** GREEN verified recent halal, RED verified recent explicit noncompliant, YELLOW every other status (including stale, doubtful, inaccessible, undated or conflicting). Website derives colour from classification/date and must not treat a `nonhalal/` bucket as a screening-only report. The investment-action badge and screening badge are independent.

Optional additional evidence can be included in clearly named supplemental objects such as `quote`, `technical`, `dividend`, `chart_observations`, `sources`, and `historical`. Do not substitute these optional objects or alias names for the required fields.

**Do not use alternate new-report keys** such as top-level `investment_score`, `entry_score`, `new_buyer_action`, `holder_action`, `existing_holder_action`, `entry_preferred`, `preferred_buy_zone`, `screening.status`, `musaffa.screen_date`, `musaffa.date`, or a free-text `earnings` field **in place of** canonical keys. The website parser still reads those variants for **existing archived legacy reports only**.

## Full HTML reports in BOTH screening buckets — mandatory from Aya v3.5

**Do not create new `screening_only` reports merely because the Musaffa status is not recently verified halal.** Always produce a full A–H report using `report_type: "full"`, the normal independently derived `actions`, `scores`, `next_earnings`, `entry` and `targets` fields and the required snapshot, under:
- `halal/<TICKER>/<TICKER>_YYYY-MM-DD_HH-mm-ssZ.html` when Musaffa provides a recent explicit HALAL classification (GREEN).
- `nonhalal/<TICKER>/<TICKER>_YYYY-MM-DD_HH-mm-ssZ.html` for INCONCLUSIVE (YELLOW) or verified explicit NOT HALAL (RED) screenings.

A full report in `nonhalal/` is NOT automatically a screening-only record. It has market price, scores and research wherever independently sourced. Shariah status never automatically determines the investment action. Show financial recommendations separately from Shariah eligibility; do not recommend a verified non-compliant instrument *as a halal holding*.

**Historic `screening_only` HTML:** immutable archives created under the former hard-gate policy remain parseable. Their canonical keys should contain null financial data and the website must continue showing SCREENING ONLY for those historical files, until a newer full report is saved. Do not alter or backfill archived research.

## Pre-save and post-save acceptance checks

1. Retrieve the exact latest `Aya_Prompt.md`, this contract, and current Search_stock skill rules before writing.
2. Verify the canonical ticker in **both** filename and JSON keys; confirm exchange/listing and source ticker separately.
3. Verify `schema_version: 2` and all required exact field names, types, nested structures, valid JSON and user-visible figures. No contradictory scores/actions or invented values.
4. Evaluate the official Musaffa four-calendar-month recency without stopping research; verify the RED/YELLOW/GREEN status agrees between the visible HTML and JSON. Reject contradictions. New nonhalal reports MUST be `full` when researched; old `screening_only` remains read-only.
5. Confirm all applicable entry and stop/target fields reflect the actual report; use nulls for unavailable financial metrics, never silent `0` or guessed values.
6. Before GitHub save, re-read the JSON and perform equivalent validation to `snapshotFromHtml` in `Website/lib/report-archive.mjs`. **If invalid, do not archive it**; correct before saving.
7. Save the full original HTML `halal|nonhalal/<TICKER>/<TICKER>_YYYY-MM-DD_HH-mm-ssZ.html` on `main`. Never overwrite historical reports.
8. Verify exact saved bytes, GitHub Actions workflow status, and exact `Website/live-reports.json` row identity (latest report per ticker). **HTML SAVED** is not the same as **INDEXED / READY FOR WEBSITE REFRESH**.

### Guaranteed compatibility strategy

The website parser accepts canonical **v2** reports and supports old `schema_version`-absent report variations for archive backward compatibility. Future Search_stock reports **must always use v2**, not alternate legacy property names. The parser's automated tests check the canonical contract and the original PG, JNJ, AAPL and XOM formats so that a field-name change cannot silently turn rated stocks into `NOT RATED` again.


## Optional market-schedule metadata (mandatory for new non-US HTML reports)

The v2 required snapshot fields above do **not** change. For new international HTML reports, add a top-level `market_schedule` object with **exact keys**:

```json
{"exchange":"ASX","mic":"XASX","market_time_zone":"Australia/Sydney","sydney_time_zone":"Australia/Sydney","weekdays":[1,2,3,4,5],"sessions":[{"start":"10:00","end":"16:00"}],"yahoo_ticker":"ORG.AX","hours_source":"https://www.asx.com.au/markets/market-resources/trading-hours-calendar/cash-market-trading-hours","hours_checked_utc":"2026-11-10T00:00:00Z"}
```

The above is a schedule-shape example, not a quote. `sessions` must contain the **EXCHANGE-LOCAL** opening/closing hours (not static Sydney conversions). The website converts on each display date with IANA timezone `Australia/Sydney` so AEDT/AEST daylight saving changes automatically. The visible report must also print Sydney-local regular hours. Use documented source times, normal trading weekdays, and session breaks. The owner intentionally chose NOT to consult holiday calendars, so session indicators are scheduled-hours estimates, not proof of an exchange being open. The `yahoo_ticker` is the actual Yahoo symbol and may differ from canonical storage ticker. Legacy screening-only records may include administrative metadata without prices; from v3.5 new red/yellow reports are FULL financial HTML and include verified financials regardless of Shariah status.

For **new international exchanges**, the verified `market_schedule` object in the HTML v2 snapshot is sufficient to auto-register the exchange in the price collector, without manually editing a registry or workflow. The exchange-local timezone, weekday sessions, true source market/Yahoo ticker and native currency MUST be verified and exact. `Website/market-exchanges.json` remains a historical/fallback registry, not a blocker for new exchanges. An HTML report push automatically triggers a ONE-TIME delayed latest-available price bootstrap into owner-protected Cloudflare KV, including outside market hours. Subsequent routine price collection is 20-minute cron gated to regular market weekdays and hours. If identity/hours/symbol cannot be verified, do not guess or claim the feed is active. Preserve the US Alpaca feed and all existing HTML indexing behavior.
