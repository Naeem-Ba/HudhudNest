# 01 — Current State Audit and Measurement

Date: 2026-11-20. "LIVE" = what `hudhudnest.com` serves today (app `release` 4391f76, built 2026-11-16T20:15Z, per `/build-info.json`). "MAIN" = app `main` 47f7010 / API `master` 77e66262 (merged, not deployed).

## 1. Measurement sources: what was available

| Source | Status | Notes |
|---|---|---|
| Google Search Console | **Not available** | No access was given, and none is known to be verified. Owner action (11-decisions D-03). |
| Bing Webmaster Tools | **Not available** | Same. |
| Google Analytics / other analytics | Not checked | The app has a consent-gated measurement layer (Phase 21). No organic data was available to this audit. |
| PageSpeed Insights API | **Failed** | Anonymous quota exhausted (HTTP 429, shared key). |
| Lighthouse (local Chromium) | Done | Version 12.8.2, mobile, simulated throttling, one run per URL, API down. Lab data only. Raw JSON is in the project folder `seo-ai-visibility/evidence/`. |
| CrUX field data | Not available | It needs PSI or the CrUX API (quota/key). The site's traffic is likely below the CrUX threshold anyway. |
| Schema.org Validator / Rich Results Test | **Not run** | These are interactive Google tools and unreachable from this environment. JSON-LD was reviewed manually against schema.org (see 06). Owner action after deploy. |
| robots.txt / sitemap | Done (live curl) | Copies in `evidence/`. |
| Server / CDN logs | Not available | Netlify and Render logs are not accessible. Without them, crawler hits cannot be measured. |
| Real SERP checks | Partial | Done with a web-search tool (US-based, not a localized Google SERP), 2026-11-20. |
| Keyword volumes | **Not available** | No Keyword Planner, Trends, Ahrefs or Semrush. Every volume in 03 is marked *unverified*. |

No metric in this audit set is invented. Where a number appears, its source is stated.

## 2. Live evidence log (2026-11-20)

| Check | Result |
|---|---|
| `GET /` | 200, 19,034 B, `server: Netlify`, `cache-control: public,max-age=0,must-revalidate`, HSTS 1y, CSP **report-only** |
| `GET /properties`, `/offices`, `/services`, `/short-stay`, `/investments` | 200, the same 19,034 B shell |
| `GET /not-a-page-xyz` | **200** shell (soft 404) |
| `GET /llms.txt` | **200** shell (soft 404) |
| `GET /properties/00000000-0000-0000-0000-000000000000`, Chrome UA | 200 shell |
| Same URL, Googlebot UA | **200** shell. The edge function fails open because the API is down. |
| Same URL, WhatsApp UA | **502**, title "الإعلان غير متاح", `noindex` |
| `GET /offices/x-test`, WhatsApp UA | 200 shell. Edge fail-open. Rendered page: "Agency not found", `noindex, nofollow`. |
| `https://www.hudhudnest.com/` | 301 → `https://hudhudnest.com/` ✔ |
| `/wohnungen` | 301 → `/properties` ✔ |
| `http://hudhudnest.com/` | Not testable: the proxy allows only HTTPS. HSTS is present. |
| `robots.txt` | 200. `User-agent: *`, `Allow: /`, 33 private `Disallow`s, `Sitemap:` line ✔ |
| `sitemap.xml` | 200, `application/xml`, `max-age=3600`. **16 static URLs**, no listings or offices, no `lastmod`, no hreflang. |
| `/build-info.json` | production, branch `release`, commit 4391f76 |
| `/geo`, Googlebot UA | `{"country":"US"}` |
| `api.hudhudnest.com/health/live`, `/robots.txt`, `/swagger` | **503**, "Service Suspended", `x-render-routing: suspend` |
| `staging--hudhudnest.netlify.app`, `hudhudnest.netlify.app` | Not testable (proxy 403). Owner check in 10. |
| `/images/og-default.png` | 200, 376 KB PNG 1200×630. Likely too heavy for WhatsApp previews, which reportedly drop images above ~300 KB. |
| `/manifest.webmanifest` | served as `application/octet-stream` (minor) |

Raw HTML head (LIVE):
- `<html lang="ar" dir="rtl">` with a static Arabic title and description.
- og:type, og:site_name, og:title, og:description, og:image and twitter:card.
- No canonical, no og:url, no og:locale.
- Two JSON-LD blocks: `Organization` (name, alternateName, url, logo) and `WebSite` + `SearchAction`.
- Body text after stripping scripts: **0 words**.

