-- Market-validation survey for real-estate offices (B2B, GATE 1): public/survey/survey-offices.html, served at /survey/offices.
--
-- NOT applied automatically. Apply it by hand, staging first (see supabase/README.md).
-- Recommended: a SEPARATE Supabase project used only for research surveys, NOT the project that hosts the platform's
-- application database. The survey page ships the anon key in public HTML; on a project that also holds the app's
-- tables, that key reaches every table PostgREST exposes there, so any table without RLS would be readable.
--
-- Security model (read before changing anything):
--   * The Supabase anon key is NOT an admin key. It is public by design and identifies the "anon" role. Everything the
--     browser can do is decided by the grants, the RLS policy and the CHECK constraints below.
--   * anon may INSERT (only the listed columns) and nothing else: no SELECT, UPDATE or DELETE, so nobody can read,
--     change or remove responses with the anon key. Never put the service_role key in the browser.
--   * INSERT-only does NOT stop flooding or automated submissions. Anyone with the page can post rows. Limits:
--       - the constraints reject malformed rows, and submission_id is unique, but a bot can generate new UUIDs;
--       - there is no IP-based rate limit (we deliberately do not collect IP addresses).
--     Extra measures if abuse appears: (1) watch daily counts with the queries in the analysis file; (2) emergency stop:
--     "revoke insert on public.survey_offices_responses from anon;" (re-grant the column list below to reopen);
--     (3) move the insert behind a Supabase Edge Function with a privacy-friendly challenge (e.g. Cloudflare Turnstile)
--     and a per-ref quota; (4) discard rows by ref/time window during analysis (rows can be filtered, not trusted).
--
-- Data minimisation: no IP address, no user agent, no fingerprint. "device" is a coarse class (mobile/tablet/desktop)
-- derived from screen width; "referrer" holds only the referring origin, never a full URL.

