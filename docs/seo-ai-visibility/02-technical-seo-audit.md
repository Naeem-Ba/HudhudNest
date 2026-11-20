# 02 — Technical SEO Audit (frontend, edge, backend)

How to read this file:
- **IDs:** FE = frontend/edge, BE = backend.
- **Severity:** P0–P3.
- **Status:** LIVE, MAIN (merged, not deployed), or both.
- **Effort:** S/M/L.
- **Evidence:** file:line refers to app `main` 47f7010 or API `master` 77e66262, unless marked release.

Prior work reused: QA Phase 20 (P20-D01..D08), offices P5, share-links audit 2026-11-18.
- Fixed and live: P20-D01 (static OG), P20-D05 (`/wohnungen` 301).
- Fixed in code: P20-D02 (sitemap sources), but empty live because the API is down.
- Still open: P20-D04 (soft 404) and P20-D08 (hreflang).

---

## A. Rendering and indexability

### BE-01 · P0 · LIVE · Production API suspended

**Evidence**
- `api.hudhudnest.com/*` returns 503 with `x-render-routing: suspend`, a Render-level suspension.
- `respondForSearchEngine` fails open on anything other than a 404 (`netlify/edge-functions/social-crawler-meta.mjs:39-55`).

**Impact**
- Crawlers receive 200 shells that render error states.
- The sitemap loses every dynamic URL.
- Share previews read "الإعلان غير متاح".

**Fix**
- Owner restores the API on an always-on instance (11-D01).
- Then, for search-engine UAs, answer **503 + `Retry-After: 3600`** when the API returns 5xx or times out, instead of a 200 shell. Do this only once cold starts are gone, otherwise normal wake-ups would return 503.

**Effort** S (ops) + S (code).

### FE-01 · P0 (confirm in Search Console) · LIVE+MAIN · Googlebot likely renders English

**Evidence**
- `src/app/app.config.ts:61-88` resolves the language as: `?lang`, then a stored choice, then `/geo` country, then device languages, then `en` (`first-visit-language.ts`).
- Live `/geo` with a Googlebot UA returns `{"country":"US"}`.
- A Playwright render with a Googlebot UA and en-US locale gave:
  - `lang="en"`, title "Digital real-estate platform in Syria | HudhudNest", H1 "Find the property that suits you".
  - The Lighthouse LCP element was the same English H1.
- The raw HTML declares `lang="ar"`.

**Impact**
- The Arabic site may not be what Google indexes, and the language signals conflict.
- This is an inference: WRS language behaviour is undocumented. Verify with URL Inspection → "Test live URL" → screenshot and rendered HTML.

**Fix (S)**
- For known crawler UAs with no `?lang` and nothing stored, default to `ar`. Either `/geo` returns `country:null` for bots and the resolver maps null to `ar`, or the resolver checks the UA list already in `lib/social-crawler.mjs`.
- Add a static `og:locale=ar_SY`.

**Risk** Low.

### FE-02 · P1 · LIVE+MAIN · Client-side rendering only

**Evidence**
- `angular.json` uses `@angular/build:application` with no SSR or prerender, and `@angular/ssr` is absent.
- `public/_redirects` has `/* /index.html 200`.
- The body is only `<app-root>`.

**Impact**
- Non-JS crawlers (most AI crawlers, Meta, partially Bing) see no content.
- Google indexes in a deferred second wave, and only if the API answers during render.

**Fix**
- See §G (rendering options). Recommendation: an edge-rendered snapshot (option C).

### FE-03 · P1 · LIVE+MAIN · An API outage becomes SEO damage

**Evidence**
- **Office page:** `src/app/features/agencies/agency-public.page.ts:750` uses `catchError(() => of(null))`, then `markNotFound()` sets **`noindex, nofollow`** for *any* error (`:755-758`).
  - Live render of `/offices/x` shows "Couldn't reach the server" plus noindex.
