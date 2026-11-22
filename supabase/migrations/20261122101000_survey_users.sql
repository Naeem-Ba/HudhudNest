-- =====================================================================================================
-- HUDHUDNEST market validation survey (users)  -  table public.survey_users_responses
-- =====================================================================================================
--
-- NOT applied automatically. Run it yourself in the Supabase SQL editor, on the STAGING project first.
-- It only creates new objects (one table, one validation function, one trigger, one policy). It does not
-- touch public.waitlist_signups or anything else, and it does not drop or delete any existing data.
-- Re-running it is safe: every statement is "if not exists" / "or replace" / "drop policy if exists".
--
-- -----------------------------------------------------------------------------------------------------
-- Why the anon key in the HTML page is not a leaked admin secret
-- -----------------------------------------------------------------------------------------------------
-- The page calls https://<ref>.supabase.co/rest/v1/survey_users_responses with the project's "anon"
-- (publishable) key. That key is meant to be public: every visitor's browser can read it. It only
-- identifies the request as the Postgres role "anon". What anon may do is decided here, in the database:
--   * table privileges: anon gets INSERT on exactly the columns the page sends, nothing else
--     (no SELECT, no UPDATE, no DELETE, no TRUNCATE, no REFERENCES, no TRIGGER);
--   * row level security: enabled AND forced; the only policy is an INSERT policy for anon;
--   * constraints + the validation trigger below: a row that does not match the survey's branching
--     rules, value lists or size limits is rejected.
-- The service_role key bypasses RLS and must NEVER be placed in the page, in Netlify build variables of
-- the app, or anywhere a browser can see it. Read the answers in the Supabase dashboard (Table editor /
-- SQL editor) or from a trusted machine.
--
-- -----------------------------------------------------------------------------------------------------
-- What this does NOT protect against (read before launch)
-- -----------------------------------------------------------------------------------------------------
-- RLS is an authorisation mechanism, not rate limiting. Anyone holding the public anon key (i.e. anyone)
-- can script thousands of valid-looking INSERTs. The constraints below cap the size of each row
-- (answers < 8 KB, every text field length-limited) so a flood cannot store large payloads, but they do
-- not stop many rows. Options, from cheapest to strongest (none is applied by this file):
--   1. Analysis-time hygiene: the analysis file reports very short durations (duration_sec < 45) and
--      bursts per minute so suspicious rows can be excluded before reading the indicators.
--   2. Keep the link private to the distribution channels you control, and watch the row count daily.
--   3. A global insert throttle trigger (e.g. reject when more than N rows arrived in the last minute).
--      It cannot tell people apart, so it can also block real participants during a spike.
--   4. Put a small server in front (Supabase Edge Function or Netlify Function) that verifies a
--      Cloudflare Turnstile / hCaptcha token and rate-limits per IP, and remove anon's INSERT grant.
--      This is the only option here that really limits abuse per sender; it needs a server-side secret
--      and changes the page's endpoint, so it is a separate decision.
-- The honeypot field in the page only filters naive bots.
--
-- -----------------------------------------------------------------------------------------------------
-- answers JSONB contract (fixed keys; see 00-review-ar.md section 4 for the full list of codes)
-- -----------------------------------------------------------------------------------------------------
--   A question the participant never saw is ABSENT from answers (never null, never a placeholder).
--   An optional text question that was shown but left empty is recorded as "blank" in its qN key and
--   its *_details / *_text key is absent. Contact data (name, WhatsApp) is never stored in answers.
-- =====================================================================================================

