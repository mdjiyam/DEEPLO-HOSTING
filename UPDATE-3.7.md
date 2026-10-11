# DEEPLO HOSTING Update 3.7

## Included
- Dedicated Website Manager page (`websites.html`) with local preview project create/search/delete and copy ID.
- Dedicated File Manager page (`file-manager.html`) with device file selection, drag/drop, search, text preview, download, and remove-from-session.
- Updated dashboard quick links to open dedicated pages.
- Keeps the black + green visual theme.

## Important limits
- Website project records in this preview are stored in the current browser localStorage, not Supabase.
- File Manager reads files selected by the user in their browser only. It does not upload to Cloudflare R2 or edit server files.
- Connect authenticated backend APIs before treating either page as a production hosting control panel.
