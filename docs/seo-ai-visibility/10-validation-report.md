# 10 — Validation Report (what was verified, how, and what was not)

Date: 2026-11-20. Environment: cloud container, curl through a proxy that allowed `hudhudnest.com`, `www.hudhudnest.com` and `api.hudhudnest.com` (HTTPS only); headless Chromium (Playwright); Lighthouse 12.8.2. No credentials used. No production data read or written.

## 1. Verified live (reproducible commands)

```bash
# Build actually served
curl -s https://hudhudnest.com/build-info.json          # release 4391f76, 2026-11-16T20:15Z
# API state
curl -sI https://api.hudhudnest.com/health/live         # 503, x-render-routing: suspend
# Shell for every path (same size => CSR)
for p in / /properties /offices /not-a-page-xyz /llms.txt; do
  curl -s -o /dev/null -w "$p %{http_code} %{size_download}\n" https://hudhudnest.com$p; done
# Crawler vs preview behaviour on a missing listing
curl -s -o /dev/null -w "%{http_code}\n" -A "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" \
  https://hudhudnest.com/properties/00000000-0000-0000-0000-000000000000   # 200 today (fail-open), target 404
curl -s -o /dev/null -w "%{http_code}\n" -A "WhatsApp/2.23" \
  https://hudhudnest.com/properties/00000000-0000-0000-0000-000000000000   # 502 today
# Robots, sitemap, redirects
curl -s https://hudhudnest.com/robots.txt
curl -s https://hudhudnest.com/sitemap.xml | grep -c "<loc>"                # 16
curl -sI https://www.hudhudnest.com/ | grep -i location                      # https://hudhudnest.com/
curl -sI https://hudhudnest.com/wohnungen | grep -i location                 # /properties
curl -s -A Googlebot https://hudhudnest.com/geo                              # {"country":"US"}
```

| Check | Result | Pass/Fail |
|---|---|---|
| Production domain serves production build (`environment: production`, branch `release`) | Yes | PASS |
| API reachable | 503 suspended | **FAIL (P0)** |
| robots.txt allows public pages and blocks private paths | Yes | PASS |
| robots.txt does not block Googlebot or Bingbot | Yes (no UA-specific blocks) | PASS |
| Sitemap valid XML, correct host | Yes | PASS |
| Sitemap contains listings and offices | No (API down) | **FAIL** |
| www→apex 301, legacy `/wohnungen` 301 | Yes | PASS |
| Unknown URL returns 404 | 200 | **FAIL** (soft 404) |
| Missing listing returns 404 to Googlebot | 200 (fail-open while API down) | **FAIL** (MAIN code returns 404 when the API answers 404, not re-testable now) |
| Raw HTML contains page content | 0 words of body text | **FAIL** (CSR) |
| Static title, description, OG in raw HTML | Yes | PASS |
| Canonical in raw HTML | No (set by JS) | FAIL for non-JS crawlers |
| Hreflang | None | FAIL (decision pending) |
| Organization / WebSite JSON-LD present | Yes; minimal | PARTIAL |
| No staging references in public HTML | `apiUrl` in build-info is production; CSP lists `*.onrender.com` (connect-src, harmless) | PASS |
| HTTPS + HSTS | HSTS max-age 1y | PASS (http→https not testable here) |
| CORS errors on public data | Not testable (API down) | NOT VERIFIED |

## 2. Rendered checks (Playwright, Googlebot UA)

- With locale en-US, `/` rendered `lang="en"` with an English title and H1. With locale ar-SY it rendered Arabic. This is the basis of FE-01. Google's actual WRS locale is undocumented, so confirm with URL Inspection.
- `/offices/<slug>` rendered "Agency not found / Couldn't reach the server" with `noindex, nofollow` while the API was down (FE-03).
- `/properties/<id>` rendered an error state with the home title and no canonical (FE-03).

## 3. Lighthouse (lab, mobile, simulated throttling, single run, API down)

| URL | Perf | LCP | FCP | TBT | CLS | SI | Transfer |
|---|---|---|---|---|---|---|---|
| `/` | 85 | 3.3 s | 1.8 s | 280 ms | 0.006 | 2.7 s | 557 KiB / 80 req |
| `/properties` | 85 | 3.4 s | 1.9 s | 240 ms | 0 | 2.8 s | 592 KiB / 93 req |

- The LCP element was a text H1, with render delay at about 81% of LCP.
- Lighthouse SEO score was 100. That is **misleading**: it audits the JS-rendered DOM, not what non-JS crawlers see.
- Raw JSON: project folder `seo-ai-visibility/evidence/lh-home.json` and `lh-properties.json`.
- These are not field (CrUX) data.

## 4. Code-level checks

- Edge function tests: **116/116 pass** on MAIN (`node --test` on `netlify/edge-functions/lib/*.test.mjs`).
- Structured data reviewed manually against schema.org. Issues listed in 06.
- API public-endpoint allow-list is enforced by `PublicEndpointPolicyTests.cs`. Swagger is disabled in production (`Program.cs:298-300`).

## 5. Not verified (and why); owner actions

| Item | Why not | How the owner verifies |
|---|---|---|
| Staging and preview noindex | Proxy blocked `*.netlify.app` | `curl https://staging--hudhudnest.netlify.app/robots.txt` should show `Disallow: /`; also run `curl -sI` on a branch deploy |
| Indexing state and rendered language in Google | No GSC | GSC URL Inspection → Test live URL on `/` (screenshot language) |
| Rich Results / Schema validator | Interactive tools | Run on home, 1 listing, 1 office after deploy |
| Field CWV | PSI quota exhausted; low traffic | PageSpeed Insights web UI |
| CORS from production origin | API down | Open the site after restore, check console for CORS errors |
| Listing and office pages with real data | API down; 2 listings | Re-run the curl matrix and Playwright after P0-1/P0-2 |
| MAIN bundle size | No `node_modules` in the audit run | `npm ci && npm run build:prod` (the CI budget gate already enforces 600/700 kB) |

## 6. Automated tests proposed (implementation phase)

1. **Edge:** a transient API error (5xx, timeout) never yields `noindex`; search-engine UA gets 503 with `Retry-After`; social UA gets the generic card.
2. **Edge:** the snapshot JSON-LD parses, contains required fields, and contains **no** geo or street for private listings and no rating without reviews.
3. **Edge:** the snapshot never renders a listing the API reports as hidden.
4. **App:** every public route in `app.routes.ts` sets title, description and canonical (route-table driven spec).
5. **Tools:** sitemap static list ⊆ public routes; disjoint from `private-paths`; robots groups repeat the private list for every named UA.
6. **Tools:** a non-production build emits `X-Robots-Tag: noindex` and `Disallow: /`; production emits neither.
7. **App:** a crawler UA with no stored choice resolves to `ar`.
8. **Live smoke** (extend `tools/check-live-environment.mjs`, manual or scheduled):
   - robots has `Allow: /`
   - sitemap ≥ N URLs and contains `/properties/`
   - WhatsApp UA on a real listing returns 200 with `og:image`
   - Googlebot UA on the zero GUID returns 404
   - unknown path returns 404 (after the fix)
   - `/llms.txt` returns 404 or the real file
9. **Optional:** Lighthouse CI budget on `/` and `/properties` against the deployed site.
