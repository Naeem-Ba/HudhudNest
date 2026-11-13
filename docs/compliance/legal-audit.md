# Legal and compliance audit (2026-11-13)

Scope: the app repository (Angular, `Naeem-Ba/HudhudNest`) and the API repository (.NET 10, `Naeem-Ba/HudhudNestApi`), read
on branches `main` (0897e9b) and `master` (ed2489c). This is an engineering audit, not legal advice. Every item marked
"Requires Legal Review" needs a qualified lawyer for each target market.

Status labels used in all files of this folder: **Implemented** (in code, tested), **Verified** (confirmed against a
live system or a signed document), **Partially Implemented**, **Planned**, **Requires Legal Review**, **Blocking Launch**.

## 1. What existed before this work

| Area | Found | Notes |
|---|---|---|
| Privacy policy | `public/i18n/legal/{ar,en,de,tr}/privacy.json`, 25 sections | Rendered by `features/legal/legal-document.page.ts`. Turkish carries a visible "not reviewed by a lawyer" notice. |
| Terms of use | `.../terms.json`, 29 sections | Same renderer. Governing law said "law applicable to the operator" without naming one. |
| Controller identity | Not stated | Section 2 named no operator; contact addresses were hard-coded mail links. |
| Impressum | Two drafts: `/imprint` (hidden, `legal-entity.ts` = null) and `/impressum` (German template full of `[TODO]`) | Conflicting; neither complete. |
| German privacy page | `/datenschutz`, a German-only draft with `[TODO]` | A second, divergent privacy notice. |
| Consent records | API `ConsentRecord` (policy type, version, source, time, withdrawal) | No language, no capture method. Registration records both documents server-side; social sign-in records via `ensureCurrentAcceptance`. |
| Re-consent after a change | Not implemented | The terms promised "we will ask you to accept"; nothing asked. |
| Marketing e-mail | None existed | Only service mail through `IApplicationEmailSender` (Resend). |
| Newsletter | None | The launch-page waitlist (Supabase, insert-only RLS) is not a newsletter. |
| Account deletion | Implemented (30-day grace, anonymisation, listing transfer/expiry, push tokens, avatar) | Strong. |
| Data export | Implemented (JSON self-service) | |
| Retention jobs | Audit logs (365/90 days), auth data (OTP 1 day, tokens 30 days, IPs 90 days), notifications, listing views (90 days) | No job for contact messages, old leads, waitlist. |
| Cookies/storage | One HttpOnly refresh cookie + CSRF, local storage for preferences, plus a random visitor id, UTM attribution and referral code written without any consent | The last three are non-essential device storage (ePrivacy Art. 5(3), § 25 TDDDG) and needed consent for EU/EEA visitors. |
| Ads | AdSense/AdMob module, off by default, own consent banner | Not a certified CMP (documented in `docs/MONETIZATION.md`). |
| Legal hold | None | Scheduled deletion could not be paused for a dispute. |

## 2. Claimed in texts but not implemented (before)

1. "We will ask you to accept the new version" (terms §26): no prompt existed. **Now Implemented** (`ReconsentPromptComponent`).
2. Retention "not yet determined" style gaps: contact messages, leads and waitlist had no deletion. **Now Implemented** for
   API data (`ComplianceRetentionHostedService`); the Supabase waitlist needs the SQL in `docs/compliance/data-retention-policy.md` (**Planned**, owner action).
3. Hosting providers named without regions or transfer mechanisms: still unverified (**Blocking Launch**, see transfers file).

## 3. Implemented in this change

| Control | Where | Status |
|---|---|---|
| Central controller identity, legal texts use `{{TOKENS}}` | app `features/legal/controller-identity.ts`, `interpolateLegalText` | Implemented |
| Impressum from that identity, missing fields shown openly | app `/impressum` | Implemented (content incomplete: Blocking Launch) |
| `/datenschutz` → `/privacy-policy?lang=de`, `/imprint` → `/impressum` (Angular + Netlify 301) | app routes, `public/_redirects` | Implemented |
| Legal page metadata: version, published, effective, updated, language, related docs | `legal-document.page.ts`, `consent-versions.ts` | Implemented (dates null until publication) |
| Consent evidence with language and method | API `ConsentRecord.Language/Method` | Implemented |
| Newsletter: separate, unticked, double opt-in, token unsubscribe without login, RFC 8058 one-click, suppression hash, append-only events | API `Newsletter*`, app register box, settings card, `/newsletter/confirm`, `/newsletter/unsubscribe` | Implemented |
| Marketing sender that refuses anyone without an active confirmed subscription | API `MarketingEmailSender` | Implemented (no campaign tool exists yet) |
| First-party measurement consent (EU/EEA/UK/CH/TR/unknown country) | app `MeasurementConsentService`, banner, settings toggle | Implemented |
| Re-consent prompt after a material change | app `ReconsentPromptComponent`, API method `UpdatePrompt` | Implemented |
| Legal hold pausing scheduled deletion | API `LegalHold`, `api/admin/legal-holds` | Implemented |
| Retention sweep (newsletter, contact, leads) | API `ComplianceRetentionHostedService` | Implemented |
| Production gate | app `npm run check:legal` | Implemented (fails today, by design) |

## 4. Conflicts found

1. **Target market.** The brief says Syria is the launch market. The marketing site uses German path names
   (`/ueber-uns`, `/fuer-anbieter`, `/kontakt`), a German Impressum and DACH-oriented copy. Offering services in German
   to people in the EU is a strong indicator of targeting under GDPR Art. 3(2), which brings Art. 27 (EU representative)
   and the full GDPR into play. **Requires Legal Review / human decision.**
2. **Backups 12 months vs. target 90 days.** The backup rotation keeps monthly copies for 12 months; the target table asked
   for 90 days. The texts state the real 12 months. Decide which one to keep (**human decision**).
3. **Audit log retention 365 days vs. target 180.** Kept at the owner's earlier decision (365/90) and documented.
4. **Two Impressum pages and two privacy notices.** Resolved: one of each.
5. **Turkish review notice.** Turkish shows "not reviewed by a lawyer"; Arabic, English and German do not, but none of the
   four has been reviewed. Kept as the owner decided; the launch report treats all four as **Requires Legal Review**.

## 5. Legal gaps (open)

| Gap | Status |
|---|---|
| Operator legal name, legal form, representative, street, postal code | Blocking Launch |
| EU representative (Art. 27) decision | Requires Legal Review |
| Transfer mechanisms (DPA/SCC/TIA) per provider | Blocking Launch |
| Governing law clause (Syrian law + consumer mandatory law) | Requires Legal Review |
| Consumer dispute statement (e.g. § 36 VSBG) if Germany is targeted | Requires Legal Review |
| Notice-and-action / statement of reasons (EU DSA) for a hosting platform | Partially Implemented (reporting, manual statement and appeal by e-mail; no in-app appeal) |
| Publication and effective dates | Blocking Launch (owner sets on publication) |
| KVKK registration duties (VERBIS) if Türkiye is targeted | Requires Legal Review |

## 6. Security and privacy gaps (open)

- Unsubscribe token is stored in clear (needed to build the footer link). It only allows withdrawing; acceptable, documented.
- The Supabase waitlist has no retention job yet (SQL prepared, not applied).
- No in-app appeal workflow for moderation (by e-mail only).
- Render/Supabase/Netlify/Cloudinary plans and regions unverified (see the infrastructure audit of 2026-11-11).

## 7. Decisions that need a human

See `launch-readiness.md`, section "Required decisions".