## 3. Required measurement table

| Indicator | Current state | Problem | Priority |
|---|---|---|---|
| **Indexability** | Every URL returns 200 with an empty body. API suspended. Sitemap has 16 static URLs. | Listing and office content is not discoverable. Google gets 200 shells that render error states (soft 404). Non-JS crawlers see nothing. Unknown paths return 200. | **P0** |
| **Technical SEO** | robots.txt correct for private paths. www/legacy 301s work. HSTS. Private paths get `X-Robots-Tag`. | No real 404/410. Client-only redirects (`/agencies/*`, `/home`). Transient errors produce `noindex` on office pages. No timeout in the edge sitemap. Non-production protected only by robots plus a JS meta tag. | **P1** |
| **Structured Data** | Static Organization + WebSite. Listing, office and breadcrumb JSON-LD are injected by JS. | Invisible to non-JS crawlers. `address` on `RealEstateListing` is invalid. Rent price has no unit. Edge code reads `images` instead of `imageUrls`. Organization has no `sameAs`/`description`. SearchAction is obsolete. | **P1** |
| **Multilingual SEO** | 4 UI languages (ar/en/de/tr) on one URL. Language chosen by geo or device. `?lang=` only for one visit. | Googlebot (US) likely renders **English**. Canonical drops `?lang`. No hreflang. Only one language per URL can ever be indexed. Listing text exists only in the original language. | **P0** (crawler language) / **P1** (hreflang strategy) |
| **AI Search Visibility** | No raw-HTML content. No AI-crawler policy. `/llms.txt` returns a soft 404. No entity footprint on the web. | AI systems cannot read, cite or corroborate the brand. Name collides with other "HudHud" brands. | **P1** |
| **Page Performance** | Lab mobile: `/` 85 (LCP 3.3 s, TBT 280 ms, CLS 0.006). `/properties` 85 (LCP 3.4 s). | About 81% of LCP is render delay (CSR). 46 initial JS files (~174 KB gzip), only 10 preloaded. ar.json is 303 KB, not fingerprinted, `max-age=0`. `/geo` fetched twice. No font preload. | **P2** |
| **Content Quality** | Product pages only. No guides, no About content in raw HTML. 2 published listings in production. | Nothing original to rank or cite. Thin inventory. | **P2** (blocked by P0/P1) |
| **Internal Linking** | Listing cards are real `<a>` links. Home links the 6 latest listings. | Pagination is `<button>`. All filter states canonicalize to `/properties`. No city, type or office-area hubs. Deep listings reachable only through the sitemap. | **P1** |
| **Backlink Authority** | No external mentions found (search 2026-11-20). | No authority signals. The site links no official social profiles. | **P2** |

## 4. What already works (do not redo)

- **Robots:** generated from one source (`tools/lib/private-paths.mjs`), with a test. Production gets `Allow: /` plus private Disallows; non-production builds get `Disallow: /`.
- **Redirects:** www→apex 301, `/wohnungen*` 301 (QA Phase 20 fix live).
- **Static OG:** static description and OG in `index.html` (P20-D01 live). Social previews of home and generic pages are not blank.
- **Listing edge preview:** `social-crawler-meta` gives social crawlers a real listing card when the API is up. In MAIN it also has an 8 s timeout, 1200×630 Cloudinary images and more preview UAs (#272).
- **Office JSON-LD:** `RealEstateAgent` + `BreadcrumbList` (offices P5) is well designed. No address means no block; https-only `sameAs`; rating only when count > 0.
- **API controls:** Swagger is off in production, and a test enforces the anonymous-endpoint allow-list.
- **Area price statistics** (`AreaPriceStats`) are already robust: min sample 8, at least 3 owners, IQR outlier removal, USD.
- **Edge tests:** 116/116 pass on MAIN.

## 5. Baseline to record once the API is restored

Owner and lead, once Search Console is verified:
- Indexed pages (Pages report).
- URL Inspection on `/`, one listing and one office, recording the rendered language and screenshot.
- Impressions, clicks, CTR and position for 28 days.
- Bing equivalents.
- One AI-citation run (protocol in 09).

These become the "before" values. Targets are set only after this baseline (see 09).
