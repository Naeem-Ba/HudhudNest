-- Waitlist for the public landing page ("Benachrichtigen, wenn wir starten").
--
-- NOT applied automatically. See supabase/README.md for how to apply it to the right project.
--
-- Data minimisation: only the columns below are stored (no IP address, no user agent, no tracking ids).
-- Access model: the browser uses the public anon key and may INSERT, nothing else. There is no SELECT, UPDATE or
-- DELETE for anon/authenticated; the list is read in the Supabase dashboard or with the service_role key on a
-- trusted machine (never in the frontend).

create table if not exists public.waitlist_signups (
  id           uuid primary key default gen_random_uuid(),
  contact      text not null,
  contact_type text not null,
  interest     text null,
  language     text not null,
  consent_at   timestamptz not null,
  created_at   timestamptz not null default now(),

  constraint waitlist_contact_type_chk check (contact_type in ('email', 'whatsapp')),
  constraint waitlist_interest_chk     check (interest is null or interest in ('kaufen', 'mieten', 'kurz')),
  constraint waitlist_language_chk     check (language in ('de', 'ar', 'en', 'tr')),
  constraint waitlist_contact_len_chk  check (char_length(contact) between 5 and 254),
  constraint waitlist_contact_fmt_chk  check (
    (contact_type = 'email'    and contact ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$')
    or
    (contact_type = 'whatsapp' and contact ~ '^\+[1-9][0-9]{7,14}$')
  )
);

-- One signup per address / number, case-insensitive. A repeat signup fails with 23505, which the app treats as success.
create unique index if not exists waitlist_signups_contact_lower_uidx
  on public.waitlist_signups (lower(contact));

alter table public.waitlist_signups enable row level security;
alter table public.waitlist_signups force row level security;

-- Table privileges: start from nothing, then give anon the INSERT on exactly the five columns the form sends.
revoke all on public.waitlist_signups from public, anon, authenticated;
grant insert (contact, contact_type, interest, language, consent_at) on public.waitlist_signups to anon;

drop policy if exists waitlist_anon_insert on public.waitlist_signups;
create policy waitlist_anon_insert
  on public.waitlist_signups
  for insert
  to anon
  with check (
    char_length(contact) between 5 and 254
    and consent_at > now() - interval '1 day'
    and consent_at < now() + interval '1 day'
  );

-- No select / update / delete policy exists for anon or authenticated, so those operations are denied by RLS.
