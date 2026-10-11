# Update 3.8

## Fixed
- Mobile hamburger opens/closes the left sidebar correctly; backdrop, Escape, navigation click, and desktop resize close it.
- Replaced browser-only mock file picker with Supabase Storage-backed File Manager.

## Real File Manager features
- Supabase Auth session and saved URL/anon key reuse.
- Signed-in user's real projects.
- Upload to private `project-files` bucket, list/refresh, search, signed URL download, text/code/SVG preview, permanent deletion.
- Uses owner-only Storage RLS policies in `supabase/schema.sql`.

## Setup requirement
Run `supabase/schema.sql` in Supabase SQL Editor, then configure the Supabase URL and anon/public key in Dashboard settings and sign in. Do not use a service-role key in frontend code. Files are stored privately; upload does not automatically publish them.
