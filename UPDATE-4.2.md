# Update 4.2 — Animations, ZIP publish, rate limiting

- **Animations** (`animations.css`, `animations.js`): green particle-network background that reacts to the cursor, scroll-reveal for cards/panels, cursor glow on cards, shimmering headlines, floating hero cloud/orbits, pulsing status dots, button ripple, animated intro with typed tagline (auto-opens after ~3 s; button still works). Fully disabled when the OS "reduce motion" setting is on. Cosmetic only; no app logic touched.
- **ZIP publish** (`zip-publish.js`): choose a .zip in Website Publisher; it is unpacked in the browser (JSZip 3.10.1), a single wrapper folder is stripped, then the normal Publish button is used. Same limits: 100 files, 2 MB each, 10 MB total, index.html required, unsupported types skipped.
- **Rate limiting** (Worker): per-IP limits on publish/unpublish (10/min), domain APIs (20/min), site list (60/min). In-memory per isolate, so best-effort only — add Cloudflare Rate Limiting rules for real protection.
- **Extra headers on published sites**: X-Frame-Options, Permissions-Policy, COOP/CORP, HSTS.
- Removed leftover `scripts.tmp`.

Still required before public users: separate origin for customer sites, DB-backed registry, abuse handling, security review. Not tested against live Cloudflare/Supabase — run `npm install && npm run predeploy`, then test with a disposable account.
