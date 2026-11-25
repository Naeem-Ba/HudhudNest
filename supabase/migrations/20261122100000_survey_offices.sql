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
--     "revoke insert on survey.survey_offices_responses from anon;" (re-grant the column list below to reopen);
--     (3) move the insert behind a Supabase Edge Function with a privacy-friendly challenge (e.g. Cloudflare Turnstile)
--     and a per-ref quota; (4) discard rows by ref/time window during analysis (rows can be filtered, not trusted).
--
-- Data minimisation: no IP address, no user agent, no fingerprint. "device" is a coarse class (mobile/tablet/desktop)
-- derived from screen width; "referrer" holds only the referring origin, never a full URL.

-- v2 (2026-11-24): the table lives in schema "survey", NOT "public": the API Migrator revokes every anon grant on public
-- tables each time it runs (see 20261123103000_survey_users_move_to_survey_schema.sql). After applying this file add
-- "survey" to Project Settings -> Data API -> Exposed schemas (the page sends Content-Profile: survey).
-- Changes from v1: Q8 gets "none"; Q9 reason optional; price ladder per payment model; Q7b leads, Q13b expected listings,
-- Q13c barrier; Q10b stance on trust features; the phone number is never required (no so_interest_contact_chk).
create schema if not exists survey;
revoke all on schema survey from public;
grant usage on schema survey to anon, authenticated, service_role;

create table if not exists survey.survey_offices_responses (
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
  leads_from_ads    text,
  expected_listings text,
  barrier           text,
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
  constraint so_role_chk        check (respondent_role in ('owner', 'partner', 'employee', 'independent_broker', 'property_owner')),
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
                              'unlicensed_competition', 'no_tracking', 'management_hassle', 'other', 'none']::text[]
    -- "no notable problem" cannot be combined with a problem
    and (not ('none' = any(top_problems)) or cardinality(top_problems) = 1)
  ),
  constraint so_tried_chk       check (tried_platform in ('still_using', 'stopped', 'never_used')),
  constraint so_drivers_chk     check (
    cardinality(join_drivers) between 1 and 3
    and join_drivers <@ array['serious_leads', 'office_profile', 'qr_code', 'listing_views', 'upload_assistance',
                              'listing_protection', 'free_start', 'other']::text[]
  ),
  constraint so_uploader_chk    check (uploader in ('self', 'employee', 'assistance_needed')),
  constraint so_payment_chk     check (payment_model in ('monthly_subscription', 'per_listing', 'free_featured', 'never_pay')),
  constraint so_price_chk       check (price_range is null or price_range in
    ('zero', 'unsure', 'm_lt5', 'm_5_10', 'm_10_15', 'm_gt15', 'l_lt1', 'l_1_2', 'l_gt2', 'f_lt3', 'f_3_5', 'f_gt5')),
  constraint so_price_model_chk check (
    price_range is null or price_range in ('zero', 'unsure')
    or (payment_model = 'monthly_subscription' and price_range like 'm\_%')
    or (payment_model = 'per_listing' and price_range like 'l\_%')
    or (payment_model = 'free_featured' and price_range like 'f\_%')
  ),
  constraint so_leads_chk check (leads_from_ads is null or leads_from_ads in ('none', '1_2', '3_5', 'gt5', 'unknown')),
  constraint so_leads_branch_chk check ((monthly_ad_spend in ('zero', 'prefer_not')) = (leads_from_ads is null)),
  constraint so_expected_chk check (expected_listings is null or expected_listings in ('lt5', '5_10', '11_20', 'gt20')),
  constraint so_barrier_chk check (barrier is null or barrier in
    ('need_details', 'trust_new', 'no_time', 'no_value', 'already_enough', 'cost', 'data_sharing', 'other')),
  -- Q13 branch: yes_commit => expected listings and no barrier; interested/no => barrier and no expected listings.
  constraint so_q13_branch_chk check (
    (founding_interest = 'yes_commit' and expected_listings is not null and barrier is null)
    or (founding_interest <> 'yes_commit' and expected_listings is null and barrier is not null)
  ),
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
  -- v2: leaving a number is optional for every answer to Q13.

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
    and answers ?& array['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10', 'q10b', 'q11', 'q12a', 'q12b', 'q13', 'q7b', 'q13b', 'q13c',
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
    and (answers->>'q7b') is not distinct from leads_from_ads
    and (answers->>'q13b') is not distinct from expected_listings
    and (answers->>'q13c') is not distinct from barrier
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
    (tried_platform = 'stopped' or answers->>'q9_stop_reason' is null)
    and (tried_platform = 'still_using' or answers->>'q9_platform_name' is null)
    and ('ad_platforms' = any(channels) or answers->>'q5_platform_names' is null)
    and ('other' = any(top_problems) or answers->>'q8_other' is null)
    and ('other' = any(join_drivers) or answers->>'q10_other' is null)
    and (answers->>'q9_stop_reason' is null or char_length(answers->>'q9_stop_reason') <= 300)
    and (answers->>'q15' is null or char_length(answers->>'q15') <= 600)
  )
);

create index if not exists survey_offices_created_at_idx on survey.survey_offices_responses (created_at);
create index if not exists survey_offices_founding_idx   on survey.survey_offices_responses (founding_interest, listings_count);
create index if not exists survey_offices_ref_idx        on survey.survey_offices_responses (ref);

alter table survey.survey_offices_responses enable row level security;
alter table survey.survey_offices_responses force row level security;

-- Privileges: start from nothing (Supabase grants anon/authenticated on new public tables by default), then give anon
-- INSERT on exactly the columns the page sends. id and created_at are always set by the database.
revoke all on survey.survey_offices_responses from public, anon, authenticated;
grant insert (
  submission_id, started_at, duration_sec, respondent_role, office_name, area, area_detail, listings_count, rent_share,
  channels, best_lead_source, monthly_ad_spend, top_problems, tried_platform, join_drivers, uploader, payment_model,
  price_range, leads_from_ads, expected_listings, barrier, founding_interest, answers, contact_name, contact_whatsapp, contact_consent, ref, utm_source, utm_medium,
  utm_campaign, referrer, device
) on survey.survey_offices_responses to anon;

drop policy if exists survey_offices_anon_insert on survey.survey_offices_responses;
create policy survey_offices_anon_insert
  on survey.survey_offices_responses
  for insert
  to anon
  with check (jsonb_typeof(answers) = 'object');

-- No select / update / delete policy exists for anon or authenticated, so those operations are denied (and not granted).
-- A duplicate submission_id fails with 23505 (HTTP 409 from PostgREST); the page treats exactly that as "already saved".

-- New tables created in this schema later must not be open by default.
alter default privileges in schema survey revoke all on tables from public, anon, authenticated;
notify pgrst, 'reload schema';
