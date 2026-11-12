# Daily Trader — on-demand 24-hour trading research

This folder is the **HTML report destination** of the private ChatGPT plugin **Daily Trader**, not a standalone website or automated Cloudflare job.

**Usage:** Invoke [Daily Trader](https://chatgpt.com/plugins/plugins_6af5877a9fac8191977c0bd84ef80cab) in ChatGPT and request a full 24-hour screening. It discovers the latest exact tickers from `Website/live-reports.json` on `main` and researches every ticker using current prices, company announcements, recent news, earnings/events and intraday market context. Its source-specific assessment is for a **maximum intended position duration of 24 elapsed hours**, not day-to-day investing, and should not recommend opening a position when there is no regular-session exit available before the deadline.

**Outputs:** `daily trader/TICKER.html` is the latest per-ticker standalone report and overwrites the prior report on a *successful* new run. `daily trader/index.html` lists the latest saved reports. This folder currently contains only its index placeholder until the **first invocation** produces a researched report. Empty, stale or unavailable source data must yield **NO TRADE** rather than invented actionable signals.

**Important:** Research runs on demand inside ChatGPT, not by Cron. Reports are saved only if ChatGPT has connected GitHub write access for this repository and successfully commits the HTML files. Verify resulting commit and report URLs. Do not place orders or include account data, secrets, or licensed content in this public GitHub repository. The existing long-term stock reports, website prices, AAOIFI and Musaffa checks are unrelated and are left untouched by Daily Trader.
