# 08 — Security, Privacy and Indexing Risks

SEO work increases exposure. Anything public becomes crawlable, cached and quotable by AI systems, sometimes long after it is deleted. This file lists what must be fixed or decided **before** we make listings more crawlable.

## 1. Privacy risks in public data (code on API master; not checked live, the API is down)

| ID | Risk | Evidence | Severity | Fix |
|---|---|---|---|---|
| BE-02 | Exact coordinates and street are public by default for every listing | `Property.cs:43` `HideExactLocation` defaults to false; `PropertyMapper.cs:35-45` | **P1** | Hide by default for private owners; approximate coordinates (grid snap already exists in map readers) |
| BE-02 | Owner full name and `OwnerId` in list and detail DTOs | `PropertyMapper.cs:111-114` | P1 | Display name / first name + initial; remove `OwnerId` from public lists |
| BE-02 | Client JSON-LD copies `streetAddress` | `property-structured-data.service.ts:101-104` | P1 | Never for private listings |
| BE-03 | Investment detail returns raw property coordinates, ignoring `HideExactLocation` | `InvestmentProjectRepository.cs:199-200` | P1 | Apply location privacy in the projection, with a test |
| BE-09 | Banned users' public profiles still return 200; deal counts include unpublished listings | `GetUserProfileQueryHandler.cs:45`; `PropertyRepository.cs:351-357` | P2 | 404 for banned users; count published closed deals only |
| BE-15 | Property reviews endpoint has no listing-visibility gate and shows reviewers' full names | `GetPropertyReviewsQueryHandler.cs:19-31` | P3 | Gate on visibility; display names |
| BE-16 | Internal fields in the public DTO (`ExpiresAt`, `FeaturedUntil`, `IsPublished`, `ViewCount`, `AgencyDto.OwnerUserId`) | `PropertyDto.cs` | P3 | Dedicated public DTO |
| Office | Unverified `LicenseNumber` exposed | `AgencyDto.cs:17-22` | P3 | Do not put it in markup; label it in the UI as declared by the office |

Sold or rented listings stay publicly viewable with no time limit (`Property.cs:553-559`). Indexing them keeps addresses and photos of occupied homes discoverable indefinitely. The proposal is 90 days, then noindex (02 §E).

## 2. Indexing hygiene

| Risk | Current | Action |
|---|---|---|
| Private pages indexed | robots Disallow on 33 paths; `X-Robots-Tag` on private paths (live) ✔ | Keep. Add new private routes to `private-paths.mjs` (tested). |
| Staging, preview and branch deploys indexed | robots `Disallow: /` and JS noindex for staging; **branch deploys build production config** | P0-6. Owner check of live staging robots (10). |
| API host indexed | No robots, no `X-Robots-Tag` | Header noindex on production; never `Disallow: /` on the production API (it would break Google rendering) |
| Swagger exposure | Off in production ✔; can be enabled by config on staging | Keep off. Staging noindex. |
| Soft 404s / infinite URL spaces | Unknown paths return 200; 24 query parameters canonicalize to `/properties` | P1-2, FE-04. Canonical and noindex rules (03 §4). |
| Unpublished-listing leakage via id enumeration | IDs are GUIDs; detail requires `PubliclyViewable`; a test enforces the anonymous allow-list ✔ | Keep the test. Add an edge test that a hidden listing is never rendered into the snapshot. |
| Transient errors de-indexing pages | Office page sets noindex on any error | P0-4 |
| `/users/` blocked by robots | Prevents Google from seeing noindex, so URL-only indexing is possible | Make crawlable plus noindex (or 404 for banned users) |
| User data reaching AI crawlers | Private routes need auth; Hudhud AI chat is behind the API | Never expose chat transcripts or account pages. Robots groups must repeat the private list (04 §3). |

## 3. Edge snapshot safety (for P1-1)

- Inject only fields the page already shows publicly. Use the same DTO and the same privacy rules.
- HTML-escape every value. The existing `lib/social-crawler.mjs` already has escaping; extend its tests.
- Serve the same HTML to all user agents. No cloaking.
- Fail open to today's shell on timeout. For search engines, return 503 only when the API is truly erroring (after P0-1).
- No secrets in edge code beyond the existing `X-HN-Edge-Secret` env var. Never in the frontend bundle.

## 4. Operational risks of SEO changes

| Change | Risk | Mitigation |
|---|---|---|
| 503 to crawlers on API errors | If cold starts remain, normal wake-ups return 503 and Google reduces its crawl rate | Only after an always-on instance; short `Retry-After` |
| robots changes | A typo can block the whole site | Generated from code; test asserts `Allow: /` plus the private list in production |
| Rate-limit changes | Abuse surface | Quota raise only for the edge secret or verified bots; keep per-IP limits for others |
| URL and slug changes | Lost equity, broken deep links (Android App Links) | 301 map, `deep-links.config.json` updated, App Links tested |
| Content statistics | Wrong or identifying numbers | Thresholds, methodology, aggregates only (05) |
