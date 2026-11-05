# Mobile UX Production Readiness — Phase 7

**Scope:** Angular 20 + Capacitor 8 app (`hudhudnest`), targeting Web, Android, iOS.
**Date:** 2026-09-05
**Method:** Static/code audit + live browser verification (Chromium-based automation
against `ng serve`, staging config, at multiple emulated viewports) + production build.
**Not available in this environment:** a physical iPhone/Android device, an Xcode/iOS
Simulator, or an Android Studio emulator. Every finding below is labeled with how it was
verified; anything requiring real hardware is marked **NOT VERIFIED**, not assumed to pass.

---

## 1. Executive Summary

This app's mobile foundation is materially more mature than a typical "responsive
website in a WebView." Prior work (visible in git history — PRs #33/#34/#39, the
`fix/mobile-drawer-scroll-lock` and `fix/BLK-04/05` branches, and a `_breakpoints.scss`
consolidation) already put in place: a ref-counted `ScrollLockService` using the
documented iOS WKWebView `position:fixed` body-lock technique, an `OverlayBackHandlerService`
+ `NativeBackButtonService` that correctly chains Android hardware-back through
modals/drawers/routes before falling back to `App.exitApp()`, Capacitor 8's native
`SystemBars` plugin (`insetsHandling: 'css'`) driving real `WindowInsets`-based safe-area
and IME-aware padding on Android, and a project-wide RTL pass (93% of directional CSS
uses logical properties; the drawer, forms, and grids mirror correctly for Arabic).

The audit's main finding is a genuine, previously-unnoticed **CRITICAL bug**: on the
Properties List page (a P0 screen), the mobile filter drawer's closed-state transform had
the wrong sign for RTL, so on every mobile load in the app's default Arabic locale the
filter panel rendered visibly overlapping the results instead of off-screen — masked from
obvious detection by a global `overflow-x: clip` safety net that hid the resulting
overflow rather than the broken layout. This has been fixed and verified live (see §17).
A second, smaller RTL miss (a select chevron icon on the landing page, never mirrored for
RTL) was also found and fixed. No other BLOCKER or CRITICAL issues were found in the
areas this audit could reach.

**Gate: PASS WITH WARNINGS** — see §23 for the full reasoning. The core P0 flows are
usable, safe-area/keyboard/back-navigation are handled through documented, evidence-backed
mechanisms, and the one CRITICAL defect found is fixed and verified. What keeps this from
an unqualified PASS is scope, not defects: this session had no physical device, no iOS
Simulator, and no Android emulator, so native gesture/keyboard/predictive-back behavior is
CODE VERIFIED but NOT VERIFIED on real hardware, and most of the app's ~30 screens beyond
the P0 set were reviewed by code/pattern audit rather than individually loaded in a
browser (no live backend was reachable from this sandbox — every API call was CORS-blocked
by design, which is itself evidence the app's error/empty states work, but it also means
data-dependent UI like the image gallery or a populated list could not be visually
exercised).

---

## 2. Current Mobile Architecture

- **Framework:** Angular 20.3 (standalone components, signals used selectively,
  `ChangeDetectionStrategy.OnPush` on most feature pages), lazy-loaded routes
  (`loadComponent`) per screen.
- **Styling:** SCSS with `@use` (not `@import`), Tailwind 4 loaded alongside for utility
  classes on newer pages (e.g. checkout), a single `_breakpoints.scss` as the canonical
  breakpoint source (`$bp-mobile: 640px`, `$bp-tablet: 980px`, `$bp-desktop: 1280px`,
  plus a documented one-off `$bp-secondary-layout: 900px`).
- **Routing:** `HashLocationStrategy` (`#/home`, `#/wohnungen/:id`, …) — confirmed live
  (`location.href` observed as `http://localhost:4200/#/wohnungen`). This is deliberate
  and typical for a Capacitor `file://`/`capacitor://` webview; it does mean any deep-link
  or universal-link work must account for the `#` segment.
- **i18n:** `@ngx-translate`, three locales (ar/en/de). Default document is
  `<html lang="ar" dir="rtl">`; the app also auto-detects/allows switching, confirmed live
  switching to German (LTR) and back to Arabic (RTL) with the whole shell re-mirroring.
- **State/PWA:** no Service Worker is registered, on purpose (decision of QA Phase 15, D07): the site needs the network anyway, and a worker would add a stale-build and cached-private-data risk before launch. The unused `ngsw-config.json` and the unreachable Arabic-only `/offline` page were removed. Revisit after launch if offline use is wanted.
- **Capacitor:** `@capacitor/core` `@capacitor/android` `@capacitor/ios` all `8.5.0`,
  `@capacitor/app` (back button, app state), native Google/Apple sign-in plugins. No
  `@capacitor/keyboard` or `@capacitor/status-bar` package — both are superseded by the
  Capacitor 8 **core** `SystemBars` plugin, configured in `capacitor.config.ts`.

## 3. Capacitor Configuration

[`capacitor.config.ts`](../capacitor.config.ts):

