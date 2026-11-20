# 07 — Implementation Roadmap (proposal; nothing starts without approval)

Rules for every change:
- A separate branch for each change.
- Small PRs with tests.
- Staging before production.
- A rollback plan for anything that affects behaviour.
- No production deploy without explicit approval.
- Respect the existing architecture (Clean Architecture + CQRS).
- No new tables unless proven necessary.
- No URL changes without redirects.
- All 4 languages and RTL/LTR preserved.

Effort scale: S ≈ under 1 day, M ≈ 2–5 days, L ≈ 1–3 weeks.
"Owner" = Naeem's manual steps.

## P0 — Critical (indexability)

| # | Item | Ref | Who | Effort | Cost | Risk | Rollback |
|---|---|---|---|---|---|---|---|
| P0-1 | Restore the production API on an always-on instance. Read the suspension reason in Render first. | BE-01 | Owner | S | ~$7/month (Render Starter) | Low | n/a |
| P0-2 | Deploy what is already merged: Migrator → Render API → `main`→`release` PR → Netlify Publish. Brings #272 (previews), #267 and the other pending merges live. | FE-05 | Owner | S | 15 Netlify credits | Medium (large pending batch, see owner to-do) | Netlify rollback to previous deploy |
| P0-3 | Crawler UAs default to Arabic when no `?lang` or stored choice exists. Add static `og:locale`. | FE-01 | Code (app) | S | 0 | Low | Revert PR |
| P0-4 | A transient API error never sets `noindex` (office page). The listing error state keeps a sensible title. | FE-03 | Code (app) | S | 0 | Low | Revert |
| P0-5 | Edge: search-engine UAs get 503 + `Retry-After` when the API returns 5xx or times out (only after P0-1). The sitemap keeps the last good copy or returns 503 when all sources fail. Add a timeout per fetch. | BE-01, FE-08 | Code (app edge) | S | 0 | Low-Med | Revert |
| P0-6 | Non-production noindex: `X-Robots-Tag` in the generated `_headers` for non-production contexts, plus `[context.branch-deploy]` on the staging build. | FE-09 | Code (app) | S | 0 | Low | Revert |
| P0-7 | Search Console (Domain property via DNS TXT) and Bing Webmaster Tools (import from GSC): verify, submit sitemap, URL-inspect `/`, 1 listing, 1 office. | — | Owner | S | 0 | None | n/a |

## P1 — High

| # | Item | Ref | Effort | Risk |
|---|---|---|---|---|
| P1-1 | **Edge-rendered snapshot** for `/properties/:id`, `/offices/:slug`, `/short-stay/:id`, `/investments/:id`: H1, price, location, description, specs, images with alt, breadcrumb and JSON-LD, injected inside `<app-root>` for all visitors and replaced by Angular on boot. Extend `social-crawler-meta` and reuse its tested fetch/escape code. | FE-02 | M | Low-Med (HTML injection must be escaped; fail open to the shell) |
| P1-2 | Real 301s in `_redirects` (`/agencies/*`, `/home`). noindex or canonical on `/reviews*`, `/services/join`. `/llms.txt` and other unknown files should 404. | FE-07 | S | Low |
| P1-3 | Lifecycle status: state-only public-status endpoint (API), edge maps to 404/410, coverage extended to short-stay and investments. Sold/rented 90-day rule. | BE-07 | M | Low |
| P1-4 | Structured data fixes and graph per 06: Organization `@id`/description/`sameAs`; listing `@graph` with valid placement; rent units; `imageUrls`; localised breadcrumbs; short-stay markup. | BE-04 | M | Low |
| P1-5 | Privacy before indexing grows: hide exact location by default for private owners; show display name instead of full name; drop `OwnerId` from lists; fix investment coordinates; banned users get 404. | BE-02, BE-03, BE-09 | M | Medium (behaviour change for owners; needs a decision) |
| P1-6 | API host: `X-Robots-Tag: noindex` header (production), robots `Disallow: /` on staging only. | BE-08 | S | Medium if mis-scoped |
| P1-7 | Rate limits: cached GETs before the limiter; higher quota for the edge-secret caller. | BE-05 | M | Medium |
| P1-8 | Crawlable pagination (`<a href>`), self canonical on paginated pages. | FE-04 | S | Low |
| P1-9 | Sitemap: missing static pages, real lastmod (`ContentUpdatedAt`), image entries, remove thin tool pages if decided, CDN caching. | FE-08, BE-06, BE-13 | S-M | Low |
| P1-10 | robots.txt: AI-crawler groups per decision D-07 (generated from private-paths), `/users/` crawlable with noindex. | 04 §3, FE-13 | S | Low |
| P1-11 | Build-time prerender of static pages (home, about, services, pricing, expats, legal, download): text in raw HTML. | Option A | M | Medium (SSR guards on touched code) |
| P1-12 | Performance quick wins: fingerprint or long-cache i18n, skip fallback-language download, single `/geo` call, Arabic font preload, re-encode OG image ≤ 150 KB. | FE-10, FE-11 | S each | Low |

## P2 — Growth (only after P0 and the P1 core)

- Place hubs (sale/rent × governorate/city), gated by ≥ 5 listings. Needs place slugs and a cached facets endpoint (BE-12). (M)
- Multilingual decision: `?lang` self-canonical + hreflang, or path prefixes. Read-only stored translations GET (BE-11). (M–L)
- Editorial content per 05 (founder plus reviewer time; lawyer budget).
- Entity work: social profiles, Crunchbase, About page (owner + S code).
- Digital PR per 05.
- Pretty slugs for listings `/properties/{id}/{slug}` with 301 (optional). (M)

## P3 — Continuous

- Monthly: Search Console and Bing review (indexing, queries, CTR), AI-citation run (09), content refresh.
- Quarterly: robots/AI-crawler policy review (AIPREF and Bing preferences in Q1 2027), Lighthouse run, sitemap and lifecycle audit.

## Recommended first implementation batch (if approved)

**One app PR**, no API change, one Netlify publish together with P0-2:
- P0-3
- P0-4
- P0-5
- P0-6
- P1-2
- P1-8
- P1-12 (i18n caching only)

**Then a second PR:** P1-1 (edge snapshot) together with P1-4 (structured data).

The API changes (P1-3, P1-5, P1-6, P1-7) come as a separate API PR and are deployed before the app.
