# Investment Checklist — multi-market data foundation

This folder is separate from the existing Search_stock reports and website. It provides a **free, optional, market-agnostic financial-statement import prototype**, not an active all-market scanner. No scheduled jobs or paid APIs are configured.

## Intended coverage

Use the same fundamental quality, governance, sustainable ROIC and valuation methodology regardless of stock exchange. What changes is the source adapter and the listing's ticker, currency, tax, reporting calendar, share class and data completeness.

| Market | Sources for discovery / official filings | Main caveat |
| --- | --- | --- |
| US (NYSE/NASDAQ) | SEC EDGAR XBRL Companyfacts, exchange rosters | SEC filings do not necessarily match every actively listed security; XBRL normalization required |
| ASX | ASX current company directory; annual statements and public exchange announcements | Directory is not a free five-year financials API |
| LSE | UK Companies House XBRL accounts, issuer disclosures, LSE roster | Companies House includes unlisted companies |
| TSE Japan | EDINET and company filings | EDINET API v2 can require a free subscription key |
| TWSE | Taiwan MOPS / TWSE issuer filings | Identity, language and reporting conventions |
| MYX | Bursa Malaysia issuer filings | Security class and MYR reporting |
| SIX | Swiss exchange and issuer disclosures | CHF or issuer reporting currency, cross-listings |
| Other | Regulator and issuer filings or lawful CSV exports | Per-market coverage and provider limitations must be disclosed |

No fake universal free API, no private-endpoint scraping, no bypassing logins/rate limits. Verify terms before redistributing provider data to this public repository.

## Import contract

Use \`import_market_csv.py\` with a *legitimately obtained* annual-financials CSV. The current prototype implements **CSV import only**, not automatic global data download. One row per ticker + fiscal year.

Required columns: \`ticker,fy,report_currency,source_url,source_date\`.

Recommended columns: \`company,period_end,revenue,ebit,cfo,capex,lease_principal,equity,interest_debt,lease_liabilities,cash,price,price_currency,price_date\`.

All cash/accounting numbers use unscaled reporting-currency units (not millions). \`capex\` and \`lease_principal\` are positive spending magnitudes. Missing means unknown, not zero. \`source_url\` is an HTTPS filing reference; it is **not** checked automatically for factual correctness. Dates are \`YYYY-MM-DD\`.

Examples:

\`\`\`bash
python Investment_Checklist/import_market_csv.py annuals_asx.csv --market ASX --tax-rate 0.30 --out Investment_Checklist/data/asx.json
python Investment_Checklist/import_market_csv.py annuals_us.csv --market US --tax-rate 0.21 --out Investment_Checklist/data/us.json
python Investment_Checklist/import_market_csv.py annuals_twse.csv --market TWSE --out Investment_Checklist/data/twse.json
python -m unittest discover -s Investment_Checklist -p 'test_*.py'
\`\`\`

\`--tax-rate\` is an explicit analyst assumption, not the company's actual effective tax rate. If omitted, ROIC is **not** calculated. Three years of reconstructed ROIC require four consecutive year-end invested-capital observations. The importer reports a per-ticker source and completeness audit, stays \`universe_exhaustive:false\` and never classifies an investment as verified.

Non-US canonical ticker format is ticker + exchange, such as \`JBH.ASX\`, \`1519.TWSE\` and \`CBHC.MYX\`; US symbols remain \`NVDA\`. Symbols such as \`BHP.AX\` are source-provider symbols and require independent mapping, not automatic conversion. Cross-listed CDIs/ADRs, currency changes and sectors such as banks/insurers need separate analysis before ranking.

## Next steps

1. Add tested SEC Companyfacts / SEC bulk ZIP adapter with fiscal-period and restatement reconciliation.
2. Add separate issuer-report adapters for ASX and other markets, and current official exchange roster mapping.
3. Add permissibly sourced whole-universe coverage counts, missing-data reporting, sector cohorts and caching.
4. Connect optional discovery output to the existing private **Investment Checklist Screener**; let \`@Search_stock\` perform individual full A–H analysis.

**This branch does not change \`@Search_stock\`, existing GitHub halal/nonhalal archives or the Cloudflare live website.**
