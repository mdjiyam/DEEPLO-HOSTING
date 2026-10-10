# DEEPLO HOSTING — Update 3.0

This update adds server-side routing for domains that have already passed TXT ownership verification, while keeping the existing publishing, unpublish, and quota features. It is still starter code: domain attachment, DNS changes, HTTPS provisioning, and live tests must be completed in Cloudflare and verified on a real domain.

## New in 3.0
- Verified custom domains can route requests to their mapped published static site when the hostname is explicitly attached to this Worker in Cloudflare.
- Requests are routed only when the server-side domain record is `verified` and the target site registry still exists and belongs to the same owner.
- Root paths serve `index.html`; asset paths are mapped to the same site.
- This code does not create Cloudflare Custom Hostnames, change DNS records, or force HTTPS by itself. Cloudflare must accept/attach the hostname and issue TLS first.
- The dashboard UI still needs domain controls wired to the domain APIs; use the API endpoints documented below until then.

## New in 2.8
- `POST /api/domains/request`: authenticated domain ownership challenge; stores a random TXT token in R2 and returns the DNS record to add.
- `GET /api/domains/verify?domain=example.com`: authenticated DNS-over-HTTPS TXT check; stores `pending` or `verified` status server-side.
- Domain claim conflicts are rejected when a different account already has the domain record.
- Verification does **not** activate domain routing, Cloudflare custom-hostname attachment, or TLS. The existing dashboard UI has not yet been wired to these endpoints.

## Kept from 2.7
- Authenticated `DELETE /api/publish?slug=<site-name>` endpoint.
- Checks Supabase JWT, R2 site registry owner, and current project ownership before deletion.
- Removes the site's R2 objects and registry entry.
- Adds an Unpublish site control to the dashboard.
- CORS explicitly allows DELETE.
- Basic published-site quota: default 3 sites per account, configurable with `MAX_SITES_PER_ACCOUNT` (1–25).
- Added domain setup guidance and a clear separation between code readiness and a deployed hosting service.

## Required setup
1. Create a Supabase project and run `supabase/schema.sql` in SQL Editor.
2. Create a Cloudflare R2 bucket named `deeplo-hosting-sites`.
3. Deploy the frontend to HTTPS and set `ALLOWED_ORIGIN` in `wrangler.toml` to its exact origin.
4. Set Worker secrets `SUPABASE_URL` and `SUPABASE_ANON_KEY` (the anon/public key only; never use a service-role key).
5. Run `npm install`, `npm run check`, test with `npm run dev:api`, then deploy using `npm run deploy:api`.
6. In the dashboard, configure Supabase URL + anon/public key, sign in, and save the deployed Worker API URL.
7. Publish a disposable test site, check its URL, then unpublish it and confirm its files return 404.
8. Test with two accounts to confirm account B cannot publish or unpublish account A's site.

## Current capabilities and limits
- Static HTML/CSS/JavaScript/assets only; this does not execute PHP, Node.js, Python, or create SQL databases for hosted sites.
- Current defaults: max 100 files, 2 MB each, 10 MB total. These are request-level limits, not complete anti-abuse/rate-limit controls.
- Site URL currently uses the Worker origin path `/s/<slug>/`.
- R2 writes and deletes are not transactional. If a write/delete partially fails, inspect R2 and retry carefully.
- Concurrent slug claims are not locked with a database uniqueness constraint.

## Production blockers (do not skip)
- **Separate customer-site domain/origin:** untrusted uploaded JavaScript must not share the same origin as the dashboard/API. Configure a separate domain for public sites and route it to a properly isolated serving Worker before accepting public users.
- DNS TXT ownership verification and verified-host routing are implemented in code, but Cloudflare hostname attachment, DNS configuration, TLS activation, and frontend controls are not automated. Basic site quota exists, but robust rate limiting, abuse reporting, malware scanning, audit logs, alerts, backups, billing, and a security review are not implemented.
- Deleting a project in the dashboard does not automatically unpublish its R2 site; unpublish the site first.
- Do not upload secrets or personal data. Do not commit Cloudflare tokens or Supabase service-role keys.

This ZIP contains code only. It does not access accounts or deploy services automatically. Test using disposable accounts and projects before relying on it.


