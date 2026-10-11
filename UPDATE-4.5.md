# Update 4.5 — all-in-one (covers planned 4.3 + 4.4 + 4.5)

Everything below is **code written but not run against live Cloudflare/Supabase**. Test with disposable accounts first.

## Security & data (4.3)
- **Separate site origin:** set `SITE_DOMAIN` (e.g. `deeplosites.com`) + wildcard DNS/route. Sites then serve from `https://<slug>.deeplosites.com/`; `/s/<slug>/` is disabled on the API/dashboard host, so customer JavaScript no longer shares its origin.
- **Race-free slug claim + fast quota** via new Supabase `sites` table (unique slug). R2 registry is still used for serving.
- **Project delete auto-unpublishes** its sites (`DELETE /api/sites/by-project`).
- **Global rate limit** if you enable the `RATE_LIMITER` binding (see `wrangler.toml`); otherwise per-isolate fallback.

## Features (4.4)
- `editor.html`: edit text files of a published site; **rollback** to the version saved before the last re-publish.
- **Auto subdomains** (`<slug>.SITE_DOMAIN`), **custom 404** (`404.html` in site root), clean `/folder/` → `index.html`.
- **Cloudflare custom hostnames:** `POST /api/domains/attach`, `GET /api/domains/status` (needs `CF_API_TOKEN`, `CF_ZONE_ID`; Cloudflare for SaaS).
- **Analytics:** writes visits to Workers Analytics Engine if the `ANALYTICS` binding is enabled (view in Cloudflare; no in-panel chart yet).

## Operations (4.5)
- `admin.html`: sites (suspend/unsuspend/delete), users + plan switch, abuse reports, audit log. Admin = `profiles.is_admin = true`.
- **Plans** free (3 sites) / pro (15 sites); per-site size stays 10 MB. **No payment gateway** — an admin switches plans manually.
- **Audit log** (R2), **abuse report form** (`report.html`, set Worker URL in `public-config.js`), **legal templates** (`legal.html`, not legal advice).
- **Email** via Resend if `RESEND_API_KEY` + `MAIL_FROM` are set (publish + suspension notices).
- `scripts/isolation-test.mjs` (two-account test), GitHub Actions CI.

## Upgrade steps
1. Run the new "4.5 migration" block at the end of `supabase/schema.sql`; then make yourself admin (comment at the bottom).
2. Set `ALLOWED_ORIGIN`; optionally `SITE_DOMAIN`, mail, Cloudflare vars. `npm install && npm run predeploy && npm run deploy:api`.
3. Existing published sites keep working; they are added to the `sites` table on their next re-publish.

## Not done (needs external accounts/decisions)
Payment gateway (bKash/SSLCommerz/Stripe), malware scanning, backups/monitoring, in-panel analytics charts, atomic publish, splitting the dense `app.js`/`index.ts`, legal review.

## Added in the final pass
- **Safer publishing:** stale files are removed on re-publish; if an upload fails midway the previous version is restored automatically; files are scanned (executables/archives and crypto-miner code are rejected; password forms with brand keywords are flagged to the admin queue).
- **Nightly job (cron 03:00 UTC):** backs up registry/domain/suspension records for 7 days, optionally mirrors site files to a second R2 bucket (`BACKUP`), and checks R2 + Supabase health; set `ALERT_WEBHOOK` (Slack/Discord) to be alerted.
- **Analytics page** (`analytics.html`): daily views chart; needs `ANALYTICS` binding + `CF_ACCOUNT_ID` + `CF_ANALYTICS_TOKEN`.
- **Manual payment flow** (`upgrade.html` + Admin → Upgrade requests): user sends bKash/Nagad/bank money, submits the transaction ID, admin verifies in the wallet app and approves → Pro plan + email. Edit payment details in `public-config.js`. No automatic gateway.
- **Tests:** `npm test` runs 36 checks against in-memory fakes of R2 + Supabase (publish, quota, ownership isolation, rollback, suspension, scan, upgrade, subdomain isolation, backup). These are mocks, not live services.

## Truly external / not possible from code
Automatic payment gateway (needs a merchant account), a lawyer's review, buying/configuring the domain, DNS and Cloudflare/Supabase accounts, and a real live test.
