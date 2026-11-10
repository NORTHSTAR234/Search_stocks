# Search_stock HTML Snapshot Contract v2 (canonical keys)

The **single canonical, machine-readable field contract** for every **new** Search_stock HTML archive. GitHub Actions reads it through `Website/lib/report-archive.mjs` and produces `Website/live-reports.json`. This document is shared by the website parser, the GitHub `Aya_Prompt.md` and the private `Search_stock` skill.

## Exact placement

Embed **one** inert JSON object inside the complete HTML5 report, with the exact identifier:

```html
<script type="application/json" id="aya-report-snapshot">
{ ... JSON object ... }
</script>
```

Produce the same report values visibly in the main HTML cards/tables. JSON keys are **case-sensitive** and must not be renamed, translated, omitted or swapped for synonyms. The HTML is still a full readable report, not a JSON-only report. Escape literal closing script sequences in serialized values. Do not embed secrets.

## Required exact keys for new full investment reports

All the following fields are required. If a financial value cannot legitimately be established, use JSON `null` instead of inventing a number; still include the key and show `NOT RATED` / `NOT VERIFIED` as appropriate in the visible HTML and dashboard. No business research at all may occur if the Musaffa gate fails.

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
| `report_type` | string | Exactly `full` for a Musaffa-passed report, or `screening_only` when gate fails |
| `musaffa.classification` | string or null | First-party Musaffa status, **not inferred** |
| `musaffa.grade` | string or null | Exact grade when verified; else null |
| `musaffa.screening_date` | `YYYY-MM-DD` string or null | Official attributable screening date (not quote/crawl date) |
| `musaffa.gate` | string | `PASS`, `STALE`, `UNVERIFIED`, `FAIL` or descriptive gate status |
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

Optional additional evidence can be included in clearly named supplemental objects such as `quote`, `technical`, `dividend`, `chart_observations`, `sources`, and `historical`. Do not substitute these optional objects or alias names for the required fields.

**Do not use alternate new-report keys** such as top-level `investment_score`, `entry_score`, `new_buyer_action`, `holder_action`, `existing_holder_action`, `entry_preferred`, `preferred_buy_zone`, `screening.status`, `musaffa.screen_date`, `musaffa.date`, or a free-text `earnings` field **in place of** canonical keys. The website parser still reads those variants for **existing archived legacy reports only**.

## Status-only HTML reports (failed/uncertain Musaffa gate)

Use **the same top-level canonical keys**, including `schema_version: 2`, exact instrument identifiers, `report_type: "screening_only"`, and verified `musaffa` status/date/gate. Include `actions`, `scores`, `next_earnings`, `entry`, and `targets` objects **with null financial values**. For example, `scores: {"investment":null,"entry":null}`, `actions: {"new_position":null,"existing_holder":null}`, `next_earnings: {"date":null,"confirmed":null}`, `entry: {"preferred_low":null,"preferred_high":null,"acceptable_low":null,"acceptable_high":null,"no_chase":null}`, `targets: {"stop":null,"tp1":null,"tp2":null}`, and `risk: "NOT RATED"`. The website must render **SCREENING ONLY — NO INVESTMENT REPORT**, not a Buy/Sell signal.

Do not include prices, valuation, technical indicators, scenarios, dividends or financial analysis in the status-only report.

## Pre-save and post-save acceptance checks

1. Retrieve the exact latest `Aya_Prompt.md`, this contract, and current Search_stock skill rules before writing.
2. Verify the canonical ticker in **both** filename and JSON keys; confirm exchange/listing and source ticker separately.
3. Verify `schema_version: 2` and all required exact field names, types, nested structures, valid JSON and user-visible figures. No contradictory scores/actions or invented values.
4. Enforce Musaffa four-calendar-month gate and `screening_only` safeguards. Reject any report where the displayed/embedded classifications disagree.
5. Confirm all applicable entry and stop/target fields reflect the actual report; use nulls for unavailable financial metrics, never silent `0` or guessed values.
6. Before GitHub save, re-read the JSON and perform equivalent validation to `snapshotFromHtml` in `Website/lib/report-archive.mjs`. **If invalid, do not archive it**; correct before saving.
7. Save the full original HTML `halal|nonhalal/<TICKER>/<TICKER>_YYYY-MM-DD_HH-mm-ssZ.html` on `main`. Never overwrite historical reports.
8. Verify exact saved bytes, GitHub Actions workflow status, and exact `Website/live-reports.json` row identity (latest report per ticker). **HTML SAVED** is not the same as **INDEXED / READY FOR WEBSITE REFRESH**.

### Guaranteed compatibility strategy

The website parser accepts canonical **v2** reports and supports old `schema_version`-absent report variations for archive backward compatibility. Future Search_stock reports **must always use v2**, not alternate legacy property names. The parser's automated tests check the canonical contract and the original PG, JNJ, AAPL and XOM formats so that a field-name change cannot silently turn rated stocks into `NOT RATED` again.

