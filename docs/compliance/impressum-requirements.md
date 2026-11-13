# Impressum requirements (2026-11-13)

Page: `/impressum` (marketing shell), all four UI languages, filled only from
`src/app/features/legal/controller-identity.ts`. `/imprint` redirects there (Angular and Netlify 301).

| Field (DDG § 5 / MStV § 18 / GDPR Art. 13(1)(a)) | Value | Status |
|---|---|---|
| Trading name | HudhudNest (هدهد نيست) | Implemented (owner-approved) |
| Legal name of the person or entity operating the service | not known | **Blocking Launch** |
| Legal form | not known (no GmbH/LLC assumed) | **Blocking Launch** |
| Authorised representative | not known | **Blocking Launch** |
| Street and number, postal code | not known | **Blocking Launch** |
| City and country for correspondence | Damascus, Syrian Arab Republic | Implemented (owner-approved) |
| Quick electronic contact | support@, legal@, privacy@, security@hudhudnest.com | Implemented (mailboxes must be tested by the owner) |
| Register court and number | none stated | Requires Legal Review (only if registered) |
| VAT ID | none stated | Requires Legal Review (only if one exists) |
| Responsible for editorial content (MStV § 18(2)) | not shown | Requires Legal Review (only for journalistic-editorial content) |
| EU representative (GDPR Art. 27) | not appointed | Requires Legal Review (see below) |
| Data protection officer | not appointed | Requires Legal Review |
| Consumer dispute resolution statement (§ 36 VSBG) | not shown | Requires Legal Review if German consumers are targeted |

While any mandatory field is missing, the page shows an "incomplete" notice listing them, and `npm run check:legal`
fails. No placeholder text is published.

## EU representative (Art. 27)

Needed when a controller not established in the EU offers goods or services to people in the EU or monitors them, unless
the processing is occasional, not large-scale special-category data, and unlikely to result in a risk. The German-language
marketing site and German paths point towards offering services in the EU. If the owner confirms the service targets
Syria (and Arabic-speaking users) only, remove the German-market signals or document why they do not target the EU.
Otherwise appoint a representative and add it to `controller-identity.ts` (`euRepresentative`). **Human decision.**
