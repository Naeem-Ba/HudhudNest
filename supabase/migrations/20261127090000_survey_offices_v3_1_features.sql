-- Offices survey v3.1 (2026-11-27): questions about the features the platform has been built with.
-- Applies on top of 20261125110100 (v3). Run ONCE in the SQL editor of the project that holds
-- survey.survey_offices_responses, BEFORE publishing the v3.1 page (otherwise the server rejects the new fields and the
-- page keeps the answers on the device and offers a retry). Safe to re-run. Existing v1/v2/v3 rows stay valid:
-- the new columns are nullable, and are only required for rows whose answers.survey_version is 3.1.0 or later.
--   * listing_types   (Q4b)  what the office handles: residential, commercial, land, short_stay, investment, other (1 to 6)
--   * foreign_clients (Q4c)  how often it serves clients who live abroad: often, sometimes, rarely, never
--   * feature_interest(Q10c) up to 3 ideas that would help the office most, or the exclusive answer none
alter table survey.survey_offices_responses add column if not exists listing_types text[];
alter table survey.survey_offices_responses add column if not exists foreign_clients text;
alter table survey.survey_offices_responses add column if not exists feature_interest text[];
grant insert (listing_types, foreign_clients, feature_interest) on survey.survey_offices_responses to anon;

alter table survey.survey_offices_responses drop constraint if exists so_listing_types_chk;
alter table survey.survey_offices_responses add constraint so_listing_types_chk check (
  listing_types is null or (
    cardinality(listing_types) between 1 and 6
    and listing_types <@ array['residential', 'commercial', 'land', 'short_stay', 'investment', 'other']::text[]));

alter table survey.survey_offices_responses drop constraint if exists so_foreign_clients_chk;
alter table survey.survey_offices_responses add constraint so_foreign_clients_chk check (
  foreign_clients is null or foreign_clients in ('often', 'sometimes', 'rarely', 'never'));

alter table survey.survey_offices_responses drop constraint if exists so_feature_interest_chk;
alter table survey.survey_offices_responses add constraint so_feature_interest_chk check (
  feature_interest is null or (
    cardinality(feature_interest) between 1 and 3
    and feature_interest <@ array['translation', 'short_stay', 'investment', 'buyer_requests', 'appointments',
                                  'team_accounts', 'price_tool', 'valuation_requests', 'other', 'none']::text[]
    and (not ('none' = any (feature_interest)) or cardinality(feature_interest) = 1)));

-- answers must agree with the typed columns (same rule as every other question), and the free text exists only with "other".
alter table survey.survey_offices_responses drop constraint if exists so_features_mirror_chk;
alter table survey.survey_offices_responses add constraint so_features_mirror_chk check (
  (listing_types is null or answers -> 'q4b' = to_jsonb(listing_types))
  and (foreign_clients is null or answers ->> 'q4c' = foreign_clients)
  and (feature_interest is null or answers -> 'q10c' = to_jsonb(feature_interest))
  and (feature_interest is null or 'other' = any (feature_interest) or answers ->> 'q10c_other' is null)
  and (answers ->> 'q10c_other' is null or char_length(answers ->> 'q10c_other') <= 150));

-- Rows from the 3.1.0 page must carry all three answers.
alter table survey.survey_offices_responses drop constraint if exists so_features_required_chk;
alter table survey.survey_offices_responses add constraint so_features_required_chk check (
  coalesce(string_to_array(answers ->> 'survey_version', '.')::int[] < array[3, 1, 0], true)
  or (listing_types is not null and foreign_clients is not null and feature_interest is not null));
notify pgrst, 'reload schema';