create table if not exists public.survey_users_responses (
  id                       uuid primary key default gen_random_uuid(),
  submission_id            uuid not null unique,
  created_at               timestamptz not null default now(),
  started_at               timestamptz,
  duration_sec             int,
  screened_out             boolean not null,
  status                   text,
  residence                text,
  residence_detail         text,
  top_problems             text[],
  fake_listing_experience  text,
  try_likelihood           smallint,
  answers                  jsonb not null,
  contact_name             text,
  contact_whatsapp         text,
  contact_consent          boolean not null default false,
  utm_source               text,
  utm_medium               text,
  utm_campaign             text,
  utm_content              text,
  referrer                 text,
  device                   text,
  lang                     text,

  -- 1. Q10 scale; NULL only when the question was not shown (screened-out path).
  constraint survey_users_try_likelihood_chk check (try_likelihood is null or try_likelihood between 1 and 5),
  -- 2. Q1 values only.
  constraint survey_users_status_chk check (
    status in ('looking_rent', 'looking_buy', 'for_family', 'owner', 'past_year', 'not_looking')),
  -- 3. Q2 values only.
  constraint survey_users_residence_chk check (residence in ('inside', 'outside')),
  constraint survey_users_residence_detail_chk check (residence_detail in (
    'damascus', 'rural_damascus', 'aleppo', 'homs', 'hama', 'latakia', 'tartus', 'idlib', 'deir_ezzor',
    'raqqa', 'hasakah', 'daraa', 'sweida', 'quneitra',
    'germany', 'turkey', 'lebanon', 'jordan', 'uae', 'saudi', 'other_europe', 'other')),
  -- 4. screened_out is NOT NULL (column definition) and must agree with Q1.
  constraint survey_users_screened_chk check (screened_out = (status = 'not_looking')),
  -- 5. Size cap on the JSONB payload.
  constraint survey_users_answers_size_chk check (pg_column_size(answers) < 8192),
  constraint survey_users_answers_object_chk check (jsonb_typeof(answers) = 'object'),
  -- 6. No name or number without consent.
  constraint survey_users_contact_consent_chk check (
    contact_consent or (contact_whatsapp is null and contact_name is null)),
  -- 7. Same rule as the page: "+" then 8 to 15 digits (E.164, formatting removed by the page).
  constraint survey_users_whatsapp_fmt_chk check (contact_whatsapp is null or contact_whatsapp ~ '^\+[1-9][0-9]{7,14}$'),
  constraint survey_users_contact_name_chk check (contact_name is null or char_length(contact_name) between 1 and 80),
  -- 8. Non-negative duration.
  constraint survey_users_duration_chk check (duration_sec is null or duration_sec >= 0),
  -- Q6 / Q7 mirrors.
  constraint survey_users_top_problems_chk check (
    top_problems is null or (
      cardinality(top_problems) between 1 and 2
      and top_problems <@ array['fake_or_unavailable', 'no_price', 'bad_photos', 'unclear_location',
                                'hard_compare', 'commissions', 'slow_response', 'office_trust', 'other']::text[])),
  constraint survey_users_fake_listing_chk check (
    fake_listing_experience is null or fake_listing_experience in ('yes_multiple', 'yes_once', 'no', 'not_sure')),
  -- Metadata: short, minimal, no IP, no user agent.
  constraint survey_users_device_chk check (device is null or device in ('mobile', 'desktop')),
  constraint survey_users_lang_chk check (lang is null or lang ~ '^[a-z]{2}$'),
  constraint survey_users_utm_len_chk check (
    coalesce(char_length(utm_source), 0) <= 200 and coalesce(char_length(utm_medium), 0) <= 200
    and coalesce(char_length(utm_campaign), 0) <= 200 and coalesce(char_length(utm_content), 0) <= 200),
  constraint survey_users_referrer_len_chk check (referrer is null or char_length(referrer) <= 300)
);

comment on table public.survey_users_responses is
  'HUDHUDNEST market validation survey (users). INSERT-only for anon; read in the dashboard. Contact columns only with consent.';

