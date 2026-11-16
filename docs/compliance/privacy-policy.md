# Privacy policy: structure and change log (version 2026-11-13)

Source texts: `public/i18n/legal/{ar,en,de,tr}/privacy.json` (25 sections, same structure in every language, checked by
`scripts/check-legal-parity.mjs` and `tools/lib/legal-content.test.mjs`). Rendered at `/privacy-policy` (`?lang=de|en|tr|ar`
shows that language for the visit only). Identity values come from `controller-identity.ts` through `{{TOKENS}}`.

## Sections changed in this version (numbers as shown to readers)

| § | Change |
|---|---|
| 1 | States that the text is information and does not ask for consent (removed "if you do not agree, do not use"). |
| 2 | Controller identity: trading name, website, correspondence city/country, four mailboxes; no DPO or EU representative appointed. |
| 4 | Contact form, waitlist (purpose: launch notice only) and newsletter listed separately. |
| 5 | Hosting-provider logs (IP, time, URL, browser) added. |
| 6 | Public listings: who can see them, photos via public links, exact vs approximate location, republishing on own social channels without contact data, no sale/licensing to others, copies by third parties. |
| 9 | Cookies/storage by category: strictly necessary, preferences, first-party measurement (consent in EU/EEA/UK/CH/TR/unknown), no third-party analytics; ads module off. |
| 10 | Newsletter purpose added. |
| 11 | Legal bases per activity (contract, legal obligation, legitimate interests, consent) and the right to object (Art. 21), incl. direct marketing. |
| 13 | Providers list completed (Resend newsletter use, SMS providers, Telegram/Meta channels, optional DeepL/Nominatim). |
| 14 | Transfers: no compliance claim; mechanisms "being verified" and recorded in a register. |
| 15 | Retention table aligned with the code (see `data-retention-policy.md`). |
| 17 | Rights with the request route, verification without ID documents by default, 1 month (+2) deadline, free. |
| 18 | Account deletion steps incl. newsletter erasure and legal holds. |
| 19 | Newsletter and marketing: separate, unticked, double opt-in, service mail vs marketing, unsubscribe without login, evidence, waitlist separate, no marketing to users by default. |
| 24 | Changes: version and dates shown, material changes notified in advance, explicit consent where required, editorial changes. |
| 25 | Contact and complaints to a supervisory authority (Turkish text names the KVKK Board). |

Turkish adds KVKK references (Art. 5, 9, 11) where they apply. German uses DSGVO article numbering and § 25 TDDDG.

## Requires Legal Review

All four languages (none reviewed by a lawyer; Turkish shows a notice saying so), Syria-specific law, retention of
consent records after account closure, the KVKK 30-day deadline vs GDPR one month.
