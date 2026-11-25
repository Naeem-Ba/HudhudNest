-- Offices survey: allow "other area in Syria" (area = 'other', area_detail holds the governorate/city text).
-- Run ONCE in the SQL editor of the project that holds survey.survey_offices_responses (the table created by
-- 20261122100000_survey_offices.sql). If you run the updated 20261122100000 file on a fresh database instead, this
-- file is not needed (it is safe to run anyway). Existing rows stay valid.
alter table survey.survey_offices_responses drop constraint if exists so_area_chk;
alter table survey.survey_offices_responses add constraint so_area_chk check (area in ('damascus', 'rif_damascus', 'other'));
notify pgrst, 'reload schema';
