# Mobile UX & Responsive Audit — HudhudNest (2026-10-02)

Base: `origin/main` @ `ec74c97`, built with the `staging` configuration and served locally, talking to the
Staging API through a CORS pass-through proxy. The Staging database has no listings, so three **mock** listings
(normal, very long Arabic title, no photos; SVG placeholder images) were served locally for the list/detail/share
checks. Nothing was written to Staging or Production.

## 1. What was and was not verified

| Scope | Method | Status |
|---|---|---|
| 375 × 812, 768 × 1024, 1440 × 900, Arabic/RTL | Chromium in the Claude desktop browser pane, touch-emulated for the 375 run | **Verified** (public pages) |
| Public pages: home, landing, properties list/detail (mock), short-stay, investments, contact, valuation, pricing, login, register, forgot-password, language, legal, not-found, offline | Automated probe (horizontal overflow, tap targets < 40 px, controls < 16 px, broken/oversized images) + screenshots | **Verified** |
| Drawer, language dropdown, filter drawer, share sheet | Interaction tests (open, Escape, backdrop, route change, scroll lock, focus return) | **Verified** |
| Live Production/Staging direct links | `curl` of 6 deep paths on `hudhudnest.com` | **Verified** (all 200, SPA fallback) |
| **Real Android device** | — | **NOT VERIFIED** |
| **Real iPhone** | — | **NOT VERIFIED** |
| Soft keyboard, real safe-area insets, WKWebView `position:fixed` lock, hardware/gesture Back | Not reproducible in a desktop browser pane | **NOT VERIFIED** (code-reviewed only) |
| Logged-in screens: dashboard, favorites, administration menu, property creation, upload | Credentials may not be entered by the assistant | **NOT VERIFIED live**; reviewed in code (see §4) |

Chromium responsive mode is not a substitute for a device; every iOS/Android statement below that depends on
platform behaviour is marked with its basis.

## 2. Findings

Severity: **High** blocks or badly degrades a core flow, **Medium** degrades it, **Low** polish/accessibility.

### M-01 — High — iOS zooms the page when a form field is focused
- **Device / viewport:** iPhone (Safari and the Capacitor WKWebView), 375 px. *Basis: computed styles measured in Chromium; the iOS zoom rule (< 16 px) is documented WebKit behaviour — not reproduced on a device.*
- **Steps:** open `/home` → tap the location field in the hero search. Same on `/landing` (lead form), `/kontakt`, `/valuation`, `/auth/forgot-password`.
- **Expected:** page stays at 100 % zoom.
- **Actual:** controls compute to 14.72 px (home search) and 15–15.2 px (landing, contact, valuation, forgot-password).
- **Root cause:** `styles.scss` sets form controls to `--text-base`, but component-scoped rules (`.92rem`, `.95rem`) have higher specificity and lower it again.
- **File:** `src/styles.scss`.
- **Minimal fix (applied):** touch-only (`pointer: coarse`) floor of 16 px on inputs/selects/textareas, excluding checkbox/radio/range/file/color and the intentionally larger `.otp-input`.
- **Regression risk:** low — dense forms render 1–2 px larger on touch devices only. Verified: 0 sub-16 px controls on the five pages afterwards.

### M-02 — Medium — 1.1 MB of logo images on every first load
- **Device / viewport:** all, worst on mobile data.
- **Steps:** load any page; the navbar requests both `horizontal-logo.png` (617 KB) and `horizontal-logo-dark.png` (479 KB).
- **Expected:** a few tens of KB. **Actual:** both are 2000 px wide and are displayed at about 133 × 40 px. The hidden dark variant is downloaded too.
- **Root cause:** full-size brand artwork used directly in `<img>`.
- **Files:** `navbar.component.html`, `login.component.html`, new `public/images/horizontal-logo-480.png` (50 KB), `…-dark-480.png` (39 KB).
- **Minimal fix (applied):** 480 px variants (3× the largest display size), `loading="lazy"` on the hidden dark logo. The original files stay: `index.html` JSON-LD still references them.
- **Regression risk:** low — visual check on the navbar at 375 px shows a sharp logo.

### M-03 — Medium — Listings without a photo show a broken image
- **Device / viewport:** all, split web/API deployment (Production and Staging).
- **Steps:** `/properties` with a listing whose `mainImageUrl` is empty.
- **Expected:** the `/images/no-image.svg` placeholder. **Actual:** broken-image icon with alt text overlapping the badge.
- **Root cause:** `UrlService.build()` prefixes every relative path with the API origin, so the app's own placeholder became `<api>/images/no-image.svg` (404). `ImageFallbackDirective` then refuses to swap because the failing `src` already ends with its fallback path. The API serves nothing under `/images/` (uploads are on Cloudinary).
- **File:** `src/app/core/services/url.service.ts`.
- **Minimal fix (applied):** paths under `/images/` are returned unchanged. Spec added.
- **Regression risk:** low — only `/images/…` is affected.