- **Listing page:** a non-404 error leaves the page indexable with the home title and no canonical (`property-detail.page.ts:685-693`).
- **Sitemap:** on error, `lib/sitemap.mjs:186-196` stops paging, and the handler still answers 200 with `max-age=3600`.
- **Counter-example:** short-stay and investments correctly set noindex only on a 404 (`short-stay-detail.page.ts:166-170`, `investment-details.page.ts:117-120`).

**Fix (S-M)**
- Set noindex only on a definitive 404.
- On a transient error, show a page-specific title and no noindex.
- For the sitemap, keep the last good copy or return 503 when every dynamic source fails.

### FE-04 · P1 · LIVE+MAIN · Discovery depends on the sitemap alone

**Evidence**
- Pagination is `<button (click)="goToPage()">` (`property-list.page.html:526-558`).
- All 24 query parameters canonicalize to `/properties` (`property-list.page.ts:277,717-741`).
  - Live: `/properties?lang=en&page=2` has canonical `/properties`.
- There are no indexable city or type pages.

**Fix**
- (S) Real `<a href="?page=N">` links with a self canonical for paginated pages.
- (M) A whitelist of facet URLs (see 03 for the page model).
- Everything else stays canonical to the base or `noindex,follow`.

### FE-05 · P1 · LIVE (fixed in MAIN #272) · Every shared listing previews as "unavailable"

**Evidence**
- The release edge function returns 404/502 for any non-OK API response, with no timeout.
- Live: WhatsApp UA gets **502**.
- MAIN returns the not-found card only on a 404, and has an 8 s timeout, 1200×630 Cloudinary images, and Viber/Snapchat/Bluesky/Mastodon UAs.

**Fix**
- Deploy MAIN after the API is restored.
- Re-scrape key URLs in the Facebook Sharing Debugger.

### FE-07 · P2 · LIVE+MAIN · Soft 404s and client-only redirects

**Evidence**
- Unknown paths return 200 (`'**' → not-found` adds only a JS noindex; `/not-found` is itself disallowed in robots).
- `/agencies/:slug` → `/offices/:slug` and `/home` → `/` are Angular redirects returning 200 (`app.routes.ts:15,220`).
- Deleted short-stay and investment pages return 200 plus a JS noindex, because the edge function only covers `/properties/*`, `/landing` and `/offices/*`.
- `/reviews*`, `/services/join` and `/o/:code` inherit the home meta.

**Fix**
- (S) In `_redirects`: `/agencies/* /offices/:splat 301!` and `/home / 301!`.
- (S) Add noindex or a canonical on `/reviews*` and `/services/join`.
- (M) Real 404/410 from the edge for short-stay and investments (see BE-07).

### FE-12 · P3 · URL design

**Evidence**
- Listing, short-stay and investment URLs are bare GUIDs.
- Office slugs may be Arabic; they are percent-encoded correctly.
- The Arabic-first site uses German legal and info slugs: `/kontakt`, `/impressum`, `/ueber-uns`, `/fuer-anbieter`.

**Fix (optional, M)**
- `/properties/{guid}/{slug}` with the slug in the canonical and a 301 when the slug is wrong.
- Do not rename the legal slugs without a redirect plan (rule 10).

## B. Multilingual

### FE-06 · P1 · LIVE+MAIN · One URL serves four languages; no hreflang

**Evidence**
- The language is stored in localStorage (`language.service.ts:13,107-116`).
- The canonical drops `lang` (`page-meta.service.ts:136`).
- There is no hreflang anywhere, including the sitemap.

**Impact**
- Only one language per URL can be indexed.
- de/tr/en pages cannot rank as their own documents.

**Fix options (decision 11-D05)**
- (M) A self-canonical with `?lang=xx`, hreflang alternates (bare URL = `ar` + `x-default`) in the head and the sitemap. Low routing risk.
- (L) Path prefixes `/en/ /de/ /tr/`. The cleaner long-term structure, but higher risk: router changes, deep links, Capacitor.
- Recommendation: do FE-01 now. Choose the `?lang` variant only when real translated content exists for the page type (see BE-11). Hreflang between pages that differ only in UI chrome adds little.

