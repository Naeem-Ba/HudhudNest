-- Offices survey v3 (2026-11-25), applies on top of 20261122100000 (+ 20261125100000). Run ONCE in the SQL editor of the project
-- that holds survey.survey_offices_responses. Existing v1/v2 rows stay valid (no value they hold is removed).
-- Changes (from the 2026-11-25 audit):
--   * Q12b: a free approximate amount replaces the assumed price ladders. price_range = 'amount' + price_amount (whole USD).
--     The old ladder ids stay allowed so earlier rows remain readable.
--   * Q13: four commitment levels instead of one double-barrelled option. lv_no / lv_details need a barrier (Q13c);
--     lv_trial needs the expected listings (Q13b); lv_call is the only level that needs a WhatsApp number with consent
--     (the cost-bearing step); the legacy codes yes_commit / interested / no keep their old branch rules.
--   * Q10: "none of these" is a new exclusive answer (free_start stays allowed for old rows, the page no longer offers it).
alter table survey.survey_offices_responses add column if not exists price_amount int;
grant insert (price_amount) on survey.survey_offices_responses to anon;

alter table survey.survey_offices_responses drop constraint if exists so_price_chk;
alter table survey.survey_offices_responses add constraint so_price_chk check (price_range is null or price_range in
  ('zero', 'unsure', 'amount', 'm_lt5', 'm_5_10', 'm_10_15', 'm_gt15', 'l_lt1', 'l_1_2', 'l_gt2', 'f_lt3', 'f_3_5', 'f_gt5'));
alter table survey.survey_offices_responses drop constraint if exists so_price_model_chk;
alter table survey.survey_offices_responses add constraint so_price_model_chk check (
  price_range is null or price_range in ('zero', 'unsure', 'amount')
  or (payment_model = 'monthly_subscription' and price_range like 'm\_%')
  or (payment_model = 'per_listing' and price_range like 'l\_%')
  or (payment_model = 'free_featured' and price_range like 'f\_%'));
alter table survey.survey_offices_responses drop constraint if exists so_price_amount_chk;
alter table survey.survey_offices_responses add constraint so_price_amount_chk check (
  (price_range = 'amount') = (price_amount is not null)
  and (price_amount is null or price_amount between 1 and 100000)
  and (price_amount is null or payment_model <> 'never_pay'));
alter table survey.survey_offices_responses drop constraint if exists so_price_amount_mirror_chk;
alter table survey.survey_offices_responses add constraint so_price_amount_mirror_chk check (
  (answers ->> 'q12b_amount') is not distinct from price_amount::text);

alter table survey.survey_offices_responses drop constraint if exists so_founding_chk;
alter table survey.survey_offices_responses add constraint so_founding_chk check (founding_interest in
  ('yes_commit', 'interested', 'no', 'lv_no', 'lv_details', 'lv_call', 'lv_trial'));
alter table survey.survey_offices_responses drop constraint if exists so_q13_branch_chk;
alter table survey.survey_offices_responses add constraint so_q13_branch_chk check (
  (founding_interest in ('yes_commit', 'lv_trial') and expected_listings is not null and barrier is null)
  or (founding_interest = 'lv_call' and expected_listings is null and barrier is null)
  or (founding_interest in ('interested', 'no', 'lv_no', 'lv_details') and expected_listings is null and barrier is not null));
alter table survey.survey_offices_responses drop constraint if exists so_call_contact_chk;
alter table survey.survey_offices_responses add constraint so_call_contact_chk check (
  founding_interest <> 'lv_call' or (contact_consent and contact_whatsapp is not null));

alter table survey.survey_offices_responses drop constraint if exists so_drivers_chk;
alter table survey.survey_offices_responses add constraint so_drivers_chk check (
  cardinality(join_drivers) between 1 and 3
  and join_drivers <@ array['serious_leads', 'office_profile', 'qr_code', 'listing_views', 'upload_assistance',
                            'listing_protection', 'free_start', 'other', 'none']::text[]
  and (not ('none' = any (join_drivers)) or cardinality(join_drivers) = 1));
notify pgrst, 'reload schema';