### M-04 — Medium — Share sheet and confirmation dialogs ignore Android Back and let the page scroll behind them
- **Device / viewport:** Android (hardware/gesture Back), iOS (background scroll); 375 px. *Basis: code review + DOM test; Back itself needs a device.*
- **Steps:** open a listing → share → press Back; or open any admin confirmation (32 usages) → press Back.
- **Expected:** the overlay closes (as the gallery, navbar drawer and filter drawer already do).
- **Actual:** `body` stays `position: static` (page scrolls behind the sheet) and Back is not consumed, so it navigates away.
- **Root cause:** `PropertyShareButtonComponent` and `ConfirmModalComponent` never registered with `OverlayBackHandlerService` / `ScrollLockService` (both were added after the original Sept 5 audit).
- **Files:** `shared/ui/property-share-button.component.ts`, `shared/ui/confirm-modal.component.ts`.
- **Minimal fix (applied):** lock scroll + register a Back handler while open, release on close/destroy; `ConfirmModal` also closes on Escape and consumes Back (without closing) while loading or when it cannot be skipped. Specs added.
- **Regression risk:** low–medium — `ConfirmModal` is shared by 32 call sites; its public inputs/outputs are unchanged and the full suite (603 tests) passes.

### M-05 — Low — Result count is squeezed into one word per line
- **Viewport:** 375 px, RTL. **Steps:** `/properties` with results. **Expected:** "3 نتيجة" on one line next to the filter button. **Actual:** "3" / "نتيجة" stacked in a 33 px column.
- **Root cause:** at the mobile breakpoint `.mobile-filter-bar .btn { width: 100% }` leaves the count no room and `flex-shrink` squeezes it.
- **File:** `property-list.page.scss`. **Fix (applied):** button `flex: 1 1 auto; min-width: 0`, count `flex: none; white-space: nowrap`. **Risk:** low (list page only).

### M-06 — Low — Filter drawer cannot be closed with Escape
- **Viewport:** 768 (tablet mode of the filter drawer). **Actual:** Escape does nothing; close button, backdrop and Back already work.
- **File:** `property-list.page.ts`. **Fix (applied):** `document:keydown.escape` closes it. **Risk:** low.

### M-07 — Low — Small touch targets and bottom spacing
- Password-visibility button 29 × 44 → min 44 × 44 (`login.component.scss`, applied).
- Share sheet close button 32 × 32 → 44 × 44, sheet bottom padding now includes `safe-area-inset-bottom`, `dvh` max-heights added (applied).
- `ConfirmModal` `max-height: 90vh` → `90dvh` fallback pair (applied).
- **Not changed:** inline legal/footer links are 17–24 px tall (text links, WCAG 2.5.8 inline exception), language buttons in the drawer are 40 px.

## 3. Not changed — needs a decision or owner action

| ID | Severity | Item |
|---|---|---|
| R-01 | Medium | **Photos over 5 MB are rejected on the client and the server** (`property-form.page.ts`, `UploadPropertyImagesCommandHandler.cs`). Modern phone photos are often 5–10 MB. Recommended: downscale to ≈ 2048 px / JPEG 0.85 in the browser before upload. This is a new utility rather than a minimal patch, so it was not done. |
| R-02 | Medium | **No native deep links.** No `intent-filter` for `https://hudhudnest.com` in `AndroidManifest.xml`, no iOS associated domains, no `appUrlOpen` handler, no `.well-known` files. Shared listing links open in the browser, not the installed app. Needs `assetlinks.json` / `apple-app-site-association` and the release signing fingerprint (owner). |
| R-03 | Low | First-time language comes from the browser (`navigator.language`) and only falls back to Arabic when unsupported, so a device set to English or German opens the English or German UI. Product decision. |
| R-04 | Low | Hard-coded Arabic `aria-label="إغلاق"` on the filter drawer close button (not translated), and the filter drawer has no `role="dialog"`. |
| R-05 | Ops | The deployed Staging site (`staging--hudhudnest.netlify.app`) is an **old build**: pre-rebrand logo text and `| PropertyApp` page titles. Redeploy the `staging` branch. |

## 4. Reviewed in code only (logged-in areas)

- **Navbar / administration menu:** the account dropdown scrolls inside `max-height: calc(100dvh - 5.5rem)`; the drawer is `100dvh` with safe-area padding; management group uses `aria-expanded`/`aria-controls`. No defect found.
- **Property creation:** photo input restricts to JPEG/PNG/WebP (iOS therefore converts HEIC to JPEG on selection); see R-01.
- **Keyboard / safe area / Back:** handled through `SystemBars` (`insetsHandling: 'css'`), `ScrollLockService`, `OverlayBackHandlerService`, `NativeBackButtonService` as described in `MOBILE-UX-PRODUCTION-READINESS.md`; **needs a real-device pass** (see `MOBILE-DEVICE-TEST-CHECKLIST.md`).

## 5. Verification of the fixes

- `tsc -p tsconfig.app.json --noEmit`: clean.
- Targeted specs: 39/39. Full suite (`ng test`, ChromeHeadless): **603/603**.
- Browser: 0 sub-16 px controls on `/home`, `/kontakt`, `/valuation`, `/landing`, `/auth/forgot-password`; filter bar on one line; no-photo card loads `/images/no-image.svg` (800 px); share sheet locks the page, closes on Escape and unlocks; both logos load at 480 px.
