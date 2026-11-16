# Data retention schedule (2026-11-13)

Every period below is what the code does today, unless the "Status" column says otherwise. Configuration keys are in the
API `appsettings.json`; the jobs take a PostgreSQL advisory lock so only one instance runs them.

| Data | Period | Trigger / job | Status |
|---|---|---|---|
| Account and profile | While the account exists; removed or de-identified when deletion runs (after 30-day grace) | `AccountDeletionHostedService` | Implemented |
| Listings and photos | Expire by lifecycle; deleted with photos 30 days after expiry; on account deletion expire at once (agency members' listings pass to the owner) | listing lifecycle jobs | Implemented |
| Refresh tokens | Max 30 days; rows deleted 30 days after expiry | `AuthDataRetention` | Implemented |
| OTP codes | Hash only, minutes valid; deleted 1 day after expiry | `AuthDataRetention` | Implemented |
| IP addresses (sessions, contact) | Cleared after 90 days | `AuthDataRetention` / contact | Implemented |
| Security audit log | Sign-in events 90 days; admin and other account events 365 days | `AuditLogRetention` | Implemented (target 180 days not adopted: owner decision) |
| Notifications | Per notification retention job | existing | Implemented |
| Listing view events | 90 days | existing | Implemented |
| Contact form messages | 12 months after read (`DataRetention:ContactMessageDays` 365), at most 24 months after arrival (`ContactMessageMaxDays` 730) | `ComplianceRetentionHostedService` | Implemented |
| Old interest form (Leads) | 12 months after arrival (`LeadDays` 365) | `ComplianceRetentionHostedService` | Implemented |
| Launch-page waitlist (Supabase) | Delete after the launch notice, at the latest 12 months after sign-up | SQL below, run by the owner in Supabase | Planned (owner action) |
| Newsletter: unconfirmed request | 30 days after the confirmation link expired (`UnconfirmedNewsletterDays` 30) | `ComplianceRetentionHostedService` | Implemented |
| Newsletter: after unsubscribe | Evidence kept 3 years (`NewsletterEvidenceDays` 1095), then e-mail erased, SHA-256 hash and events kept as suppression | `ComplianceRetentionHostedService` | Implemented |
| Newsletter: account deleted | Withdrawn and e-mail erased inside the deletion transaction | `DeleteUserCommandHandler` | Implemented |
| Consent records (terms, privacy) | Life of the account, then as long as needed to prove acceptance until limitation periods end | none (kept) | Requires Legal Review (define the end date per market) |
| Push tokens | Until notifications are off or the account is deleted | existing | Implemented |
| Operational/error logs | Provider's own retention (Render, Netlify) | provider | Requires verification |
| Backups | Every 48 h, daily 30 days, weekly 12 weeks, monthly 12 months; encrypted | backup workflow | Implemented (conflicts with the 90-day target: human decision) |

## Legal hold

`LegalHold` (API, `api/admin/legal-holds`, Admin role) records an account, a reason (no more than 500 characters, no personal
data beyond what the case needs), who placed it and when. While a hold is active, `GetDueForDeletionAsync` skips the
account, so a scheduled deletion waits. Releasing is idempotent and audited. Holds never block withdrawal of marketing
consent. **Implemented.** Use only for a real dispute or an authority's preservation request.

## Backups and deletion

Deleted data stays in older encrypted backups until they expire. A restore must re-apply deletions made after the backup
was taken (runbook step: replay `AccountDeletion` audit events and newsletter `EmailErased` events after restoring).
**Partially Implemented**: the policy is stated; the replay step is a manual runbook item.

## Supabase waitlist retention (not applied automatically)

`supabase/migrations/20261113120000_waitlist_retention.sql` schedules a daily `pg_cron` job that deletes
`public.waitlist_signups` rows older than 12 months. Apply it like the waitlist migration (supabase/README.md). After
the launch notice is sent, delete all rows and unschedule the job (commands in the file).