### BE-11 · P2 · Translation of listing content

**Evidence**
- Translations exist only via POST (`ListingTranslationsController.cs:21-63`): machine-made, rate-limited, stored with provider and source language (`ListingTranslation.cs`).
- GET detail returns only the original text.

**Fix (L)**
- Add a read-only GET for stored translations (never calls the provider), marked as machine translation.
- Only then are per-language listing pages substantively different.

## C. Crawl control

### robots.txt (LIVE) · PASS with notes
- Correct private Disallows, generated from one tested source.
- **Notes:**
  - FE-13: `Disallow: /users/` prevents Google from seeing the JS noindex on profiles, so URLs can still be indexed URL-only. Prefer crawlable plus noindex.
  - No AI-crawler groups. Policy in 04.

### FE-09 · P2 · Non-production protection

**Evidence**
- `tools/generate-robots.mjs` writes `Disallow: /` unless `CONTEXT=production`.
- The JS noindex applies only for a non-production environment (`meta.service.ts:145-149`).
- `netlify.toml` has **no `[context.branch-deploy]`**, so branch deploys build the *production* configuration and get no JS noindex.
- No `X-Robots-Tag` is generated for non-production.
- Live staging hosts could not be fetched (proxy).

**Fix (S)**
- Non-production builds emit `/* X-Robots-Tag: noindex, nofollow` in the generated `_headers`.
- Add `[context.branch-deploy] command = "npm run build:staging"`.
- Owner check: curl the staging robots.txt (see 10).

### BE-08 · P2 · API host has no robots.txt or `X-Robots-Tag`

**Evidence**
- API `wwwroot` is empty.
- `SecurityHeadersMiddleware.cs:25-36` sets no `X-Robots-Tag`.

**Fix (S)**
- Send `X-Robots-Tag: noindex` on API responses.
- **Do not** add `Disallow: /` to the production API robots: Googlebot must be able to fetch the API to render pages. Staging may use `Disallow: /`.

### BE-05 · P1 · Rate limiting can starve crawlers and the sitemap

**Evidence**
- The rate limiter runs before the output cache (`Program.cs:320-335`).
- Limit is 120 req/min per IP for public reads (`RateLimitingRegistration.cs`).
- The edge sitemap calls the API from shared Netlify IPs and truncates silently on 429.

**Fix (M)**
- Serve cached GETs before the limiter.
- Give a higher quota to edge calls carrying the existing `X-HN-Edge-Secret` header.
- Optionally give a higher quota to reverse-DNS-verified Googlebot/Bingbot.

## D. Sitemap

### FE-08 / BE-06 · P2 · Robustness and coverage

**Evidence**
- No fetch timeout (`sitemap.mjs:78-88`).
- Pages are fetched sequentially (up to 500 per list, 4 lists).
- One file, no sitemap index.
- No `lastmod` for static pages, offices or short-stay; short-stay DTO has no `updatedAt`.
- `/ueber-uns` and `/fuer-anbieter` are missing.
- Thin tool pages (`/map`, `/price-estimate`) are listed.
- No `cache:"manual"`, so Netlify CDN caching of the edge response is probably not active (to confirm).

**Fix (S)**
- 5–10 s timeout per page and bounded concurrency.
- Keep the last good copy when the API fails.
- Add lastmod where a real content date exists.
- Add the missing static pages.
- Image entries for the main photo.

**Fix (M, later)**
- A dedicated `id+lastmod` keyset endpoint and a sitemap index, worthwhile at about 2,000 listings (not today, with 2 listings).

**Note:** `UpdatedAt` is noisy (BE-13). Add `ContentUpdatedAt` before trusting it as lastmod.

## E. Status codes and listing lifecycle

### BE-07 · P2 · Every hidden or removed state returns the same 404; there is no 410

Today vs recommended:

