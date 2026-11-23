-- =====================================================================================================
-- Move the users survey table out of "public" into its own schema "survey".
-- =====================================================================================================
--
-- Why: this survey currently lives in the app's Supabase project (hudhudnest-staging). The API's
-- Migrator (HudhudNestApi.Migrator -> RowLevelSecurityEnforcer) runs
--   REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated
-- on every run. That protection is deliberate for the app's tables, but it also removes the survey's
-- anon INSERT grant, and the page then shows "not available ... configuration error" (HTTP 401).
-- The enforcer only touches schema public, so a table in schema survey keeps its grants.
--
-- Run it ONCE in the Supabase SQL editor of the project that holds survey_users_responses. Safe to
-- re-run. No data is copied or deleted: ALTER ... SET SCHEMA moves the table with its rows, constraints,
-- index, trigger, RLS policy and column grants.
--
-- AFTER running it, one dashboard setting is required (it cannot be set from SQL on Supabase):
--   Project Settings -> Data API -> "Exposed schemas" -> add  survey  -> Save.
-- Without it PostgREST answers 406 (PGRST106) and the page keeps the answers on the device and retries.
-- The page sends the header "Content-Profile: survey" so its INSERT goes to this schema.
-- =====================================================================================================

create schema if not exists survey;

-- PostgREST needs USAGE on the schema for the API roles; nothing else in the schema is granted.
revoke all on schema survey from public;
grant usage on schema survey to anon, authenticated, service_role;

do $move$
begin
  if to_regclass('public.survey_users_responses') is not null
     and to_regclass('survey.survey_users_responses') is null then
    alter table public.survey_users_responses set schema survey;
  end if;
  if to_regprocedure('public.survey_users_validate()') is not null
     and to_regprocedure('survey.survey_users_validate()') is null then
    alter function public.survey_users_validate() set schema survey;
  end if;
end
$move$;

-- The function runs with search_path = '' and names nothing unqualified except built-ins, so moving it
-- needs no body change. The trigger keeps pointing at it (triggers reference the function by OID).
revoke all on function survey.survey_users_validate() from public, anon, authenticated;

-- Re-assert the privileges from the original file, in case the Migrator already revoked them.
alter table survey.survey_users_responses enable row level security;
alter table survey.survey_users_responses force row level security;
revoke all on survey.survey_users_responses from public, anon, authenticated;
grant insert (
  submission_id, started_at, duration_sec, screened_out, status, residence, residence_detail, top_problems,
  fake_listing_experience, try_likelihood, answers, contact_name, contact_whatsapp, contact_consent,
  utm_source, utm_medium, utm_campaign, utm_content, referrer, device, lang
) on survey.survey_users_responses to anon;

-- New tables created in this schema later must not be open by default.
alter default privileges in schema survey revoke all on tables from public, anon, authenticated;
alter default privileges in schema survey revoke all on functions from public, anon, authenticated;

notify pgrst, 'reload schema';

-- Quick check (expected: one row, schema "survey", rls true, forced true):
-- select n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity
-- from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relname = 'survey_users_responses';
