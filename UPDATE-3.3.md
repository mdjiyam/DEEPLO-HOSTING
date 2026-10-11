# DEEPLO HOSTING — Update 3.3

## Added
- Dashboard button to check whether the configured HTTPS Cloudflare Worker responds at `/api/health`.
- Shows a human-readable result and clarifies the limited scope of the health check.
- No provider credentials or secrets are requested or displayed.

## Deploy
1. Replace the project files with this update in your repository.
2. Configure `ALLOWED_ORIGIN` to the exact HTTPS origin serving the dashboard (no path or trailing slash).
3. Ensure the R2 bucket exists and set `SUPABASE_URL` and `SUPABASE_ANON_KEY` as Worker secrets. Never use a Supabase service-role key in the browser.
4. Deploy the Worker, save its HTTPS URL in the dashboard setup, and click **Check API connection**.
5. Then sign in and test domain request/list/verify/remove.

## Important limitations
A successful health check only proves the Worker health endpoint responds. It does not prove Supabase JWT validation, R2 writes, DNS verification, Cloudflare custom hostname attachment, routing, or SSL are configured. The backend has not been deployed or live-tested as part of this ZIP.