## Custom domain / subdomain readiness (manual, not automated)
1. Use a separate domain or subdomain for customer-published sites; do not serve untrusted customer JavaScript from the same origin as the dashboard or API.
2. Configure that hostname in Cloudflare and route it to a dedicated site-serving Worker. The current `/s/<slug>/` endpoint is a path-based preview, not a custom-domain router.
3. Before mapping a domain, verify DNS control with a unique TXT challenge stored server-side and check it from the Worker. Do not accept a client-supplied `verified: true` flag.
4. Attach the hostname in Cloudflare for TLS, and only mark it active after Cloudflare reports the hostname is active and HTTPS works.
5. Once the hostname is attached to the site-serving Worker and HTTPS is active, the Worker can route that hostname only if its R2 domain record is marked `verified`.
6. This repository does not automate DNS edits, Cloudflare hostname attachment, or TLS issuance. Test with a domain you control before advertising this as a live service.


## Update 2.8 domain verification API (manual test)
1. Sign in and obtain the user's Supabase access token. Send it as `Authorization: Bearer <access-token>`; never share it in chat or commit it.
2. Request a challenge with `POST /api/domains/request` and JSON body `{"slug":"your-site","domain":"example.com"}`.
3. At the domain DNS provider, add the returned TXT record exactly: name `_deeplo.example.com`, value equal to the returned `dns.value`. Some DNS providers ask for only `_deeplo` in the host/name field.
4. After DNS propagation, call `GET /api/domains/verify?domain=example.com` with the same Authorization header. `verified` means only that the TXT token was found.
5. After verification, add the hostname to the correct Cloudflare Worker/custom-domain configuration and confirm HTTPS works. The Worker routing code is present, but DNS and TLS activation are manual and not validated by this project.

The DNS lookup uses Cloudflare's public DNS-over-HTTPS endpoint. This code has not been tested against a deployed Worker or real DNS provider; test with a disposable domain first.


## Update 3.0 — Domain Management UI
- Added a mobile-friendly Custom Domain panel with Add Domain, Verify DNS, TXT challenge display and copy action.
- Uses authenticated `/api/domains/request` and `/api/domains/verify` endpoints.
- DNS ownership verification is separate from Cloudflare custom hostname attachment, routing, and TLS. The UI does not automatically configure DNS records or activate SSL.
- Deploy the Worker and host this frontend at the exact `ALLOWED_ORIGIN` before testing. Test in a staging account first.


## Update 3.2 validation notes
- Re-requesting the same domain for the same site keeps an existing verified state when the stored TXT token is unchanged; changing the site resets the record to pending.
- Domain list UI now labels DNS verification, routing, and SSL as separate states and refreshes the list after a verification attempt.
- This is not proof of production readiness. Run `npm install` and `npm run check`, deploy to a test Worker, then verify with a domain you control. Custom hostname attachment and TLS issuance remain manual Cloudflare configuration.


## Update 3.3 — Worker connection diagnostic
The Domains panel now includes **Check API connection**, which calls `/api/health` using the configured HTTPS Worker URL. It is only a reachability check; it does not validate database access, DNS, hostname routing or SSL. See `UPDATE-3.3.md`.


## Update 3.4 — Deployment checks

Run `npm run check:config` to check required files and unresolved sample configuration. Run `npm run predeploy` before deploying; it runs the config preflight and TypeScript check. See `UPDATE-3.4.md` for the deployment checklist. These checks do not test live DNS, SSL, Cloudflare routing, or Supabase credentials.


## Update 3.5 — Control panel redesign
The interface now uses a cPanel / InfinityFree-inspired navigation layout with website management, file manager, publishing, domains, security and service settings. See `UPDATE-3.5.md`. This is a UI refresh; provider deployment and live domain routing still require configuration.


## Update 3.6
Black-and-green theme and separate navigation routes are available with `?page=dashboard`, `?page=websites`, `?page=files`, `?page=publish`, `?page=domains`, `?page=security`, and `?page=settings`. See `UPDATE-3.6.md`.


## Update 3.7 — Website & File Managers
- Added dedicated `websites.html` page for creating, searching, and removing local preview project records.
- Added dedicated `file-manager.html` page for selecting, searching, viewing text previews, downloading, and removing files in the browser session.
- These pages are front-end previews only: they do not upload files to R2 or persist projects to Supabase until wired to authenticated backend endpoints.
