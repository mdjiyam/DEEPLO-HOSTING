# DEEPLO HOSTING — Combined Update 4.1

This release bundles the requested Update 3.9 (Real Website Hosting), Update 4.0 (Domain Manager), and Update 4.1 (Hosting Control Panel) into one package, building on Update 3.8.

## Website hosting / publishing (3.9)
- Authenticated static-site publishing to Cloudflare R2 through the Worker API.
- Published-site inventory endpoint: `GET /api/sites/list` returns only the signed-in user's published sites, URLs, file counts, byte totals, and account quota metadata.
- Dashboard shows published sites, open links, last update, file count, and usage summary.
- Existing publish and unpublish flows are retained; successful publish/unpublish refreshes the inventory.
- Requires a deployed Worker, R2 bucket, Supabase Auth, and an owned project. Static hosting only: PHP/Node/Python backends and SQL databases are not executed by this static-site endpoint.

## Domain Manager (4.0)
- Retains add-domain challenge, TXT verification, domain list, and removal controls.
- DNS ownership verification is separate from hostname attachment, routing, and TLS. Domain verification does not automatically add a Cloudflare Custom Hostname or issue certificates.
- Subdomains require a domain/subdomain under the user's control and suitable DNS/Cloudflare routing. No domain is purchased or configured automatically.

## Hosting control panel (4.1)
- Retains the dark black/green multipage dashboard, projects, private Supabase Storage file manager, publisher, domains, security and settings.
- Displays published-site count against the configured per-account limit and published bytes from the R2 registry.
- Mobile left sidebar toggle/backdrop/Escape behavior retained from 3.8.

## Setup
1. Run `supabase/schema.sql` in Supabase SQL Editor.
2. Create Cloudflare R2 bucket `deeplo-hosting-sites`.
3. Set the exact HTTPS frontend origin in `wrangler.toml` as `ALLOWED_ORIGIN`.
4. Set Worker secrets `SUPABASE_URL` and `SUPABASE_ANON_KEY` (anon/public key only; never use a service-role key in frontend or Worker secrets for this flow).
5. Install dependencies and run `npm run predeploy`; deploy the Worker using `npm run deploy:api`.
6. In the dashboard, configure Supabase URL + anon/public key, sign in, and save the Worker API URL.
7. Test with a disposable project and account. Publish a test site, refresh the published-site inventory, open it, then unpublish and verify it no longer loads.
8. Test account isolation with two separate accounts before using this with real users.

## Important limits / production blockers
- Code package only: it does not deploy Cloudflare, create DNS records, attach custom hostnames, provision TLS, or sign into the user's services.
- Custom-domain verification and Worker-side routing code exist, but actual hostname routing works only after the hostname is attached to the correct Cloudflare Worker and TLS is active. The dashboard labels these states separately.
- Customer-uploaded JavaScript should be served from a separate public-site origin, isolated from the dashboard/API origin, before accepting public users.
- Quota counting is a basic R2 registry scan, not atomic concurrency control. Add robust rate limiting, audit logs, backups, abuse reporting, malware scanning, monitoring, and a security review before production use.
- Supabase private file manager files and R2 published-site files are separate storage areas. Uploading to File Manager does not automatically publish those files; use Website Publisher.