-- -----------------------------------------------------------------------------------------------------
-- 9. Branching consistency (runs on INSERT only, so later anonymisation by an admin is never blocked).
--    Raises check_violation (23514); PostgREST answers HTTP 400 and the page shows a retry message.
-- -----------------------------------------------------------------------------------------------------
create or replace function public.survey_users_validate()
returns trigger
language plpgsql
set search_path = ''
as $fn$
declare
  a jsonb := new.answers;
  k text;
  allowed_keys text[] := array[
    'survey_version', 'q1', 'q2', 'q2_detail', 'q2_other', 'q3', 'q3_other', 'q4', 'q4_app_name', 'q5',
    'q6', 'q6_order', 'q7', 'q7_details', 'q8', 'q8_order', 'q9a', 'q9b', 'q9b_details', 'q9c', 'q10',
    'q11', 'q11_text', 'q12'];
  screened_keys text[] := array['survey_version', 'q1', 'q2', 'q2_detail', 'q2_other'];
  q3_codes text[] := array['damascus', 'rural_damascus', 'other_gov'];
  q4_codes text[] := array['facebook_groups', 'office_social', 'office_visit', 'friends', 'app_site',
                           'whatsapp_telegram', 'other'];
  q5_codes text[] := array['lt_week', 'week_to_month', 'month_to_3m', 'gt_3m', 'still_searching'];
  q6_codes text[] := array['fake_or_unavailable', 'no_price', 'bad_photos', 'unclear_location', 'hard_compare',
                           'commissions', 'slow_response', 'office_trust', 'other'];
  q8_codes text[] := array['real_photos', 'clear_price', 'map_location', 'area_details', 'advertiser_info',
                           'last_updated', 'whatsapp_contact'];
  inside_codes text[] := array['damascus', 'rural_damascus', 'aleppo', 'homs', 'hama', 'latakia', 'tartus',
                               'idlib', 'deir_ezzor', 'raqqa', 'hasakah', 'daraa', 'sweida', 'quneitra'];
  outside_codes text[] := array['germany', 'turkey', 'lebanon', 'jordan', 'uae', 'saudi', 'other_europe', 'other'];
  arr text[];
  ord text[];