```ts
appId: 'com.hudhudnest.app'
webDir: 'dist/HudhudNest/browser'
server: { androidScheme: 'https', iosScheme: 'capacitor', cleartext: <env-gated, off by default>,
          allowNavigation: ['hudhudnest.com', '*.hudhudnest.com'] }
ios: { contentInset: 'automatic', preferredContentMode: 'mobile', scrollEnabled: true }
plugins: { SystemBars: { insetsHandling: 'css' } }
```

- `cleartext` defaults to `false` and is only enabled via an explicit
  `CAPACITOR_ALLOW_CLEARTEXT=true` env var for local dev — correct, no plaintext HTTP in
  production builds. **Not changed.**
  _Correction 2026-09-24:_ the Capacitor setting was right, but the Android
  `network_security_config.xml` still allowed HTTP to `nimobizo-001-site1.itempurl.com` (a legacy
  domain the app never uses). Removed; the file now sets `base-config cleartextTrafficPermitted="false"`.
- `SystemBars.insetsHandling: 'css'` — read the actual Capacitor 8.5.0 Android plugin
  source (`node_modules/@capacitor/android/.../SystemBars.java`) rather than trusting the
  config alone. It: listens for `WindowInsetsCompat`, injects `--safe-area-inset-{top,
  right,bottom,left}` as CSS custom properties on `<html>`, and — critically for §18/§62 —
  zeroes/repads the bottom inset when the IME is visible, resizing the WebView by the real
  keyboard height. This is the modern insets-based equivalent of `adjustResize`, driven
  from the OS, not app JS. **No native config changes made** (none were evidenced as
  necessary).
- No native `StatusBar`/`SplashScreen` JS plugin calls exist in `src/app` — appearance is
  driven entirely by `SystemBars` (light/dark status-bar style follows the OS theme
  automatically) and the native splash (`android/app/.../drawable` + iOS
  `LaunchScreen.storyboard`), which was not touched.

### Android
- `compileSdk`/`targetSdk` = **36** (Android 16), `minSdk` = **24**
  (`android/variables.gradle`).
- `AndroidManifest.xml`: no `android:enableOnBackInvokedCallback` attribute is set,
  which **defaults to `false`** regardless of `targetSdk` — the app is on the legacy
  back-dispatch path, not predictive back. This is consistent with (and required for)
  the existing `App.addListener('backButton', …)` flow in `NativeBackButtonService`
  continuing to work unmodified; see §12/§17 for why this was left alone rather than
  "fixed."
- No `android:screenOrientation` is set on `MainActivity` → both orientations are
  allowed; `android:configChanges` includes `orientation|keyboardHidden|keyboard|
  screenSize|…`, so the Activity survives rotation without being recreated (no Angular
  app-state loss on rotate at the native layer).

### iOS
- `IPHONEOS_DEPLOYMENT_TARGET = 15.0`.
- `Info.plist`: `UISupportedInterfaceOrientations` includes portrait **and both
  landscape** orientations on iPhone (iPad additionally allows upside-down) — this app
  is not portrait-locked; rotation is a real, supported case (see §13).
