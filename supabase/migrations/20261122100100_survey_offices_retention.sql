-- Retention for the offices survey (CONFIG.RETENTION_TEXT on the page says "12 شهراً"; keep the two in step).
--
-- NOT applied automatically. See supabase/README.md. Needs the pg_cron extension (Database > Extensions > pg_cron).
-- Deletes responses older than 12 months, every day at 03:25 UTC. If the page's retention text changes, change the
-- interval here too. Individual deletion requests (sent to CONFIG.CONTACT_EMAIL) are handled by hand in the dashboard,
-- e.g. delete from survey.survey_offices_responses where contact_whatsapp = '+963...';

create extension if not exists pg_cron;

select cron.schedule(
  'survey-offices-retention',
  '25 3 * * *',
  $$ delete from survey.survey_offices_responses where created_at < now() - interval '12 months' $$
);