begin
  -- fixed key set
  for k in select jsonb_object_keys(a) loop
    if not (k = any (allowed_keys)) then
      raise exception using errcode = '23514', message = 'survey: unknown answers key';
    end if;
  end loop;

  if a ->> 'survey_version' is null or char_length(a ->> 'survey_version') > 40 then
    raise exception using errcode = '23514', message = 'survey: survey_version missing';
  end if;
  if new.started_at is null or new.duration_sec is null or new.started_at > now() + interval '2 days' then
    raise exception using errcode = '23514', message = 'survey: started_at / duration_sec invalid';
  end if;

  -- Q1 / Q2 always present and mirrored in the columns
  if jsonb_typeof(a -> 'q1') is distinct from 'string' or a ->> 'q1' is distinct from new.status then
    raise exception using errcode = '23514', message = 'survey: q1 mismatch';
  end if;
  if jsonb_typeof(a -> 'q2') is distinct from 'string' or a ->> 'q2' is distinct from new.residence
     or a ->> 'q2_detail' is distinct from new.residence_detail then
    raise exception using errcode = '23514', message = 'survey: q2 mismatch';
  end if;
  if (new.residence = 'inside' and not (new.residence_detail = any (inside_codes)))
     or (new.residence = 'outside' and not (new.residence_detail = any (outside_codes))) then
    raise exception using errcode = '23514', message = 'survey: residence_detail does not fit residence';
  end if;
  if a ? 'q2_other' and (new.residence_detail <> 'other' or jsonb_typeof(a -> 'q2_other') <> 'string'
                         or char_length(a ->> 'q2_other') not between 1 and 100) then
    raise exception using errcode = '23514', message = 'survey: q2_other invalid';
  end if;

  -- Screened-out path: Q1 + Q2 only, nothing else, no contact
  if new.screened_out then
    for k in select jsonb_object_keys(a) loop
      if not (k = any (screened_keys)) then
        raise exception using errcode = '23514', message = 'survey: screened-out row carries later answers';
      end if;
    end loop;
    if new.top_problems is not null or new.fake_listing_experience is not null or new.try_likelihood is not null
       or new.contact_consent or new.contact_name is not null or new.contact_whatsapp is not null then
      raise exception using errcode = '23514', message = 'survey: screened-out row carries later answers';
    end if;
    return new;
  end if;

  -- Q3 areas: non-empty distinct subset
  if jsonb_typeof(a -> 'q3') is distinct from 'array' or jsonb_array_length(a -> 'q3') = 0 then
    raise exception using errcode = '23514', message = 'survey: q3 missing';
  end if;
  arr := array(select jsonb_array_elements_text(a -> 'q3'));
  if not (arr <@ q3_codes) or cardinality(arr) <> (select count(distinct x) from unnest(arr) x) then
    raise exception using errcode = '23514', message = 'survey: q3 invalid';
  end if;
  if a ? 'q3_other' and (not ('other_gov' = any (arr)) or char_length(a ->> 'q3_other') not between 1 and 100) then
    raise exception using errcode = '23514', message = 'survey: q3_other invalid';
  end if;

  -- Q4 channels
  if jsonb_typeof(a -> 'q4') is distinct from 'array' or jsonb_array_length(a -> 'q4') = 0 then
    raise exception using errcode = '23514', message = 'survey: q4 missing';
  end if;
  arr := array(select jsonb_array_elements_text(a -> 'q4'));
  if not (arr <@ q4_codes) or cardinality(arr) <> (select count(distinct x) from unnest(arr) x) then
    raise exception using errcode = '23514', message = 'survey: q4 invalid';
  end if;
  if a ? 'q4_app_name' and (not ('app_site' = any (arr)) or char_length(a ->> 'q4_app_name') not between 1 and 100) then
    raise exception using errcode = '23514', message = 'survey: q4_app_name invalid';
  end if;

  -- Q5
  if not (coalesce(a ->> 'q5', '') = any (q5_codes)) then
    raise exception using errcode = '23514', message = 'survey: q5 invalid';
  end if;

  -- Q6: 1-2 distinct codes, mirrored in top_problems; q6_order is the 9 codes with "other" last
  if jsonb_typeof(a -> 'q6') is distinct from 'array' then
    raise exception using errcode = '23514', message = 'survey: q6 missing';
  end if;
  arr := array(select jsonb_array_elements_text(a -> 'q6'));
  if cardinality(arr) not between 1 and 2 or not (arr <@ q6_codes)
     or cardinality(arr) <> (select count(distinct x) from unnest(arr) x)
     or new.top_problems is null or not (arr <@ new.top_problems and new.top_problems <@ arr)
     or cardinality(new.top_problems) <> cardinality(arr) then
    raise exception using errcode = '23514', message = 'survey: q6 / top_problems mismatch';
  end if;
  if jsonb_typeof(a -> 'q6_order') is distinct from 'array' then
    raise exception using errcode = '23514', message = 'survey: q6_order missing';
  end if;
  ord := array(select jsonb_array_elements_text(a -> 'q6_order'));
  if cardinality(ord) <> 9 or not (ord <@ q6_codes and q6_codes <@ ord) or ord[9] <> 'other' then
    raise exception using errcode = '23514', message = 'survey: q6_order invalid';
  end if;

  -- Q7 + optional details only after a "yes"
  if a ->> 'q7' is distinct from new.fake_listing_experience or new.fake_listing_experience is null then
    raise exception using errcode = '23514', message = 'survey: q7 mismatch';
  end if;
  if a ? 'q7_details' and (new.fake_listing_experience not in ('yes_multiple', 'yes_once')
                           or char_length(a ->> 'q7_details') not between 1 and 300) then
    raise exception using errcode = '23514', message = 'survey: q7_details invalid';
  end if;

  -- Q8: exactly 3 distinct codes; q8_order is a permutation of the 7 codes
  if jsonb_typeof(a -> 'q8') is distinct from 'array' then
    raise exception using errcode = '23514', message = 'survey: q8 missing';
  end if;
  arr := array(select jsonb_array_elements_text(a -> 'q8'));
  if cardinality(arr) <> 3 or not (arr <@ q8_codes) or (select count(distinct x) from unnest(arr) x) <> 3 then
    raise exception using errcode = '23514', message = 'survey: q8 invalid';
  end if;
  if jsonb_typeof(a -> 'q8_order') is distinct from 'array' then
    raise exception using errcode = '23514', message = 'survey: q8_order missing';
  end if;
  ord := array(select jsonb_array_elements_text(a -> 'q8_order'));
  if cardinality(ord) <> 7 or not (ord <@ q8_codes and q8_codes <@ ord) then
    raise exception using errcode = '23514', message = 'survey: q8_order invalid';
  end if;

  -- Q9: only for residence = outside
  if new.residence = 'inside' then
    if a ?| array['q9a', 'q9b', 'q9b_details', 'q9c'] then
      raise exception using errcode = '23514', message = 'survey: q9 answers for a participant inside Syria';
    end if;
  else
    if not (coalesce(a ->> 'q9a', '') in ('yes', 'no')) or not (coalesce(a ->> 'q9c', '') in ('yes', 'maybe', 'no')) then
      raise exception using errcode = '23514', message = 'survey: q9a / q9c missing';
    end if;
    if (a ->> 'q9a' = 'yes') <> (a ? 'q9b') then
      raise exception using errcode = '23514', message = 'survey: q9b must follow q9a = yes';
    end if;
    if a ? 'q9b' and not (a ->> 'q9b' in ('answered', 'blank')) then
      raise exception using errcode = '23514', message = 'survey: q9b invalid';
    end if;
    if (coalesce(a ->> 'q9b', '') = 'answered') <> (a ? 'q9b_details')
       or (a ? 'q9b_details' and char_length(a ->> 'q9b_details') not between 1 and 300) then
      raise exception using errcode = '23514', message = 'survey: q9b_details invalid';
    end if;
  end if;

  -- Q10 mirrored
  if jsonb_typeof(a -> 'q10') is distinct from 'number' or new.try_likelihood is null
     or (a ->> 'q10') <> new.try_likelihood::text then
    raise exception using errcode = '23514', message = 'survey: q10 mismatch';
  end if;

  -- Q11 optional text
  if not (coalesce(a ->> 'q11', '') in ('answered', 'blank'))
     or (a ->> 'q11' = 'answered') <> (a ? 'q11_text')
     or (a ? 'q11_text' and char_length(a ->> 'q11_text') not between 1 and 300) then
    raise exception using errcode = '23514', message = 'survey: q11 invalid';
  end if;

  -- Q12: consent recorded only with a number; answers.q12 mirrors the column
  if not (coalesce(a ->> 'q12', '') in ('consented', 'not_consented'))
     or (a ->> 'q12' = 'consented') <> new.contact_consent
     or (new.contact_consent and new.contact_whatsapp is null) then
    raise exception using errcode = '23514', message = 'survey: q12 / contact mismatch';
  end if;

  return new;
