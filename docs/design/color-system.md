# HudhudNest colour system

**Single source of truth:** `src/styles/_tokens.scss` (loaded by `src/styles.scss`). Nothing else defines the palette.

## How a page gets correct colours

1. Use a **semantic token** (`var(--text-primary)`, `var(--card-bg)`, `var(--success-text)` …), never a hex/rgb literal.
2. That is all. `html[data-theme="dark"]` redefines the tokens, so light and dark both work with no `:host-context` or `@media` rules in the component.

## Token layers

| Layer | Examples | Use |
|---|---|---|
| Primitives | `--gray-50…900`, `--gold`, `--navy`, `--surface`, `--page-bg` | Rarely directly. The gray scale is *inverted* in dark mode (900 is the strongest text in both themes). |
| Backgrounds | `--bg-primary/secondary/tertiary`, `--surface`, `--surface-elevated`, `--card-bg`, `--modal-bg`, `--input-bg`, `--dropdown-bg`, `--table-header-bg`, `--nav-bg`, `--sidebar-bg`, `--skeleton-base/shine` | Surfaces |
| Text | `--text-primary / secondary / tertiary / muted / placeholder / disabled`, `--text-strong`, `--text-on-primary`, `--text-on-accent`, `--text-on-navy(-muted)`, `--text-inverse` | Always ≥ 4.5:1 on `--surface`, `--page-bg`, `--gray-100` |
| Interactive | `--primary`, `--primary-hover/active/disabled`, `--primary-text` (gold as *text*), `--link`, `--link-hover`, `--focus-ring`, `--inverse-bg/-text` (selected chips) | |
| Borders | `--border-primary/secondary/subtle`, `--divider`, `--input-border` (≥ 3:1), `--focus-border` | |
| Status | `--success/warning/error/info` + `-bg`, `-text`, `-border`, `-icon`; solid buttons `--success-solid`, `--danger-solid`, `--warning-solid`, `--neutral-solid` (white text) | Never use `--success`/`--danger` as *text*: they are for fills/icons. |
| Specialised | `--badge-*`, `--tooltip-*`, `--map-attribution-*`, `--chart-1…5`, `--notification-unread-bg` | |

## Rules

* **Gold as text** is `--primary-text` / `--gold-text` (dark gold on light, light gold on dark). Bright `--gold` is a *fill* (buttons) with `--text-on-primary` on top.
* **White text** only on a solid that is dark in both themes (`--navy`, `--*-solid`, an image with `--scrim-image`).
* **Text over images/gradients:** add a scrim; contrast is measured against the worst pixel, not the average.
* **Don't signal state with colour alone:** pair with text or an icon.
* **`!important`** only where documented (iOS 16 px input floor, `prefers-reduced-motion`, Angular validation borders).
* Third-party widgets (Leaflet, date picker): set their colours through tokens (`--map-attribution-*`, `--drp-accent`).

## Theme switching

`ThemeService` (`src/app/core/services/theme.service.ts`):

* Preference = `system` (default) | `light` | `dark`, stored in `localStorage["hudhudnest-theme"]` (absent = system).
* `system` follows the OS live (`prefers-color-scheme` change event). An explicit choice is never overridden by the OS.
* An inline script in `index.html` applies the same rule before first paint (no flash).
* Sets `data-theme` + `color-scheme` on `<html>`, updates `<meta name="theme-color">`, and (native) calls `SystemBars.setStyle` so status-bar icons stay readable.
* UI: navbar toggle (explicit light/dark) and *Settings → Appearance* (system/light/dark).

## Guards (run in CI via `npm run test:tools`)

`tools/lib/theme-colors.test.mjs`:

1. every documented token pair meets WCAG 2.2 AA in **both** themes;
2. no `var(--x)` references an undefined token (an undefined var silently falls back to a light-only hex in dark mode — this was the root cause of several unreadable pages);
3. hard-coded colour literals per file may not grow (`tools/theme-colors-baseline.json`; lower it with `npm run theme:baseline` after removing literals).

## Adding a colour

1. Need a new role? Add it to `_tokens.scss` **in both** `:root` and `html[data-theme="dark"]`, reference primitives, and add its pair(s) to `PAIRS` in the test.
2. Run `node --test tools/lib/theme-colors.test.mjs`.
3. Never copy a hex into a component. If a third-party/brand colour is unavoidable (e.g. Apple button), keep it as a documented exception and lower the baseline elsewhere.

## Manual verification recipe

Build (`ng build --configuration development`), serve `dist/HudhudNest/browser` with an SPA fallback, and use Playwright: for each route × `ar/en/de` × light/dark × 1366/390 px, set `localStorage["hudhudnest-theme"]`, then compute for every text node the painted background (`document.elementsFromPoint`, compositing translucent layers) and compare with WCAG; also run axe-core `color-contrast`.