create table if not exists public.survey_offices_responses (
  id                uuid primary key default gen_random_uuid(),
  submission_id     uuid not null unique,          -- the uuid type itself guarantees a valid UUID
  created_at        timestamptz not null default now(),
  started_at        timestamptz,
  duration_sec      int,

  respondent_role   text not null,
  office_name       text,
  area              text not null,
  area_detail       text,
  listings_count    text not null,
  rent_share        text not null,
  channels          text[] not null,
  best_lead_source  text not null,
  monthly_ad_spend  text not null,
  top_problems      text[] not null,
  tried_platform    text not null,
  join_drivers      text[] not null,
  uploader          text not null,
  payment_model     text not null,
  price_range       text,
  founding_interest text not null,

  answers           jsonb not null,

  contact_name      text,
  contact_whatsapp  text,
  contact_consent   boolean not null default false,

  ref               text,
  utm_source        text,
  utm_medium        text,
  utm_campaign      text,
  referrer          text,
  device            text,

  -- Allowed values (must match the codes in survey-offices.html; CONFIG.PRICE_RANGES ids must match price_range).
  constraint so_role_chk        check (respondent_role in ('owner', 'partner', 'employee', 'independent_broker')),
  constraint so_area_chk        check (area in ('damascus', 'rif_damascus')),
  constraint so_listings_chk    check (listings_count in ('lt10', '10_30', '31_100', 'gt100')),
  constraint so_rent_share_chk  check (rent_share in ('rent', 'sale', 'equal')),
  constraint so_channels_chk    check (
    cardinality(channels) between 1 and 7
    and channels <@ array['fb_groups', 'fb_ig_page', 'whatsapp', 'ad_platforms', 'storefront', 'word_of_mouth', 'other']::text[]
    -- "we do not publish" cannot be combined with a publishing channel
    and (not ('word_of_mouth' = any(channels)) or cardinality(channels) = 1)
  ),
  constraint so_lead_source_chk check (best_lead_source in
    ('fb_groups', 'fb_ig_page', 'whatsapp', 'ad_platforms', 'storefront', 'word_of_mouth', 'other')),
  constraint so_ad_spend_chk    check (monthly_ad_spend in ('zero', 'lt25', '25_100', 'gt100', 'prefer_not')),
  constraint so_problems_chk    check (
    cardinality(top_problems) between 1 and 2
    and top_problems <@ array['post_buried', 'unserious_leads', 'copied_listings', 'hard_to_stand_out',
                              'unlicensed_competition', 'no_tracking', 'management_hassle', 'other']::text[]
  ),
  constraint so_tried_chk       check (tried_platform in ('still_using', 'stopped', 'never_used')),
  constraint so_drivers_chk     check (
    cardinality(join_drivers) between 1 and 3
    and join_drivers <@ array['serious_leads', 'office_profile', 'qr_code', 'listing_views', 'upload_assistance',
                              'listing_protection', 'free_start', 'other']::text[]
  ),
  constraint so_uploader_chk    check (uploader in ('self', 'employee', 'assistance_needed')),
  constraint so_payment_chk     check (payment_model in ('monthly_subscription', 'per_listing', 'free_featured', 'never_pay')),
  constraint so_price_chk       check (price_range is null or price_range in ('zero', 'lt10', '10_25', '25_50', 'gt50', 'unsure')),
  constraint so_founding_chk    check (founding_interest in ('yes_commit', 'interested', 'no')),
  constraint so_device_chk      check (device is null or device in ('mobile', 'tablet', 'desktop')),

  -- Q12 branch: never_pay => no price (Q12b skipped); any other model => price required (Q12b is mandatory).
  constraint so_price_branch_chk check (
    (payment_model = 'never_pay' and price_range is null)
    or (payment_model <> 'never_pay' and price_range is not null)
  ),

  -- Contact data only with explicit consent; consent is meaningful only with a number.
  constraint so_contact_consent_chk check (contact_consent or (contact_whatsapp is null and contact_name is null)),
  constraint so_consent_needs_number_chk check (not contact_consent or contact_whatsapp is not null),
  constraint so_whatsapp_fmt_chk check (contact_whatsapp is null or contact_whatsapp ~ '^\+[1-9][0-9]{7,14}$'),
  -- Q13 -> Q14: offices that say yes_commit or interested must leave a valid number and consent.
  constraint so_interest_contact_chk check (
    founding_interest = 'no' or (contact_consent and contact_whatsapp is not null)
  ),

  -- Numbers and text lengths.
  constraint so_duration_chk     check (duration_sec is null or duration_sec >= 0),
  constraint so_text_len_chk     check (
    (office_name is null or char_length(btrim(office_name)) between 1 and 100)
    and (area_detail is null or char_length(btrim(area_detail)) between 1 and 100)
    and (contact_name is null or char_length(btrim(contact_name)) between 1 and 80)
  ),
  constraint so_tracking_len_chk check (
    (ref is null or char_length(ref) between 1 and 100)
    and (utm_source is null or char_length(utm_source) between 1 and 100)
    and (utm_medium is null or char_length(utm_medium) between 1 and 100)
    and (utm_campaign is null or char_length(utm_campaign) between 1 and 100)
    and (referrer is null or char_length(referrer) between 1 and 200)
  ),

  -- answers: a JSON object with every fixed key present (skipped questions hold JSON null), at most 8 KB.
  constraint so_answers_size_chk check (pg_column_size(answers) < 8192),
  constraint so_answers_keys_chk check (
    jsonb_typeof(answers) = 'object'
    and answers ?& array['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10', 'q11', 'q12a', 'q12b', 'q13',
                         'q14', 'q15', 'q5_platform_names', 'q8_order', 'q8_other', 'q9_platform_name',
                         'q9_stop_reason', 'q10_order', 'q10_other', 'q14_name', 'q14_whatsapp', 'q14_consent']
  ),
  -- answers must agree with the typed columns, so analysis on either gives the same result.
  constraint so_answers_mirror_chk check (
    answers->>'q1' = respondent_role
    and answers->'q2'->>'area' = area
    and (answers->'q2'->>'office_name') is not distinct from office_name
    and (answers->'q2'->>'area_detail') is not distinct from area_detail
    and answers->>'q3' = listings_count
    and answers->>'q4' = rent_share
    and answers->'q5' = to_jsonb(channels)
    and answers->>'q6' = best_lead_source
    and answers->>'q7' = monthly_ad_spend
    and answers->'q8' = to_jsonb(top_problems)
    and answers->>'q9' = tried_platform
    and answers->'q10' = to_jsonb(join_drivers)
    and answers->>'q11' = uploader
    and answers->>'q12a' = payment_model
    and (answers->>'q12b') is not distinct from price_range
    and answers->>'q13' = founding_interest
    and (answers->>'q14_name') is not distinct from contact_name
    and (answers->>'q14_whatsapp') is not distinct from contact_whatsapp
    and answers->'q14_consent' = to_jsonb(contact_consent)
  ),
  -- Dependent answers exist only when their parent answer allows them (no stale branch data).
  constraint so_answers_branch_chk check (
    ((tried_platform = 'stopped') = (coalesce(btrim(answers->>'q9_stop_reason'), '') <> ''))
    and (tried_platform = 'still_using' or answers->>'q9_platform_name' is null)
    and ('ad_platforms' = any(channels) or answers->>'q5_platform_names' is null)
    and ('other' = any(top_problems) or answers->>'q8_other' is null)
    and ('other' = any(join_drivers) or answers->>'q10_other' is null)
    and (answers->>'q9_stop_reason' is null or char_length(answers->>'q9_stop_reason') <= 300)
    and (answers->>'q15' is null or char_length(answers->>'q15') <= 600)
  )
);

create index if not exists survey_offices_created_at_idx on public.survey_offices_responses (created_at);
create index if not exists survey_offices_founding_idx   on public.survey_offices_responses (founding_interest, listings_count);
create index if not exists survey_offices_ref_idx        on public.survey_offices_responses (ref);

alter table public.survey_offices_responses enable row level security;
alter table public.survey_offices_responses force row level security;

-- Privileges: start from nothing (Supabase grants anon/authenticated on new public tables by default), then give anon
-- INSERT on exactly the columns the page sends. id and created_at are always set by the database.
revoke all on public.survey_offices_responses from public, anon, authenticated;
grant insert (
  submission_id, started_at, duration_sec, respondent_role, office_name, area, area_detail, listings_count, rent_share,
  channels, best_lead_source, monthly_ad_spend, top_problems, tried_platform, join_drivers, uploader, payment_model,
  price_range, founding_interest, answers, contact_name, contact_whatsapp, contact_consent, ref, utm_source, utm_medium,
  utm_campaign, referrer, device
) on public.survey_offices_responses to anon;

drop policy if exists survey_offices_anon_insert on public.survey_offices_responses;
create policy survey_offices_anon_insert
  on public.survey_offices_responses
  for insert
  to anon
  with check (jsonb_typeof(answers) = 'object');

-- No select / update / delete policy exists for anon or authenticated, so those operations are denied (and not granted).
-- A duplicate submission_id fails with 23505 (HTTP 409 from PostgREST); the page treats exactly that as "already saved".
