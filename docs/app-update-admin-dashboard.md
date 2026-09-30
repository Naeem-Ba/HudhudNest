# App Update Management — Admin Dashboard (Phase 3)

Admin UI for the backend `AdminAppReleasesController` (`/api/admin/app-releases`, Admin role only).
The backend contract, the derived "mandatory" rule, and the effective-release resolution are
documented in HudhudNestApi's `docs/app-update-management.md`; the end-user update dialogs are Phase 2
(`AppUpdateService`). This document covers only the dashboard.

## Where things live

| Piece | Path |
|---|---|
| Route `/admin/app-updates` (`AdminGuard`, lazy) | `src/app/app.routes.ts` |
| Navbar link (desktop + mobile drawer, admin only) | `src/app/navbar/navbar.component.html`, key `NAVBAR.ADMIN_APP_UPDATES` in `public/i18n/{ar,en,de}.json` |
| API wrapper | `src/app/core/api/admin-app-updates.service.ts` |
| Page | `src/app/admin/app-updates/admin-app-updates.page.{ts,html,scss}` |
| Tests | `admin-app-updates.service.spec.ts`, `admin-app-updates.page.spec.ts` |

`AdminGuard` is a UX convenience only; every endpoint enforces `[Authorize(Roles = "Admin")]` on the server.

## Behavior

- **List** — paged (20/page), filter by platform and enabled state. Filters reset to page 1.
- **Create / Edit** — one inline form. `platform` is immutable after creation (the control is disabled
  while editing; changing platform means creating a new release). `isEnabled` is only offered on create;
  after that, use enable/disable.
- **Enable** — asks for confirmation, because enabling a release can immediately force existing users
  below its `MinimumSupportedVersion` to update. The dialog states the minimum version explicitly.
- **Disable** — no confirmation (the safe direction; it only hides the release).
- **Delete** — confirmed, soft delete on the server.
- There is intentionally **no "mandatory" checkbox**: mandatory is derived on the server from
  `currentVersion < MinimumSupportedVersion`.

## Client-side validation (mirrors the server; the server remains authoritative)

- `version` / `minimumSupportedVersion`: exactly `major.minor.patch`, no leading zeros, no suffixes.
- `minimumSupportedVersion <= version`, compared **numerically** (`1.9.9 < 1.10.0`), never as strings.
  The cross-field rule is skipped while either field has a format error, so it never masks it.
- `storeUrl`: optional; when present, an absolute `http`/`https` URL. No store URLs are hardcoded anywhere.
- Release notes: max 4000 chars each (ar / en / de).
- Server errors (e.g. 409 duplicate enabled release for the same platform + version) are surfaced via the
  server's `message`.

## Localization

The page is Arabic-only with no ngx-translate keys, matching the other internal admin tool pages
(e.g. the marketing dashboard). Only the navbar entry is translated (ar/en/de).

## Not verified in a browser

Verified through unit tests, `tsc`, and the production AOT build only. A manual pass in a running app
(create → enable → confirm dialog → disable → delete, and mobile width < 980px where rows collapse to
labeled cards) is still recommended before release.
