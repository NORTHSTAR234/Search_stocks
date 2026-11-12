# AAOIFI Stock_screener reports

This folder stores the **latest** AAOIFI Stock_screener HTML report for each listing.

- File naming: `<base ticker>.<exchange acronym>.html`, for example `NVDA.NASDAQ.html`, `AMD.NASDAQ.html`, or `ORG.ASX.html`.
- These files are **current snapshots**, not a timestamped history. Screening the same listing again overwrites its existing AAOIFI HTML file.
- Each HTML contains an inert `aaoifi-report-snapshot` JSON block used by the Cloudflare dashboard.
- Dashboard colours: **green** = `AAOIFI-COMPLIANT`; **red** = `AAOIFI-NON-COMPLIANT`; **yellow** = `SHARIAH REVIEW REQUIRED`, `INSUFFICIENT DATA`, or no current AAOIFI report.
- The AAOIFI result is independent of Musaffa status and independent of Search_stock investment actions.
