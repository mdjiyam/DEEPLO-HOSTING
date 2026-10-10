# DEEPLO HOSTING Update 3.6 — Black + Green Multipage UI

- Changed the control-panel theme to black/green.
- Navigation opens distinct page routes using `?page=`: Dashboard, Websites & Projects, File Manager, Website Publisher, Domains, Security, Settings.
- Existing DOM is retained behind page-specific visibility rules so current app.js event handlers can continue to find their elements.
- Supabase and Cloudflare configuration/deployment are still required for live hosting.
- UI and archive checks only; not live-tested against real Cloudflare/Supabase accounts.
