# Update 3.9 — Real Website Hosting

- Static website publishing to Cloudflare R2 via authenticated Worker API.
- New authenticated `GET /api/sites/list` inventory endpoint with owner-scoped site records and usage summary.
- Dashboard inventory lists published sites, URLs, file counts, published bytes, update times, and configured site quota.
- Publish and unpublish actions refresh the inventory.
- Requires actual Supabase, Cloudflare R2, Worker deployment, and correct origin configuration. Static websites only.
