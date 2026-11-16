# Legal launch readiness (2026-11-13)

## Verdict: **NOT READY**

The rules of the brief decide this: the operator's legal identity is incomplete and no international transfer has been
verified. Both are Blocking Launch. The engineering controls are in place and tested; what is missing is facts and
documents only the owner (and a lawyer) can supply.

## A. Implemented (code, tested)

- Central controller identity; legal texts and Impressum read from it; no invented entity data (test-enforced).
- Privacy policy (25 §) and terms (29 §) rewritten in ar/en/de/tr, parity- and content-tested.
- `/impressum` in four languages with an open "incomplete" notice; `/datenschutz` and `/imprint` 301-redirect.
- Consent evidence with language and method; re-consent prompt after material changes.
- Newsletter with double opt-in, token unsubscribe without login, RFC 8058 one-click, suppression, append-only evidence,
  marketing sender that refuses unconfirmed addresses; integration lifecycle test passes.
- First-party measurement consent for EU/EEA/UK/CH/TR/unknown visitors; settings toggle; withdrawal deletes values.
- Legal hold pausing scheduled deletion; retention sweep for newsletter, contact messages, leads.
- `npm run check:legal` production gate.

## B. Partially implemented

- Moderation appeal: by e-mail with a promised human review; no in-app workflow.
- Old legal versions: kept in git; no public archive page.
- Backup restore replay of deletions: runbook step, not automated.

## C. Planned (owner action, no code needed)

- Apply `supabase/migrations/20261113120000_waitlist_retention.sql`.
- Deploy the API migration `AddNewsletterConsentAndLegalHolds` (additive) with the Migrator before the app release.
- Optional: set `Newsletter:OneClickUnsubscribeBaseUrl` to the API origin to enable the one-click header.

## D. Blocking Launch

| # | Item | Who |
|---|---|---|
| 1 | Operator legal name, legal form, representative, street, postal code (`controller-identity.ts`) | Owner |
| 2 | Region, plan and DPA for Supabase, Render, Netlify, Cloudinary, Resend, each SMS provider, backup storage; transfer mechanism per provider | Owner + lawyer |
| 3 | Publication and effective dates in `consent-versions.ts` (set on the day of publication, never back-dated) | Owner |
| 4 | Lawyer review of all four languages | Lawyer |

## E. Requires Legal Review

EU representative (Art. 27) vs the German-language marketing site; Syrian governing law clause; DSA duties; § 36 VSBG
statement; KVKK/VERBIS if Türkiye is targeted; consent-record retention after closure; backups 12 months vs 90 days.

## Required decisions (owner)

1. **Target market**: Syria only (then remove German-market signals) or also EU/DACH (then EU representative, full GDPR,
   German consumer rules)? This drives most of section E.
2. **Operator identity**: which person or entity operates HudhudNest, with legal form and full address.
3. **Backups**: keep 12-month monthly backups (texts say so today) or shorten to 90 days.
4. **Audit logs**: keep 365 days (current) or 180 days (brief's target).
5. **Turkish review notice**: keep it alone, add the same notice to all languages until the lawyer review, or remove it after review.
6. **Ads module**: stays off until a certified CMP and an updated policy exist.

## How to clear this report

Fill item 1 and 3, record item 2 in `international-data-transfers.md`, get the lawyer's sign-off, then run
`npm run check:legal` (must pass) and update this file to READY or READY WITH CONDITIONS.
