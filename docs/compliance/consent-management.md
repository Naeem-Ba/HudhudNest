# Consent management (2026-11-13)

## What is consent and what is not

| Item | Legal nature | Capture | Status |
|---|---|---|---|
| Terms of use | Contract acceptance | Unticked box at e-mail registration; notice under the Google/Apple buttons at social sign-in | Implemented |
| Privacy policy | Information (Art. 13), acknowledged, not consented | Same box ("I agree to the Terms and acknowledge I have read the Privacy Policy") | Implemented |
| Newsletter | Consent (Art. 6(1)(a), ePrivacy Art. 13) | Separate unticked box at registration, or Settings; then double opt-in | Implemented |
| First-party measurement storage | Consent where ePrivacy/§ 25 TDDDG applies | Banner for EU/EEA/UK/CH/TR/unknown country; Settings toggle | Implemented |
| Advertising | Consent | Ads banner (module off by default) | Implemented (not a certified CMP) |
| Valuation office contact sharing, location, push | Consent | In-feature prompts | Implemented (existing) |

Decision: one box for terms acceptance + privacy acknowledgment, not two. A separate "I consent to the privacy policy"
box would wrongly suggest that all processing rests on consent (it rests mostly on contract and legitimate interests,
privacy §11). **Requires Legal Review** for each target market.

## Evidence stored (API)

`ConsentRecord`: `UserAccountId`, `PolicyType` (PrivacyPolicy / TermsOfService), `PolicyVersion`, `ConsentedAtUtc`,
`Source` (Web / Ios / Android), `Language` (ar/en/de/tr, the page language), `Method` (UncheckedCheckbox,
SocialSignInNotice, UpdatePrompt, AccountSettings, ...), `WithdrawnAtUtc`. No IP address is stored with consent
(data minimisation; the audit log keeps sign-in IPs for 90 days). Records are never updated in place except for the
withdrawal timestamp.

Newsletter evidence lives in `NewsletterConsentEvents` (append-only): Requested, Confirmed, Withdrawn, EmailErased, each with
time, source, method, policy version and language.

## Versions and re-consent

- Versions live in `src/app/core/models/consent-versions.ts` (one version for all four languages), with `publishedDate`,
  `effectiveDate` (null until the owner publishes; never back-dated), `lastUpdated`, `changeType` (material/editorial).
- Material change: bump the version; signed-in users whose active record is older see `ReconsentPromptComponent` and accept
  with an explicit button (method UpdatePrompt). "Later" hides it for the page session. Continued use is never counted.
- Editorial change: keep the version; no prompt.
- Old texts stay in git history (immutable by commit hash). **Partially Implemented**: there is no in-app archive page of
  old versions; provide them on request from git.

## Withdrawal

- Newsletter: link in every marketing mail (no login, takes effect at once), Settings, or e-mail to privacy@.
- Measurement: Settings toggle; withdrawing deletes the stored values.
- Terms/privacy: `DELETE /users/me/consents/{type}` exists; withdrawing terms acceptance means ending the contract (account
  deletion is the user-facing path).
