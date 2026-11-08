# Legal pages: open items (LEGAL REVIEW REQUIRED)

Texts: `public/i18n/legal/{ar,en,de}/{privacy,terms}.json`. Version + dates: `src/app/core/models/consent-versions.ts`
(one version for all three languages; bump together). Parity check: `node scripts/check-legal-parity.mjs`.

The texts were drafted from what the code actually does (see `docs/privacy/data-inventory.md` in the API repo) and are
**not legal advice**. A lawyer must review all three languages before production launch. Open decisions, which were
deliberately not invented:

1. **Operator identity.** No legal entity name, address, registration number or EU representative/DPO is named. The
   documents say "HudhudNest". GDPR Art. 13 normally requires the controller's identity and address.
2. **Contact mailbox.** `support@hudhudnest.com` / `security@hudhudnest.com` are used (they already appear in product
   emails). Confirm both are monitored and fit for legal/privacy requests; the previous pages used a personal Gmail.
3. **Governing law and jurisdiction** (Terms, "Governing law and disputes"): intentionally generic. The owner must pick
   the law, forum and any arbitration, taking into account mandatory consumer rules where users live.
4. **Liability cap / indemnity** (Terms): cap = amounts paid in the previous 12 months. Confirm it is enforceable and
   desired in target jurisdictions (e.g. Germany restricts liability exclusions in standard terms, AGB law).
5. **Legal bases per processing purpose and international transfers** (Privacy 11, 14): confirm bases and whether SCCs /
   transfer assessments are needed (Render, Netlify, Cloudinary, Twilio, Resend, Meta, Google).
6. **Retention periods not yet fixed**: security/audit logs, contact-form messages, Cloudinary images after listing
   removal, account-deletion grace period length. The text says so honestly; fix the numbers and update the text.
7. **Marketing.** Text promises separate, optional consent if marketing is ever sent. If a marketing channel is added,
   add a separate unchecked checkbox (never merge with the legal consent) and a consent record type.
8. **Social auto-posting** (Privacy 6/13, Terms licence): confirm what is posted to Telegram/Facebook/Instagram and that
   no private contact data is included.
9. **Payments / plans / refunds**: text says the Platform collects no card data today. Revisit when payments exist.
10. **Short-stay and valuation/investment disclaimers**, listing-verification wording ("unless marked verified").
    Investment: the new general disclaimer (`INVESTMENTS.GENERAL_DISCLAIMER`, shown on the list and at the top of a project;
    ar/en/de, added 2026-10-29) and the button wording "Express my interest" are product wording, not legal advice.
    Also confirm whether showing investment opportunities needs any licence or notice in the target markets.
11. **Minimum age 18** is stated; the sign-up form has no age check beyond the consent.
12. **German text** should be checked by a German-qualified lawyer (AGB-Recht, DSGVO terminology); Arabic by a lawyer in
    the target Arab jurisdiction(s). Translations are meaning-aligned, not literal.
13. ~~`/account-deletion` is Arabic-only~~ Resolved: the page is now served in ar/en/de (`account-deletion.content.ts`).
14. **Imprint (Impressum).** The page `/imprint` exists but is hidden until `LEGAL_ENTITY` in
    `src/app/features/legal/legal-entity.ts` is filled with the real legal name and postal address (and optionally
    register number, VAT id, responsible person). While it is `null`, the route shows "not available", the footer
    and settings links are hidden, and no placeholder is ever published. If the Platform targets Germany/Austria/
    Switzerland, the imprint is a legal requirement (DDG section 5): decide the operator identity first (item 1).
15. **First-party measurement (2026-11-08).** The Policy now states account-linked growth/activity events, anonymous
    app error reports sent to our own API and aggregate counters (see `docs/privacy/analytics-inventory.md` in the API
    repo). Confirm the legal bases and retention for them (items 5 and 6). The error-report switch is the build variable
    `CLIENT_ERROR_REPORTING_DISABLED=true`; if it is set, remove the "app error reports" bullet from the Policy.
16. **Hosting providers named in the Policy:** Render (API), Supabase (database), Netlify (web), encrypted backup
    storage. Confirm Supabase is the real database host and name the backup provider, then adjust section 12.
17. **Advertising SDK.** `@capacitor-community/admob` is still linked. The Policy says no advertising trackers.
    Either remove the SDK from the first store build (recommended) or update Policy, Data Safety, Apple labels and
    `PrivacyInfo.xcprivacy` together before enabling it (`docs/MONETIZATION.md`).
18. **Social sign-in consent.** Google/Apple sign-in now shows a notice ("by continuing you accept Terms and Privacy
    Policy") and records the acceptance of the current versions through `POST /consents` (`ConsentApiService
    .ensureCurrentAcceptance`). A lawyer should confirm that an informed-continue notice is enough for the target
    markets or whether an explicit checkbox is required.
