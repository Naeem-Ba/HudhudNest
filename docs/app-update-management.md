# App Update Management (Frontend — core UX)

Detects on native app launch whether the installed Android/iOS build is out of date, and shows
an optional or mandatory update dialog that opens the platform store. Backend contract, data
model, and admin API live in the separate HudhudNestApi repo
(`docs/app-update-management.md` there) — this document only covers the frontend half.

**Scope of this pass**: the update-check service and the two dialogs. The admin "App Updates"
management screen and CI/CD version-bump automation are explicitly out of scope — future work.

## Where things live

```
src/app/core/api/
  app-update.service.ts              the update-check + mandatory/optional signals + openStore()
  app-update-native.gateway.ts        thin wrapper around Capacitor.isNativePlatform/getPlatform,
                                       App.getInfo, Browser.open — see its doc comment for why
                                       this exists (registerPlugin() Proxy objects aren't
                                       reliably spyOn-able; DI-injecting this gateway is)

src/app/app.component.ts             calls appUpdate.initialize() once at startup; renders the
                                      two <app-confirm-modal> dialogs bound to the service's
                                      mandatoryUpdate()/optionalUpdate() signals

src/app/shared/ui/confirm-modal.component.ts   gained a hideCancel input for the mandatory
                                                (non-dismissible) dialog variant
```

## Behavior

- **Web is skipped entirely.** There is no "installed web app version" concept — the site is
  continuously deployed and always serves the latest build. `AppUpdateService.initialize()`
  returns immediately when `Capacitor.isNativePlatform()` is false.
- **Non-blocking.** Called from `AppComponent`'s constructor (same place as
  `NativeBackButtonService.initialize()`), never an `APP_INITIALIZER` — the check never delays
  first paint.
- **Version sent to the backend** comes from `App.getInfo().version` (the platform's real
  installed version — Android `versionName`, iOS `MARKETING_VERSION`), normalized to
  `major.minor.patch` via `normalizeAppVersion()`. This matters concretely: iOS's
  `MARKETING_VERSION` is currently `"1.0"` (two segments) — the backend's `AppVersion.TryParse`
  rejects anything that isn't exactly three segments and would answer `422`. Missing segments
  are padded with zero; extra segments are truncated; a non-numeric segment becomes `0` rather
  than throwing and silently killing the whole check.
- **Mandatory vs optional**: the backend response's `mandatory` flag decides which dialog shows
  (never derived on the frontend — the backend already computed `currentVersion <
  minimumSupportedVersion`). Mandatory renders with `hideCancel` + `closeOnBackdrop=false` (no
  dismiss path except "Update Now"); optional renders as an ordinary dismissible
  `ConfirmModalComponent` with "Update Now" / "Later".
- **"Later" is once per app launch**, with no persistence — `optionalUpdate` is a signal on a
  `providedIn: 'root'` singleton, so it naturally resets the next time the native process starts.
- **No `storeUrl` yet** (no app is published yet) degrades gracefully: the optional dialog still
  offers "Update Now" but it's a no-op without a URL; the mandatory dialog's "Update Now" button
  is disabled instead of doing nothing silently.
- **Network/backend failure is swallowed**, matching the backend's own "never break app
  startup" contract — logged nowhere loudly, no toast, the app just proceeds as if no update
  info was available.

## Opening the store

`@capacitor/browser` (`Browser.open({ url })`) was added as a new dependency — Capacitor's own
first-party plugin, same major version as the already-installed Capacitor 8 core, actively
maintained. Not `window.open()`: once `@capacitor/browser` was extracted out of Capacitor core
(v3+), plain `window.open` no longer gets special native handling for external URLs inside a
Capacitor WebView. Run `npx cap sync android`/`ios` after pulling this change (already
verified for Android in this change; iOS sync needs a Mac/CI, same as any other native
dependency bump).

## Testing

`app-update.service.spec.ts` mocks `AppUpdateNativeGateway` via Angular DI (`useValue`), not
`spyOn` on the imported `App`/`Browser`/`Capacitor` objects — those are `registerPlugin()`
Proxy objects and `spyOn` doesn't reliably intercept them (confirmed the hard way: the first
attempt silently called through to the real, un-mocked implementation instead of the spy).
Covers: version normalization edge cases, web-skip, Android/iOS platform mapping,
mandatory-vs-optional selection, network-failure swallowing, native-info-read failure
swallowing, single-check-per-launch, and `openStore` with/without a URL.
