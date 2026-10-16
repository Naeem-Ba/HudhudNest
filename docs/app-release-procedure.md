# App Release Procedure, Version Tooling and Rollback (App Update Management — Phase 4)

How a native release (Android / iOS) is versioned and how it interacts with the
App Update Management system:

- backend contract and rules: HudhudNestApi `docs/app-update-management.md`
- end-user update dialogs (launch-time check): Phase 2 (`AppUpdateService`)
- admin screen (`/admin/app-updates`): Phase 3, `docs/app-update-admin-dashboard.md`

## The rule that drives everything

A release row has a **Version** (latest) and a **MinimumSupportedVersion**. A client is
*optionally* prompted when `installed < Version` and *forced* to update only when
`installed < MinimumSupportedVersion`. "Mandatory" is derived, never stored. So **raising the
minimum is the only action that locks users out** — treat it as the dangerous step of any release.

## Version tooling

Native versions live in two places that used to drift (Android `1.1.0` / code 2 vs iOS `1.0` / build 1):

| Platform | Version | Build number |
|---|---|---|
| Android `android/app/build.gradle` | `versionName` | `versionCode` |
| iOS `ios/App/App.xcodeproj/project.pbxproj` | `MARKETING_VERSION` | `CURRENT_PROJECT_VERSION` |

```bash
npm run version:check                 # report; errors on malformed values, warns on drift
npm run version:set -- 1.2.0          # writes BOTH platforms; build = current versionCode + 1
npm run version:set -- 1.2.0 --build 7
```

- The version must be exactly `major.minor.patch` (what the backend accepts). The build number must be
  greater than the current Android `versionCode` (Google Play rejects non-increasing codes).
- `version:check -- --strict` runs in CI (`Native app version check` step, together with `npm run test:tools`).
  Malformed or inconsistent values fail CI, and so does drift between the platforms (aligned at 1.1.0 build 3).
  `node tools/app-version.mjs verify-tag v<x.y.z>` fails unless the tag names the version in both projects.
- The client normalizes a two-segment iOS `1.0` to `1.0.0` before calling the API, so the drifted state
  is functional; `version:set` writes the three-segment form.
- No new dependencies; the logic is in `tools/lib/app-version.mjs` (unit-tested with `node --test`).

## Release procedure

1. `npm run version:set -- <x.y.z>` and commit the change.
2. Merge to `main`, then tag the merged commit `v<x.y.z>`. The tag runs the full Frontend CI and then builds the signed
   Android AAB (`android-latest` release); Codemagic builds iOS from the same tag. A plain merge to `main` builds no store
   package. The iOS simulator job on GitHub runs only when the change touches the native project (`ios/`,
   `capacitor.config.*`, `package*.json`, the iOS tools or `frontend-ci.yml`; `tools/lib/native-changes.mjs`).
   Upload to Google Play / App Store Connect and wait until the build is **live in the stores**.
   The whole path, with variable names and the first-release checklist: `docs/RELEASE-RUNBOOK-AR.md`.
3. **Only after the build is live**, open `/admin/app-updates` and create the release for each platform:
   `Version` = the shipped version, `MinimumSupportedVersion` = the oldest version you still support,
   store URL filled in once the store listing exists. Create it disabled, review, then enable.
   - Enabling before the store has the build makes users get prompted to an update they cannot install.
   - Keep `MinimumSupportedVersion` unchanged for a normal release. Raise it only for a real
     compatibility break (API removed, security fix) and never above `Version`.
4. Verify: `GET /api/app-updates/check?platform=Android&currentVersion=<older>` returns the expected
   `updateAvailable` / `mandatory`, then open an older installed build and confirm the dialog.

## Rollback

The store binary cannot be un-published for devices that already installed it; rollback here means
controlling what the update check tells clients. Enable/disable invalidates the cache immediately
on the server.

| Situation | Action |
|---|---|
| New release is bad, users not yet forced | **Disable** it in `/admin/app-updates`. The effective release becomes the highest remaining enabled version (its own minimum applies). Stop the staged rollout in the store console. |
| New release raised the minimum and is locking users out | **Disable** it (or edit its `MinimumSupportedVersion` down). Affected users are unblocked on their **next app launch** — the client checks at launch and again when the app returns from the background (at most once an hour after a
successful check, five minutes after a failed one). |
| A wrongly created release | Disable, then edit or delete (soft delete). A disabled release never affects clients. |
| Bad build already installed, fix needed | Ship a fixed higher version (`version:set`, new build number) and, if the bad build must be retired, raise `MinimumSupportedVersion` to the fixed version **only once the fix is live in the stores**. |

Notes:
- A backend or Redis outage never blocks the app: the check falls back to the database, then to "no update".
- Users who dismiss the optional dialog are asked again on the next launch, or when a newer version is released.

## Deferred / not automated

- The version bump is a manual, reviewed commit (`version:set`), not an automatic CI commit.
- Creating the release rows in the admin dashboard is a manual step after the store goes live; it is not
  triggered from CI, since only a human can confirm the build is live in the stores.
- Store upload itself remains manual (no Play/App Store publishing credentials are wired into CI).
