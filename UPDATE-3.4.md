# DEEPLO HOSTING Update 3.4 — Deployment Configuration & Checks

## Added
- `npm run check:config` checks required project files and warns if the sample frontend origin is still configured.
- `npm run predeploy` runs the configuration preflight and TypeScript check before deployment.
- Deployment checklist below to reduce common setup mistakes.

## Before deployment
1. Set `ALLOWED_ORIGIN` in `wrangler.toml` to the exact HTTPS origin of your deployed dashboard (no path or trailing slash).
2. Create the R2 bucket named `deeplo-hosting-sites`, or update `bucket_name` to your actual bucket.
3. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` as Cloudflare Worker secrets; never put service-role keys in frontend code.
4. Review and apply `supabase/schema.sql` in the intended Supabase project.
5. Run `npm install`, then `npm run predeploy`.
6. Deploy with `npm run deploy:api`, then test `/api/health` and authenticated publish/domain flows.

## Important limitations
The preflight is a local configuration check, not a live integration test. It does not provision Cloudflare resources, configure custom hostnames, verify external DNS, issue certificates, or prove that the deployed service is secure. Custom-domain routing and HTTPS require compatible Cloudflare configuration and must be tested on a domain you control.
