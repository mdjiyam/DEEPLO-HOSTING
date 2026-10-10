# DEEPLO HOSTING Update 3.2

## Domain management refinements
- Preserve DNS-verified status when requesting the same domain/site with the same stored TXT challenge.
- Changing the site mapping returns the challenge to pending verification.
- Domain list distinguishes DNS verification from hostname routing and SSL status.
- Verification attempts refresh the visible domain list.

## Important limitations
This update does not automatically attach a custom hostname to Cloudflare or issue TLS certificates. Configure and test those separately. No production deployment or live DNS test has been performed.
