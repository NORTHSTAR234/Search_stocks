# Private GitHub migration — prepared, NOT switched

Status: **PREPARED ONLY — repository remains PUBLIC**. Do not change GitHub visibility
or attach a private read token until the numbered validation gates below pass.
This runbook is intentionally public-safe: never save credentials in this repository,
GitHub Actions logs, URLs, the website HTML/JavaScript, or chat messages.

## Current architecture and prepared change

- Cloudflare Pages project: `search-stocks-research`, GitHub-connected to
  `NORTHSTAR234/Search_stocks` (branch `main`, root `Website/`).
- Production and wildcard Pages deployments are behind owner-only Cloudflare Access.
  The Pages Function additionally validates the signed Access JWT before returning
  report index, HTML reports or market prices.
- Production `PRICE_PROVIDER` service binding for Alpaca and
  `INTERNATIONAL_QUOTES` private KV binding stay unchanged.
- `Website/lib/github-archive.mjs` now has **two fail-closed modes**:
  - Without `GITHUB_READ_TOKEN`, unchanged anonymous GitHub RAW report access,
    for the still-public repository (current production).
  - With `GITHUB_READ_TOKEN`, authenticated `api.github.com` Git tree and
    Git blob endpoints only. No raw.githubusercontent fallback, anonymous retry,
    credential in URL, browser disclosure or shared private credential cache.
    Report blob SHA must appear in the current branch's tree. Only Cloudflare
    Functions may access the credential; the client sees the same authenticated
    site and same 5-minute report index checks.
- GitHub Action `refresh-international-prices.yml` now has two UTC cron entries
  rather than 24/7: every 20 min at 23 UTC Sun-Thu, and 00-16 UTC Mon-Fri.
  Python still checks the individual exchange-local sessions and updates quotes
  only when the exchange trades. The time windows cover currently tracked
  ASX/TWSE/MYX/European XAMS/XPAR/SIX normal hours across daylight saving.
  **New venues opening before/after these UTC windows require expanding the
  workflow schedule**; the private-site source adapter does not add jobs.
  US Alpaca 5-minute browser cycle remains unaffected.

## Safe activation — complete in order

1. In your GitHub account, create a **fine-grained personal access token**:
   Resource owner NORTHSTAR234; Repository access **Only select repositories**
   and select **Search_stocks**; Repository permissions **Contents: Read-only**
   and mandatory Metadata: Read-only. No Actions, Administration, Secrets or
   write permissions. Set a time-limited expiry and plan renewal. Copy it
   directly to Cloudflare's secrets form, **never into ChatGPT or GitHub files**.
2. Cloudflare dashboard > Workers & Pages > search-stocks-research >
   Settings > Variables and Secrets (production). Add secret named EXACTLY
   `GITHUB_READ_TOKEN`. Use an **encrypted secret** rather than a public/plain
   text variable. Do not configure preview secrets or preview report publication
   without also verifying Cloudflare Access on every preview hostname.
3. Redeploy the site after adding the secret. **Keep GitHub public during this
   test.** While logged in through Cloudflare Access, verify
   `/api/github-reports` returns valid rows, and `/view-report?path=...`
   loads an actual latest HTML report, with the new code using the authenticated
   GitHub API. Confirm a newly added ticker still appears within the five-minute
   GitHub report manifest cycle. Verify `/api/prices` (Alpaca) and
   `/api/international-prices` (private Yahoo KV) are unchanged.
4. Inspect the monthly GitHub Actions budget on your actual account. GitHub Free
   has 2,000 included private-repository standard-runner minutes per month
   (shared across eligible usage); scheduled jobs round up to at least a minute.
   New optimized cron produces up to 54 scheduled jobs per full weekday, at
   **1,242 baseline minutes for 23 weekdays** if every job finishes within
   60 seconds. More than 60s per job, report indexing, initial price bootstraps,
   and other repositories all reduce this headroom; this estimate is NOT a
   free-tier guarantee. Set an account spending cap/alerts before cutover;
   review the actual Actions usage and first week after cutover.
5. Check Cloudflare Pages' **existing GitHub integration** still has permission
   for private Search_stocks. Re-authorize the Cloudflare Pages GitHub app for
   that specific repository if necessary. Do not switch visibility until the
   authenticated report tests above pass and the account quota is acceptable.
6. As the final approved step only: GitHub Search_stocks >
   Settings > General > Danger Zone > Change repository visibility > Private.
   No repo visibility change is performed by this preparation.
7. After changing visibility, verify in an incognito/non-GitHub session that
   anonymous GitHub README/raw report access is denied; in the owner-authorized
   Cloudflare browser verify report index, dynamic report open, US prices,
   international prices and new ticker onboarding. Verify Actions cron/push
   jobs and GitHub-to-Cloudflare Pages builds. Keep Cloudflare Access and
   `PUBLISH_REPORTS=yes` production-only.
8. If any check fails, do not remove Cloudflare Access. Troubleshoot the
   least-privileged Cloudflare secret or GitHub integration; do not add a public
   token or make the repository public as a workaround.

## Historical privacy limitations

Making the repository private blocks future anonymous GitHub access including
normal history browsing, but cannot retract reports that others copied while
public, and independently created public forks or external search caches may
persist. No history rewrite is included in this migration. Inspect public forks,
any accidentally committed credentials and old workflows before regarding the
history as fully confidential.

## Free-tier note and future markets

The UTC cron reduction is tuned to *currently present* exchanges rather than
every potential global market. The Search_stock report auto-registers exchanges
and performs one-time quote initialization on HTML push, but **the recurring
cron schedule must be extended for a newly added exchange trading wholly
outside the covered UTC times**. We intentionally do not promise zero-cost
runs for arbitrary future market growth. Prefer monitoring actual usage and
extending one workflow rather than creating one job per security.
