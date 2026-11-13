# Newsletter compliance (2026-11-13)

The newsletter is separate from the launch-page waitlist (Supabase, launch notice only) and from service mail.

## Flow (API, `HudhudNestApi.Application/Newsletter`)

1. **Request**: `POST /api/newsletter/subscriptions` (anonymous allowed, rate limit `newsletter-public` 10/hour) or the
   registration box (`newsletterOptIn`). The validator refuses without `consent: true` (`NEWSLETTER_CONSENT_REQUIRED`).
   The answer is always 202, so the endpoint does not reveal whether an address is known.
2. **One row per address**: keyed by SHA-256 of the normalised e-mail (`EmailHash`, unique). Repeats never duplicate.
3. **Double opt-in**: one confirmation mail in the subscriber's language with a 256-bit token (stored hashed, 72 h). The
   mail also carries an "I did not ask for this" unsubscribe link.
4. **Confirm**: `/newsletter/confirm?token=` page posts to `POST /api/newsletter/confirm`; status Active.
5. **Marketing send**: only through `IMarketingEmailSender`, which refuses unless `CanReceiveMarketing` (Active and
   confirmed), and adds the unsubscribe footer, `List-Unsubscribe` and, when configured, `List-Unsubscribe-Post`
   (RFC 8058, `Newsletter:OneClickUnsubscribeBaseUrl`).
6. **Unsubscribe**: footer link to `/newsletter/unsubscribe?token=` (one click on the page, no login; mail scanners that
   only open links cannot unsubscribe), the one-click endpoint, Settings (`DELETE /api/newsletter/me`), or account deletion.
   Takes effect immediately; service mail continues.
7. **Suppression**: after unsubscribe the address is kept 3 years as evidence, then erased; the hash and events remain,
   so a later re-subscription needs a new double opt-in and nothing is ever sent retroactively.

## No retroactive marketing

Existing users were never subscribed. No migration subscribes anyone. Accepting the terms never subscribes anyone.

## Logs

No log line contains the e-mail address or a token (only the subscription id on failures).

## Tests

- Domain and service: `tests/HudhudNestApi.Application.Tests/Newsletter/*` (refuse-then-opt-in, expiry, idempotent
  unsubscribe, no duplicates, mailer failure keeps Pending).
- Integration: `tests/HudhudNestApi.Integration.Tests/Auth/NewsletterConsentLifecycleTests.cs`: register without opt-in,
  opt in, no marketing before confirm, confirm, marketing allowed, unsubscribe by token, marketing refused, service mail
  (forgot password) still delivered, account deletion erases the address, legal hold pauses deletion, retention sweep.
- App: register box unticked and optional, unsubscribe page, confirm page.

## Open

- No campaign tool or admin UI to send newsletters exists (**Planned**; any future sender must use `IMarketingEmailSender`).
- ePrivacy "soft opt-in" for existing customers is not used (stricter).
