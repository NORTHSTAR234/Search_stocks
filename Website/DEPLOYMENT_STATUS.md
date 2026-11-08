# Cloudflare deployment status

Project: `search-stocks-research`.

Cloudflare Access production `search-stocks-research.pages.dev` and wildcard deployment `*.search-stocks-research.pages.dev` applications have owner-email-only policies. The user confirmed an incognito window prompts for Cloudflare sign-in. The production Pages build environment is configured with `PUBLISH_REPORTS=yes` and restricted Access identity settings. The report folders are input-only and not modified by this website.

**Release request:** Build and deploy the actual stock research dashboard from latest archival Markdown, including all ticker HTML pages. Alpaca live-price provider connection remains pending and must fail closed; the dashboard must show unavailable quotes rather than archived/stale prices. No production FRED Worker or Alpaca credentials have been changed.
