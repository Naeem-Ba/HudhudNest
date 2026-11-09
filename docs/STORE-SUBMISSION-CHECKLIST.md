# Store submission checklist (Google Play + App Store)

Last reviewed: 2026-11-08 (QA phase 22). Items marked **OWNER** need an account, a decision or a person; items marked
**DONE** are verified in the repository. This is not legal advice.

## Identity and builds
- [x] **DONE** Android applicationId / iOS bundle id `com.hudhudnest.app` (`capacitor.config.ts`, `android/app/build.gradle`).
- [x] **DONE** App name `HudhudNest` in `capacitor.config.ts`; permission texts exist in ar/en/de (`ios/App/App/*.lproj`).
- [ ] **OWNER** Decide the advertising SDK: remove `@capacitor-community/admob` (+ `NSUserTrackingUsageDescription`,
      `SKAdNetworkItems`, sample AdMob app id) from the first store build, or declare ads everywhere
      (`docs/MONETIZATION.md`, API repo `docs/privacy/store-disclosures.md`).
- [x] **DONE** The release workflow artifact is now named `hudhudnest-release-aab` (was the old product name).

## Legal inside the app
- [x] **DONE** Privacy Policy and Terms in ar/en/de, versioned (`consent-versions.ts`, 2026-11-08), reachable from the
      landing footer, the sign-up form and Settings > Legal.
- [x] **DONE** Sign-in with Google/Apple shows the consent notice and records acceptance.
- [x] **DONE** In-app account deletion (Profile) and the public page `/account-deletion` (ar/en/de), 30 days grace.
- [ ] **OWNER** Fill `LEGAL_ENTITY` (`src/app/features/legal/legal-entity.ts`) to publish the imprint; have the three
      language versions reviewed by a lawyer (`docs/legal/LEGAL-REVIEW-REQUIRED.md`).
- [ ] **OWNER** Send a test mail to `support@hudhudnest.com` and `security@hudhudnest.com`; decide whether a separate
      `privacy@` address and a response time (for example 30 days for GDPR requests) are published.

## Store forms
- [ ] **OWNER** Google Play Console > App content: Privacy policy URL `https://hudhudnest.com/privacy-policy`, Data safety
      (copy from API repo `docs/privacy/store-disclosures.md`), account-deletion URL
      `https://hudhudnest.com/account-deletion`, content rating questionnaire (user-generated content, location),
      target audience 18+, ads declaration (see AdMob decision).
- [ ] **OWNER** App Store Connect > App Privacy: answers must equal `ios/App/App/PrivacyInfo.xcprivacy` (tracking: no).
      Age rating, privacy policy URL, support URL, demo account for review.
- [ ] **OWNER** Reviewer access: a working demo account (email + password, no OTP dependency) in the review notes, and
      a statement that user-generated content has report/block tools.
- [ ] **OWNER** Sign in with Apple tested on a real iPhone (Apple Developer account, Team ID, Service/Key ids); the
      entitlement is set but never exercised on a device.
- [ ] **OWNER** Screenshots per store size, in the languages you list; feature graphic (Play).

## Before each release
1. `node scripts/check-legal-parity.mjs`, `node tools/check-i18n-keys.mjs`, `npm run ios:check` (if present).
2. Bump Privacy/Terms version only with a text change, in all three languages.
3. Confirm `/api/client-telemetry/errors` reachable from the store builds (CORS is irrelevant on native; the endpoint is
   anonymous and rate limited).
