-- Retention for the launch-page waitlist (docs/compliance/data-retention-policy.md).
--
-- NOT applied automatically. See supabase/README.md. Needs the pg_cron extension (Database > Extensions > pg_cron).
-- Deletes signups older than 12 months, every day at 03:15 UTC. After the launch notice has been sent, delete all
-- rows by hand (delete from public.waitlist_signups;) and unschedule the job (select cron.unschedule('waitlist-retention');).

create extension if not exists pg_cron;

select cron.schedule(
  'waitlist-retention',
  '15 3 * * *',
  $$ delete from public.waitlist_signups where created_at < now() - interval '12 months' $$
);