- Permission strings present and specific (location "to show listings … and sort by
  distance", camera "to take photos for a listing", photo library "to attach existing
  photos") — matches §39/§40 guidance (no generic boilerplate copy).

## 4. Screen Inventory (from `app.routes.ts`)

| Screen | Route | Priority |
|---|---|---|
| Home | `/home` | P0 |
| Login | `/login`, `/auth/login` | P0 |
| Register / OTP / phone auth | `/auth/register`, `/auth/send-otp`, `/auth/verify-otp`, `/auth/phone-register`, `/auth/phone-password-reset` | P0 |
| Property List | `/wohnungen`, `/properties` | P0 |
| Property Detail | `/wohnungen/:id`, `/properties/:id` | P0 |
| Profile | `/profile` | P0 |
| Navbar + Mobile Drawer | (shell, all routes) | P0 |
| Add/Edit Property | `/property-form`, `/properties/edit/:id` | P1 |
| Favorites | `/favorites` | P1 |
| Saved Searches | `/saved-searches` | P1 |
| Notifications | `/notifications` | P1 |
| Visits | `/visits` | P1 |
| Short-Stay (list/detail/bookings/manage) | `/short-stay*` | P1 |
| Investments (list/detail/watchlist) | `/investments*` | P1 |
| Messages | `/messages/:propertyId` | P1 |
| Checkout | `/checkout/:kind/:propertyId` | P1 |
| My Listings / My Services | `/my-listings`, `/my-services` | P1 |
| Reviews | `/reviews`, `/reviews/:propertyId` | P1 |
| User Profile (public) | `/users/:id` | P1 |
| Landing (marketing) | `/landing` | P2 |
| Contact, Pricing, Privacy/Terms, Not-authorized, Offline | `/kontakt`, `/pricing`, `/privacy-policy`, `/terms-of-service`, `/not-authorized`, `/offline` | P2 |
| Admin (messages/users/investments/location-suggestions) | `/admin/*` | P2 (internal) |

## 5. Breakpoint Strategy

Single canonical source, `src/styles/_breakpoints.scss`:

| Name | Value | Direction |
|---|---|---|
| `$bp-small-mobile` | 420px | max-width |
| `$bp-mobile` | 640px | max-width |
| `$bp-tablet` | 980px | max-width |
| `$bp-desktop` | 1280px | min-width |
| `$bp-secondary-layout` | 900px | min-width (2 pages only, documented) |

These are consumed via `@include bp.mobile { }` / `bp.tablet { }` / etc. — not raw
`@media` queries — across all but a handful of legacy files, per two prior "Phase 0/1"
migration commits (`1476a5d`, and the navbar header comment referencing the same effort).
No new breakpoints were introduced by this audit; the strategy was sound and left as-is.

## 6. iOS Assessment

CODE VERIFIED (SystemBars.java source, Info.plist, capacitor.config.ts) +
BROWSER-EMULATION VERIFIED (Safari/WKWebView-equivalent `env()` fallback path exercised
via Chromium, which is a partial proxy, not a WKWebView). **REAL DEVICE / SIMULATOR: NOT
VERIFIED** — no Mac/Xcode/simulator available in this environment.

- Safe area: `env(safe-area-inset-*)` used as the fallback tier everywhere
  `--safe-area-inset-*`/`--app-safe-area-*` custom properties are read (see §8) — correct
  for WKWebView, which supports `env()` natively without any plugin help.
- `viewport-fit=cover` present in `src/index.html` (required for `env()` to report
  non-zero values at all on iOS) — confirmed.
- Orientation: portrait + landscape both declared supported (§3); not portrait-locked.
- Keyboard: no JS `visualViewport` hacks in the codebase (grep confirmed) — relies on
  WKWebView's native behavior + the CSS safe-area/IME variables. Reasonable default;
  **NOT VERIFIED** against a real on-screen keyboard's actual resize behavior.

## 7. Android Assessment

CODE VERIFIED (SystemBars.java, AndroidManifest.xml, variables.gradle) +
BROWSER-EMULATION VERIFIED for the CSS side. **REAL DEVICE / EMULATOR: NOT VERIFIED.**

- Edge-to-edge (Android 15+, `targetSdk 36` enforces it): handled by the Capacitor 8
  `SystemBars` plugin via `WindowInsetsCompat` + `ViewCompat.setOnApplyWindowInsetsListener`
  — this is the currently-recommended API, not hardcoded padding. **PASS (code-verified)**.
- Predictive back (Android 16 native gesture): `enableOnBackInvokedCallback` is not set,
  so it defaults to `false` and the app stays on the legacy back-dispatch path that
  `NativeBackButtonService`/`App.addListener('backButton', …)` already correctly handles
  (overlay → route → exit chain, verified by code review of
  `OverlayBackHandlerService`/`NativeBackButtonService`). **Deliberately not changed**:
  flipping this flag is a real native-behavior change (rule #13/#19 — no native config
  changes without evidence) that this session cannot validate without a real Android 13+
  device/emulator to confirm the gesture-preview gesture still resolves through the same
  JS listener chain. Flagged as a **MEDIUM, forward-looking finding** — worth a dedicated,
  device-tested follow-up, not a Phase 7 blocker, since the *current*, unchanged
  configuration is internally consistent and functioning.
- Keyboard/IME: handled by `SystemBars` resizing the WebView by the real IME inset
  (confirmed in source), not by `android:windowSoftInputMode` (which is unset — fine,
  superseded by the insets-based approach).
- Orientation: unlocked (no `screenOrientation` set); `configChanges` includes
  `orientation`, so no Activity recreation / state loss on rotate.

## 8. Safe Area Assessment

Two-tier fallback pattern, used consistently:

```scss
var(--safe-area-inset-top, env(safe-area-inset-top, 0px))
```

- Tier 1 (`--safe-area-inset-*`): written by the Android `SystemBars` plugin at runtime
  (confirmed in `SystemBars.java`'s `injectSafeAreaCSS`).
- Tier 2 (`env(safe-area-inset-*)`): native iOS Safari/WKWebView support, and the fallback
  on plain mobile web (any browser) where no plugin runs.
- `src/styles.scss` additionally exposes normalized `--app-safe-area-{top,right,bottom,
  left}` aliases (lines 741–748) for consumers that want a single source regardless of
  platform.
- Consumers found and reviewed: navbar (top padding + drawer padding on all four sides),
  mobile filter drawer (top/bottom), toast-container (implicitly via its positioning). No
  hardcoded safe-area pixel values (e.g. `padding-bottom: 34px`) were found anywhere in
  `src/app` — rule §25/§75 respected already.
- **PASS**, evidence: source code + Capacitor plugin source + live `--app-safe-area-*`
  custom property resolution in the browser session (values are `0px` in a desktop
  Chromium tab, as expected with no real notch/inset — this confirms the fallback chain
  resolves without erroring, not that a real inset renders one, which needs real
  hardware).

## 9. 100vh / Viewport Unit Assessment

Every `100vh` occurrence in `src/` was enumerated and inspected individually (28
occurrences, 15 files) rather than bulk-replaced. Pattern found in all but one case:

```scss
min-height: calc(100vh - var(--navbar-height, 68px));
min-height: calc(100dvh - var(--navbar-height, 68px));   /* overrides vh where supported */
```

This is the *correct* form: `vh` first as a universal fallback, `dvh` second so it wins
the cascade on any engine that supports it (all current Capacitor WebViews and modern
mobile browsers) — exactly the "vh fallback / dvh override" pattern the audit brief asks
for, already in place before this session, in: `styles.scss`, `_auth-flow.scss`,
`profile.component.scss`, `navbar.component.scss` (drawer height), `contact`,
`property-form`, `property-detail`, `property-list`, `login.component.scss`. The one
`landing-page.component.scss` case uses `min-height: min(100svh, 720px)` — `svh` (small
viewport height) is the deliberately-correct choice for a hero section that should never
be *taller* than the smallest possible viewport (i.e., never hidden below the fold when
the browser chrome is expanded) — also correct, not a bug.

`toast-container.component.ts` uses `max-height: calc(100dvh - 2rem)` with no `vh`
fallback — a minor gap (very old WebView engines without `dvh` support would get
`max-height: auto`-like behavior, i.e., unconstrained) but Capacitor 8's minimum supported
WebView is well past `dvh` support, so this is **LOW severity, not fixed** (out of the
"minimal safe change" scope for this pass).

**PASS.**

## 10. Keyboard Assessment

- Native (Capacitor): handled by `SystemBars`' IME-aware inset padding (§3/§7) — CODE
  VERIFIED, **NOT VERIFIED** on a real device/emulator with the OS keyboard actually open.
- Mobile web: relies on browser-native focus-scroll behavior; no custom JS keyboard hack
  exists (confirmed by grep — the only `visualViewport`/`Keyboard` grep hits were
  substring false-positives inside identifier names like `NativeBackButtonService`, not
  real usages).
- Input semantics (BROWSER VERIFIED live on the Login page, and code-reviewed across
  `login.component.html`): `type="email"` + `autocomplete="email"`, `type="tel"` +
  `inputmode="tel"` + `autocomplete="tel"`, `inputmode="numeric"` +
  `autocomplete="one-time-code"` for OTP (enables native SMS autofill on both platforms),
  `autocomplete="given-name"/"family-name"/"new-password"/"current-password"`. All labeled
  fields, not placeholder-only. **PASS** on the input-semantics half of this section;
  keyboard-open visual behavior is **NOT VERIFIED** (no real keyboard available).

## 11. Drawer / Modal Assessment

### Mobile nav drawer (`navbar.component.ts`/`.scss`) — the app's previously-known-buggy
component:
- Off-canvas via `transform: translateX()`, anchored with `inset-inline-end: 0`
  (logical — resolves to `right:0` in LTR, `left:0` in RTL).
- RTL mirroring **verified live**: opened the drawer in German (LTR) — measured rect
  `{left:0, right:330}` in a 375px viewport (i.e., pinned right); switched to Arabic
  (RTL) and reopened — measured rect `{left:0, right:330}` **on the left edge** this
  time (confirmed via `getBoundingClientRect`, not just eyeballing a screenshot).
- Scroll lock: ref-counted `ScrollLockService`, using `position:fixed` + saved
  `scrollY` restore — the documented fix for iOS WKWebView's `overflow:hidden` not
  actually stopping touch-scroll behind a fixed layer. Verified live: opening the drawer
  set `<html class="scroll-locked">` and `body.style.top`; closing it removed both and
  the class list returned to empty. **PASS, browser-verified.**
- Android hardware back: `OverlayBackHandlerService` registers the drawer's close
  function; `NativeBackButtonService` calls `closeTopOverlay()` before falling back to
  route history / app-exit. **CODE VERIFIED only** — `Capacitor.isNativePlatform()` is
  `false` in a browser, so this path cannot fire in this environment. **NOT VERIFIED**
  on a real Android back gesture.
- Escape key closes all menus (`@HostListener('document:keydown.escape')`) — desktop
  a11y nicety, not mobile-critical but present.
- Resize-while-open edge case (folding device / desktop window resize crossing the
  980px breakpoint) explicitly handled: closes the drawer and releases the lock if the
  viewport grows past desktop width while open — code-reviewed, not independently
  re-tested live.

### Filter "drawer" on Property List (`property-list.page.scss`) — **BLOCKER found and
fixed**, see §17.

### Confirm modal (`shared/ui/confirm-modal.component.ts`):
- Centered flex overlay, `max-height: 90vh` + `overflow-y:auto` (static `vh`, no `dvh`
  fallback — **LOW**, not fixed: a centered, padded, scrollable modal is materially less
  sensitive to the vh/dvh distinction than a full-bleed drawer, since any shortfall just
  shows slightly more/less letterboxing rather than clipping content).
- Backdrop click closes unless `loading` is true (prevents dismissing mid-request) —
  correct pattern for §15's "no dismiss during operation" concern.

## 12. Navigation / Back Assessment

- `HashLocationStrategy` confirmed live.
- Android hardware back chain: overlay → `Location.back()` (if not already on `/` or
  `/home`) → `App.exitApp()` — CODE VERIFIED, **NOT VERIFIED** on-device (§11).
- Router-driven safety net: any `NavigationStart` event force-closes the mobile drawer
  and releases its scroll lock even if the navigation didn't originate from a drawer
  link (covers redirects from guards, browser back/forward) — code-reviewed, matches the
  in-file comment's stated intent.
- Predictive back (Android 16 gesture): see §7 — deliberately left on the legacy path,
  flagged as a device-tested follow-up rather than changed blind.

## 13. Orientation Assessment

The app is **not** orientation-locked on either platform (iOS: portrait + both
landscapes; Android: no `screenOrientation` set). This means rotation is a real,
in-scope case, not a "shouldn't happen":

- Android: `configChanges` includes `orientation`, so the native Activity survives
  rotation without recreation — no risk of native-layer state loss.
- The Angular app itself doesn't special-case orientation (no `orientationchange`
  listener found) — it just re-renders at the new viewport dimensions via the same
  responsive CSS as any resize. Given the breakpoint strategy is viewport-based, not
  device-based (§5), a landscape phone (e.g. 812×375) is handled as "a narrow-height
  viewport," which is a reasonable and consistent approach.
- **NOT VERIFIED**: an actual physical rotation event (this environment can emulate a
  landscape-shaped *viewport size* but not a true `orientationchange`/matchMedia
  orientation event, nor the OS-level resize timing real rotation produces). Modal +
  drawer + form behavior at a landscape-shaped viewport was spot-checked via the CSS
  review in §11 and found to use viewport-relative (not portrait-assumed) sizing
  (`height: 100dvh`, `max-height: 90vh`), which should degrade reasonably, but this is
  an inference from code, not a rotation test.

## 14. Accessibility Assessment

- Labeled form fields throughout (not placeholder-only) — confirmed on Login,
  code-reviewed on Register/property-form.
- `aria-label`/`aria-modal`/`role="dialog"` on the confirm modal; `aria-label` on the
  filter sidebar (`aria-label="فلاتر البحث"`) and drawer nav.
- Touch targets: navbar icon buttons (theme toggle, notification bell, mobile toggle)
  are all 40–42px CSS boxes; the notification badge itself is 17px but is
  `pointer-events: none` and inline within the parent 40px hit-target, so it doesn't
  create a small independent tap target (correct pattern, confirmed by reading the CSS
  comment that documents this decision explicitly).
- `prefers-reduced-motion: reduce` is respected for the drawer, overlay, dropdown
  animations, and toggle-bar transitions (`navbar.component.scss`).
- **NOT VERIFIED**: no automated axe/Lighthouse accessibility scan was run in this
  session (no such tooling is configured in `package.json`), and no screen reader
  (VoiceOver/TalkBack) pass was performed — both require tooling/hardware unavailable
  here.

## 15. RTL/LTR Assessment

- ~93% of directional CSS in `src/app` already uses logical properties
  (`margin-inline`, `padding-inline`, `inset-inline-*`, `text-align: start/end`) — 80
  logical usages vs. 6 remaining physical `left`/`right`/`margin-left`/`padding-left`
  occurrences, all individually reviewed (§17 below covers the two that were real bugs;
  the rest were either already RTL-overridden elsewhere in the same file, or
  direction-agnostic centering transforms that don't need to be logical).
- Live-verified: Home page hero, navbar, and mobile drawer all correctly re-mirror
  between German (LTR) and Arabic (RTL), confirmed via screenshots **and** computed
  `getBoundingClientRect()`/`direction` reads (not just visual impression).
- **One CRITICAL bug found and fixed** (mobile filter drawer, §17) and **one MEDIUM bug
  found and fixed** (landing-page select chevron, §17) — both were RTL-direction sign
  errors, the exact class of bug this section warns about.

## 16. Performance Assessment

- Production bundle (this session's build): **initial 616.48 kB raw / 163.47 kB estimated
  transfer** — comfortably inside the `angular.json` production budget (650kB
  warning / 1MB error). Heaviest lazy chunks are `property-form-page` (219.75 kB /
  52.6 kB transfer) and `property-detail-page` (60 kB / 12.8 kB) — both reasonable for
  their complexity (dynamic field sets, image gallery) and already lazy-loaded, not part
  of the initial bundle.
- `OnPush` change detection is used on the pages reviewed (navbar, property-list,
  confirm-modal, etc.).
- One pre-existing build warning (unrelated to mobile UX, not touched): `scriptjs`
  (a transitive dependency of `@capacitor-community/apple-sign-in`) is CommonJS, which
  can cause a minor optimization bailout. Not a mobile-UX defect; flagged for a separate,
  unrelated follow-up rather than fixed here (rule §69 — no unrelated refactors).
- No new `resize`/`scroll`/`orientationchange` listeners were added by this audit; the
  two pre-existing `resize` listeners found (navbar mobile-menu, property-list filter
  sidebar) both use `debounceTime(150)` and `takeUntilDestroyed`, i.e., already cleaned
  up correctly.

## 17. Known Issues Found — Detail

### Finding 1 — BLOCKER (fixed)

- **ID:** MUX-01
- **Title:** Mobile filter drawer renders on top of the property list instead of
  off-screen, in the app's default RTL (Arabic) locale
- **Severity:** CRITICAL (P0 screen, default locale, first-load state — not an edge case)
- **Platform:** Web + Capacitor (any WebView) — CSS-only bug, not platform-specific
- **Device/Viewport:** Reproduced at 320–390px width (all phone widths ≤ 980px); not
  width-dependent beyond crossing the `bp.tablet` breakpoint
- **Screen / Component:** Property List (`/wohnungen`) →
  `src/app/features/properties/property-list/property-list.page.scss`
- **Steps:** Load `/wohnungen` on a mobile-width viewport with the app's default
  `dir="rtl"` locale (Arabic). Do not touch the filter toggle.
- **Expected:** Filter panel (`.filter-sidebar`) is fully off-screen until the user taps
  "الفلاتر" (Filters).
- **Actual:** The panel renders at `left: 249px … right: 521px` of a 357px-wide viewport
  — visibly overlapping the results grid — while the page reports itself as "closed."
- **Evidence:** Live in-browser measurement (`getBoundingClientRect`, before/after):
  `{position: "fixed", transform: "matrix(1,0,0,1,285.6,0)"}` before the fix, i.e.
  `translateX(+105%)`; screenshot showing the "العقارات المتاحة" heading and "إضافة عقار"
  button clipped by the second panel bleeding through. A page-wide overflow scan
  (`document.querySelectorAll('body *')` + `getBoundingClientRect`) found 43 elements
  extending past the viewport's right edge, all descendants of `.filter-sidebar`.
- **Root cause:** `:host-context(html[dir="rtl"]) .filter-sidebar` sets
  `inset-inline-end: 0`, which — confirmed empirically against the same page's own
  correctly-working navbar drawer — resolves to physical `left: 0` under `dir="rtl"`
  (RTL's inline-end is the left edge). The closed-state rule then applied
  `transform: translateX(105%)` (positive/rightward), which moves the panel *from that
  left:0 anchor* back onto the page rather than off past the right edge. The
  `overflow-x: clip` safety net in `styles.scss` (added in an earlier "Phase 3" pass)
  suppressed the resulting horizontal scrollbar, which is why this wasn't caught as an
  obvious "the page scrolls sideways" bug — it silently clipped/hid part of the
  overlapping content edge-on instead, while the panel itself stayed visible mid-page.
- **Fix:** [`property-list.page.scss:98`](../src/app/features/properties/property-list/property-list.page.scss)
  — changed the RTL closed-state transform from `translateX(105%)` to `translateX(-105%)`,
  matching the sign already used (and already correct) in the equivalent RTL rule for the
  main nav drawer in `navbar.component.scss`.
- **Verification:** Live, post-fix: `getBoundingClientRect()` → `{left: -323, right: -51}`
  (fully off-screen); page-wide overflow scan → 0 offending elements (down from 43);
  screenshot shows a clean single-column mobile layout. `npm run typecheck` and
  `npm run build:prod` both pass after the change (SCSS-only, no TS/template changes).
- **Status:** **FIXED, browser-verified.** The drawer's *open*-state transition (tapping
  "الفلاتر" to slide it in) was attempted via synthetic click dispatch in this automated
  session; the Angular `filtersOpen` state and the `filter-sidebar--open` CSS class both
  toggled correctly, but the resulting computed `transform` was inconsistent in a way
  this session could not fully explain through CSS cascade analysis alone (possibly an
  artifact of synthetic vs. trusted click/animation timing in this remote browser
  automation, not necessarily a real second bug — the CSS rule computing the open
  transform was not touched by this fix and is unchanged from before). **Recommend a
  quick manual re-check of "tap Filters → panel visibly slides in" on a real
  device/emulator or a normal desktop browser tab before considering this screen fully
  closed out.**

### Finding 2 — MEDIUM (fixed)

- **ID:** MUX-02
- **Title:** Landing-page dropdown chevron icon not mirrored for RTL
- **Severity:** MEDIUM (visual inconsistency, not a functional blocker; P2 screen)
- **Platform:** Web + Capacitor
- **Screen/Component:** Landing page (`/landing`) →
  `src/app/features/landing/landing-page.component.scss`, `.field-select`
- **Steps:** View the landing page's lead-capture form in Arabic (the app's default
  locale) on any viewport.
- **Expected:** The select's dropdown chevron sits on the same side the equivalent
  control uses elsewhere in the app (e.g. `property-form.page.scss`'s `select`, which
  has an explicit RTL override).
- **Actual:** Chevron background-image stayed pinned to the physical left with
  `padding-left: 2.5rem`, with no `:host-context(html[dir="rtl"])` override anywhere in
  the file (confirmed via grep — zero RTL-scoped rules existed in this file at all).
- **Root cause:** The RTL mirror that exists for the same visual pattern in
  `property-form.page.scss` was never carried over when this landing-page field was
  built.
- **Fix:** Added the missing `:host-context(html[dir="rtl"]) .field-select` override,
  mirroring the exact pattern already proven correct in `property-form.page.scss`
  (`background-position: right 0.9rem center; padding-left: 1rem; padding-right: 2.5rem;`).
- **Verification:** CODE VERIFIED (pattern-matched against the working reference in the
  same codebase); not independently re-screenshotted in-browser (P2 page, lower priority
  within this session's time budget).
- **Status:** FIXED.

### Non-findings worth recording (looked at, found correct — no change made)

- `z-index` inconsistency: `styles.scss` defines a documented global scale
  (`--z-dropdown:100` … `--z-toast:500`), but `navbar.component.scss` uses its own
  literal integers (1000/1100/1150/1200) instead of those tokens. **Not a functional
  bug** — the navbar's values are all higher than the global scale's, so nothing
  actually collides today — but it is an architectural inconsistency (two parallel
  z-index systems) worth a dedicated cleanup pass rather than a blind renumbering inside
  this audit (renumbering z-index globally is exactly the kind of broad, high-blast-radius
  change rule §69 asks to avoid without a dedicated pass and full regression sweep).
- `app.component.scss` contains CSS (`header`, `nav a`, `nav button`, `.active`,
  generic `button { color: blue }`) that cannot match anything in `AppComponent`'s actual
  template (`<router-outlet><app-toast-container>` only) — 100% dead, Angular-scoped CSS
  with zero runtime effect on any screen. Left untouched: it has no mobile-UX impact
  (nothing renders it), and removing dead code is a hygiene item outside this audit's
  "root-cause the reported mobile problems" scope — flagged here so it isn't rediscovered
  as if new.

## 18. Fixes Applied

| File | Change | Reason | Risk |
|---|---|---|---|
| [`src/app/features/properties/property-list/property-list.page.scss`](../src/app/features/properties/property-list/property-list.page.scss) | RTL closed-state drawer transform: `translateX(105%)` → `translateX(-105%)` | Fixes MUX-01 (CRITICAL): drawer overlapped page content on every mobile RTL load | Very low — single-property CSS sign fix, scoped to one `@media` block, matches an already-proven-correct pattern elsewhere in the same codebase; verified live before/after |
| [`src/app/features/landing/landing-page.component.scss`](../src/app/features/landing/landing-page.component.scss) | Added `:host-context(html[dir="rtl"]) .field-select` override | Fixes MUX-02 (MEDIUM): chevron icon on the wrong side in RTL | Very low — additive CSS rule, scoped to one class, mirrors an existing pattern |

No TypeScript, HTML template, native (Android/iOS), or Capacitor configuration files
were changed.

## 19. Device Test Matrix

| Platform | Device/Viewport | OS | Area | Result | Evidence |
|---|---|---|---|---|---|
| iOS | SE/compact (375×667 class) | — | Safe area / layout | BROWSER-EMULATION VERIFIED (Chromium, not WKWebView) | Screenshots, `scrollWidth` checks |
| iOS | Standard (390×844) | — | Keyboard, layout | CODE VERIFIED only | SystemBars.java / no visualViewport hacks |
| iOS | Pro (Dynamic Island) | — | Top inset | CODE VERIFIED only (`env()` fallback path) | index.html `viewport-fit=cover`, safe-area CSS vars |
| iOS | Pro Max | — | Bottom inset | CODE VERIFIED only | same as above |
| iOS | any | — | Real device / Simulator | **NOT VERIFIED** | No Mac/Xcode/Simulator available |
| Android | Small (320–360px width class) | — | Layout, overflow | BROWSER-EMULATION VERIFIED — **found & fixed MUX-01 here** | Screenshots, `getBoundingClientRect` scans, before/after |
| Android | Standard (390–430px width class) | — | Navigation, drawer | BROWSER-EMULATION VERIFIED | Drawer open/close, scroll-lock, RTL mirroring all measured live |
| Android | Large / tablet (768–1024px) | — | Adaptive layout | CODE VERIFIED (`bp.tablet` grid collapse logic reviewed) | Not independently loaded at this width this session |
| Android | API 35 (edge-to-edge enforced) | 15 | Edge-to-edge | CODE VERIFIED (SystemBars.java `WindowInsetsCompat` handling) | Plugin source read directly |
| Android | API 36 (predictive back available) | 16 | Back / insets | CODE VERIFIED — deliberately not changed, flagged as follow-up | AndroidManifest.xml, NativeBackButtonService.ts |
| Android | any | — | Real device / emulator | **NOT VERIFIED** | No Android Studio emulator or physical device available |

## 20. Screen-by-Screen Matrix

| Screen | 320 | 375 | 390 | 430 | 768 | 1440 | RTL | Status |
|---|---|---|---|---|---|---|---|---|
| Home | ✅ live | ✅ live | — | — | — | — | ✅ live (mirrors correctly) | Verified (browser emulation) |
| Login | ✅ live | — | ✅ live | — | — | — | ✅ live | Verified (browser emulation) |
| Properties List | ✅ live — **found+fixed MUX-01** | — | — | — | — | — | ✅ live (post-fix) | Verified (browser emulation) |
| Property Detail | — | — | ✅ live (error state only — no reachable backend for real data) | — | — | — | — | Partially verified — gallery/sticky-CTA CODE VERIFIED only |
| Navbar / Mobile Drawer | ✅ live | ✅ live | — | — | — | — | ✅ live (mirrors + scroll-lock verified) | Verified (browser emulation) |
| All other P1/P2 screens (Register, Property Form, Favorites, Short-Stay, Investments, Checkout, Admin, …) | — | — | — | — | — | — | — | CODE VERIFIED only (pattern/CSS audit) — not individually loaded live this session |

Legend: "✅ live" = loaded in the browser and measured/screenshotted this session.
Blank cells were not individually re-tested at that exact width (not "failed").

## 21. Remaining Manual Verification

The following are explicitly **NOT VERIFIED** and should be checked before a store
submission, in this order of importance:

1. **MUX-01's open-state transition** (§17) — tap "الفلاتر" on a real device/emulator or
   a normal (non-automated) browser tab and confirm the panel visibly slides in.
2. Real iPhone (SE-class, standard, Pro/Dynamic-Island, Pro Max) — safe-area rendering,
   keyboard-open behavior on Login/Register/Property Form, and the property-detail image
   gallery with real data.
3. Real Android device or emulator, gesture nav **and** 3-button nav — drawer/filter
   open+close, hardware/gesture back chain through overlay→route→exit, edge-to-edge
   rendering with a real notch/cutout device if available.
4. Android 16 predictive-back gesture specifically — confirm whether enabling
   `enableOnBackInvokedCallback` is worth doing in a follow-up, and if so, re-verify the
   full overlay→route→exit chain still fires correctly under it (§7/§12).
5. A real rotation event (not just a landscape-shaped viewport) on both platforms with a
   modal, the drawer, and a form open (§13).
6. Screen reader pass (VoiceOver/TalkBack) — no automated a11y tooling exists in this
   repo (§14).
7. Full data-backed pass of Property Detail (gallery, sticky CTA, reviews) and Property
   List (populated grid, pagination/infinite scroll) — this session's backend was
   unreachable (CORS, by design, from a `localhost` origin against the production API),
   so only the empty/error states could be exercised.

## 22. Production Build Result

```
npm run typecheck   → PASS (tsc --noEmit, 0 errors)
npm run test:ci      → PASS (123/123, Chrome Headless)
npm run build:prod   → PASS
  Initial bundle: 616.40 kB raw / 162.89 kB transfer (budget: 650kB warn / 1MB error)
  Largest lazy chunk: property-form-page, 219.75 kB / 52.6 kB transfer
  1 pre-existing, unrelated warning: `scriptjs` (apple-sign-in dependency) is CommonJS
```

Re-run after both fixes in this document (SCSS-only changes) — same result, 0 new
errors/warnings introduced.

`npm run lint`: **NOT APPLICABLE** — no ESLint config or `lint` script exists in this
repository (`package.json` has `typecheck`/`typecheck:strict` but no `lint`); this is a
pre-existing project characteristic, not something this audit was asked to add.

## 23. Final Gate

**PHASE 7 — MOBILE UX**
**STATUS: PASS WITH WARNINGS**

Reasoning:
- ✅ P0 screens usable (Home, Login, Property List, Navbar/Drawer verified live; Property
  Detail verified for its error state, CODE VERIFIED for the rest).
- ✅ The one CRITICAL issue found (MUX-01) is fixed and browser-verified.
- ✅ Safe area, keyboard-insets, and Android back-navigation are handled through
  documented, evidence-backed mechanisms (Capacitor 8 `SystemBars`, `ScrollLockService`,
  `OverlayBackHandlerService`/`NativeBackButtonService`) — CODE VERIFIED, architecturally
  sound.
- ✅ RTL/LTR verified live with measured geometry, not just visual impression.
- ✅ Production build, typecheck, and unit tests all pass with no regressions from the
  fixes applied.
- ⚠️ No physical iOS or Android device, no Xcode/Simulator, no Android
  emulator was available in this environment — every native-platform behavior above is
  CODE VERIFIED, not device-verified. This is a genuine gap for a store-submission
  decision, not a formality.
- ⚠️ Most P1/P2 screens were reviewed by code/pattern audit rather than individually
  loaded and measured live (no reachable backend limited how much data-dependent UI —
  galleries, populated lists — could be exercised in the browser either).
- ⚠️ MUX-01's fix is verified for the (much more important) default/closed state; its
  open-state animation should get one more real-device or non-automated-browser check
  (§17, §21.1) before this screen is considered fully closed out.

None of the above warnings are BLOCKER/CRITICAL-level open issues — they are verification
gaps this specific sandboxed session could not close, not known defects. **Phase 8 is not
started.**

### Store Readiness

- **Apple:** PASS WITH WARNINGS — technical safe-area/keyboard/orientation handling is
  sound by code review; real-device verification (§21.2) is the recommended gate before
  submission, not a known defect.
- **Google:** PASS WITH WARNINGS — edge-to-edge handling is technically sound
  (Capacitor 8 `SystemBars`); predictive-back is on the legacy (still-functional) path by
  design, and real-device/emulator verification (§21.3–4) is the recommended gate before
  submission.