| State | API today | Recommended page response |
|---|---|---|
| Property available / reserved | 200 | 200, indexed, in sitemap |
| Property sold / rented | 200, indexable forever | 200 with a "sold/rented" banner and similar listings, kept indexed for about 90 days after `ClosedAt`, then noindex. Never in the sitemap. |
| Property unpublished / paused / archived / expired (grace) / owner banned | 404 | 404 (reversible states) |
| Property deleted (owner or system after grace) | 404 | **410** |
| Property taken down by admin | 404 | 404, or 410 if permanent |
| Short-stay published | 200, but not edge-covered | 200, in sitemap with lastmod |
| Short-stay unpublished / deleted | API 404, page 200 + JS noindex (soft 404) | 404 / 410 via the edge |
| Investment closed | 404 | Product decision: 200 + noindex, or 410 |
| Office active, plan expired | 200 | Align the page and sitemap rule (decision) |
| Office deleted | 404 | 410 |
| User banned | **200** (BE-09) | 404 |
| Any page, API down | 200 shell | 503 + `Retry-After` |

**Fix (M)**
- A state-only `GET /api/public-status/{kind}/{id}` → `live|closed|hidden|gone|unknown`, using `IgnoreQueryFilters` and returning no content.
- The edge maps it to 200/404/410 and extends coverage to `/short-stay/*` and `/investments/*`.

## F. Images, OG, mobile

### FE-11 · P3

**Evidence**
- `og-default.png` is 376 KB.
- The static OG block lacks width, height, alt and locale.
- Listing cards: alt text and srcset are OK.
- Live logo is a 50 KB PNG with no dimensions; fixed in MAIN (WebP).

**Fix (S)**
- Re-encode the default as a JPEG ≤ 150 KB.
- Add `og:image:width/height/alt` and `og:locale`.

### Mobile
- Viewport is correct.
- Responsive audits passed in earlier phases.
- Lighthouse CLS is ≈ 0.

## G. Rendering options (cost/benefit)

Stack facts:
- Angular 20.3 and ngx-translate.
- About 50 `window.`, 41 `localStorage`, 89 `document.` and 26 `navigator.` uses, with **zero** SSR guards.
- Capacitor, Leaflet, SignalR and Firebase in the dependency tree.
- Netlify edge functions already fetch the API for listings and offices.

| Option | What it fixes | Cost | Risk | Verdict |
|---|---|---|---|---|
| **D. Targeted fixes only** (FE-01/03/04, BE-01) | Google signals and soft-404 damage | S | Low | Do now |
| **C. Edge-rendered snapshot**: extend `social-crawler-meta` to inject the H1, price, location, description, specs, `<img alt>`, breadcrumb and JSON-LD for `/properties/:id`, `/offices/:slug`, `/short-stay/:id`, `/investments/:id` into the shell for **all** visitors; Angular replaces it on boot | Raw-HTML content for every crawler and preview; better user LCP | M | Low. Same HTML for everyone, so no cloaking. Fails open to today's shell. | **Recommended next** |
| **A. Build-time prerender** of about 20 static pages (`@angular/ssr`, prerender mode only) | Raw text for home, about, services, legal, pricing | M | Needs guards on the code those pages touch | After C |
| **B. Full SSR on Netlify Functions** | Everything | L | Highest: refactor, cold starts, function cost; goes down with the API | Defer |

---

## Tests that exist vs gaps (detail in 10)

**Exists**
- 116 edge tests.
- private-paths and security-headers tests.
- Unit specs for the meta, page-meta and structured-data services.

**Missing**
1. A transient API error never yields noindex.
2. Every public route sets title, description and canonical.
3. Sitemap static list ⟷ routes ⟷ private paths stay consistent.
4. Language a crawler renders.
5. Live smoke checks: robots, sitemap size, WhatsApp preview 200 with og:image, Googlebot 404 for a zero GUID.
6. Non-production `X-Robots-Tag`.
7. Lighthouse budget against the deployed site.
