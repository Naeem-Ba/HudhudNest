# Supabase (waitlist only)

The marketing pages store waitlist signups in Supabase, not in the ASP.NET backend.

## Apply the migration

Nothing runs it automatically. Pick the project (staging first), then either:

- Dashboard: SQL Editor, paste `migrations/20261112140000_waitlist.sql`, Run. Or
- CLI: `supabase link --project-ref <ref>` then `supabase db push`.

Then set these build variables in Netlify (per context) and rebuild:

| Variable | Value |
| --- | --- |
| `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | the project's **anon / publishable** key (public by design) |

**Never** put the `service_role` key into a build variable of this app.

## Reading the list

Table editor in the dashboard, or a server-side script with the service_role key. The browser cannot read it.

## Check after applying

With the anon key: an insert with a valid row returns 201; a second insert of the same contact returns 409 (code 23505);
`select` returns an empty list or 401; `update`/`delete` change nothing.
