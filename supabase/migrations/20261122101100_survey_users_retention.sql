-- OPTIONAL retention job for survey.survey_users_responses. NOT applied automatically.
-- It enforces the default CONFIG.RETENTION_TEXT of survey-users.html:
--   * name + WhatsApp number removed 12 months after the response (do it by hand earlier, right after the
--     early-access invitations have been sent, with the first UPDATE below);
--   * the whole response deleted after 12 months.
-- If you change RETENTION_TEXT in the page, change the intervals here to match, or do not run this file and
-- delete by hand. Needs the pg_cron extension (Database > Extensions > pg_cron), same as the waitlist job.

create extension if not exists pg_cron;

-- Daily 03:30 UTC: drop contact data older than 12 months (the row stays until the delete below).
select cron.schedule(
  'survey-users-contact-retention',
  '30 3 * * *',
  $$ update survey.survey_users_responses
       set contact_name = null, contact_whatsapp = null
     where (contact_name is not null or contact_whatsapp is not null)
       and created_at < now() - interval '12 months' $$
);

-- Daily 03:45 UTC: delete responses older than 12 months.
select cron.schedule(
  'survey-users-retention',
  '45 3 * * *',
  $$ delete from survey.survey_users_responses where created_at < now() - interval '12 months' $$
);

-- By hand, after the early-access invitations went out (removes every number at once):
--   update survey.survey_users_responses set contact_name = null, contact_whatsapp = null where contact_consent;
-- To stop the jobs:
--   select cron.unschedule('survey-users-contact-retention');
--   select cron.unschedule('survey-users-retention');
-- Deleting one participant's response on request (they quote the 8-character reference from the thank-you screen):
--   delete from survey.survey_users_responses where submission_id::text like '<reference>%';
-- Deleting by WhatsApp number on request:
--   delete from survey.survey_users_responses where contact_whatsapp = '+963...';