end;
$fn$;

revoke all on function public.survey_users_validate() from public, anon, authenticated;

drop trigger if exists survey_users_validate_trg on public.survey_users_responses;
create trigger survey_users_validate_trg
  before insert on public.survey_users_responses
  for each row execute function public.survey_users_validate();

-- Helpful for the analysis queries (small table, but cheap).
create index if not exists survey_users_responses_created_at_idx on public.survey_users_responses (created_at);

-- -----------------------------------------------------------------------------------------------------
-- Row level security and privileges
-- -----------------------------------------------------------------------------------------------------
alter table public.survey_users_responses enable row level security;
alter table public.survey_users_responses force row level security;

-- Supabase grants ALL on new public tables to anon and authenticated by default. Start from nothing.
revoke all on public.survey_users_responses from public, anon, authenticated;

-- anon may INSERT exactly the columns the page sends. id and created_at are set by the database.
grant insert (
  submission_id, started_at, duration_sec, screened_out, status, residence, residence_detail, top_problems,
  fake_listing_experience, try_likelihood, answers, contact_name, contact_whatsapp, contact_consent,
  utm_source, utm_medium, utm_campaign, utm_content, referrer, device, lang
) on public.survey_users_responses to anon;

drop policy if exists survey_users_anon_insert on public.survey_users_responses;
create policy survey_users_anon_insert
  on public.survey_users_responses
  for insert
  to anon
  with check (
    started_at is not null
    and started_at > now() - interval '60 days'
    and started_at < now() + interval '2 days'
  );
-- The window is wide on purpose: started_at comes from the participant's device clock, and phones with a
-- wrong date or time zone are common. A narrow window would silently reject real answers.

-- No SELECT / UPDATE / DELETE policy and no such privilege exists for anon or authenticated, so those
-- operations are refused. The page never needs to read a row: a repeated submission_id is answered by
-- PostgREST with HTTP 409 (Postgres 23505), which the page treats as "already saved".

-- Ask PostgREST to pick up the new table now (Supabase usually does this by itself).
notify pgrst, 'reload schema';
