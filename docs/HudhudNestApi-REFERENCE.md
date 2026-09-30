# HudhudNestApi — Architectural Reference Document

> **Purpose:** Living reference for all future development sessions.
> **Last updated:** 2026-08-27 · Analysis **v9** — full re-verification from source (not
> carried from v8) against the live working repository at
> `C:\Users\naeem\Source\Repos\HudhudNestApi` (HEAD **`a151424`**, branch `master`)
> together with the Angular source at
> `C:\Users\naeem\OneDrive\Desktop\Notiz\HudhudNest\Wohnungsmieten` (HEAD **`e64daeb`**,
> branch `feat/listing-eligibility-gates`).
> **v9 is backed by fresh execution, not carried claims:** `dotnet build HudhudNestApi.sln
> -c Release` — 0 warnings, 0 errors, 35s. Five fast `dotnet test` projects —
> **Architecture 108/108, Application 278/278, Auth 280/280, Observability 9/9,
> Concurrency 4/4** — all green, run this session. `npm run typecheck`,
> `npm run audit:frontend`, and `npm run build:prod` all passed this session (bundle
> 597.55 kB raw, inside the 650 kB budget). `dotnet test` for `Integration.Tests`,
> `Performance.Tests`, and `StagingSmokeTests` need a live Postgres/staging environment
> not available this session — not run, named as such rather than carried forward.
> **Decision:** ⚠️ SUITABLE WITH ONE CRITICAL CONDITION — narrower than v8's list, but the
> remaining item is more severe than anything it replaces. See §10.
> **Companion documents:** `PROJECT-STRUCTURE.md` (the two repositories side by side) and
> **`BACKEND-ISSUES.md`** (every open defect, with evidence and a fix each — now v4).
> Defect detail lives there; this file states architecture and points at it.

---

## 0. Why v9 exists — read this before trusting anything below

v8 (2026-08-26, `3cadb4b`/`730af55`) documented 8 open defects, all mitigated-but-open.
One day and five merged PRs later (**[#80](../../../pull/80)**, **[#81](../../../pull/81)**,
**[#82](../../../pull/82)**, **[#83](../../../pull/83)**, **[#85](../../../pull/85)**) —
**all eight are closed**, verified by re-reading the code that closed each one, not by
trusting the merge commit messages alone (though those messages turned out to be accurate
in every case checked).

**What actually shipped, in order of how much it changes this document:**

- **Agency invitations replace direct membership.** `AddAgencyMemberCommandHandler` — the
  handler that let an owner attach any user id with zero consent — is **deleted**. A full
  `AgencyInvitation` state machine (Pending/Accepted/Declined/Expired) with advisory-lock
  concurrency and a DB-level partial unique index takes its place. §7.5, closes v8's B-2.
- **Listing quota now reads the selected plan.** `Plan.ListingLimit` (nullable = unlimited)
  is the single source of truth, replacing two competing constants
  (`ListingQuotaOptions.AgencyActiveListingLimit` and
  `ListingLifecyclePolicy.FreeTierActiveListingLimit`), both of which are **deleted**. A
  purchased plan now actually changes a real limit — v8's headline gap ("`/pricing` sells
  nothing real yet") is closed. §7.4, closes B-3.
- **Agency ownership transfer and logo upload are now callable.** Two domain methods that
  had unit tests but zero production callers (`Agency.TransferOwnership()`,
  `Agency.SetLogo()`) now have commands and controller actions. §7.5, closes B-4b.
- **Optimistic concurrency is complete.** `Transaction` and `UserAccount` now carry the
  same `xmin` mapping `Property` got in the previous cycle. §6.9, closes B-9b.
- **The rate-limit guard became a reflected invariant, not a fixed list.** Auditing every
  `[AllowAnonymous]` action against `[EnableRateLimiting]` surfaced ~15 endpoints with no
  limit at all (not just the one instance v8 knew about) — all fixed with a new
  `public-read` policy. §4, closes B-7.
- **CSRF is architecturally activated and integration-tested.** `CookieCsrf:Enabled=true`
  ships in the production `appsettings.json` baseline now, with three structural bugs
  found and fixed empirically via new integration tests. This is where v9 diverges sharply
  from a clean sweep: **closing this defect opened a new, more severe one.** §4.1, §10.
- **`SecurityAlertBackgroundService`'s missing lock is a documented decision, not a gap.**
  Investigated, found to be an in-process queue consumer (not a competing periodic
  sweeper), and pinned with a dedicated test so the exclusion can't silently regress.
  Closes B-6b — not by adding a lock, but by verifying one isn't needed.
- **Mojibake in three files' doc-comments is fixed.** Closes B-19.

**The one new finding this revision introduces, and it is the most severe item in this
document's history:** the CSRF activation above assumes a client sends `X-XSRF-TOKEN`.
Direct inspection of the live Angular repository (`e64daeb`) — zero matches for
`csrf`/`xsrf` anywhere in `src/`, both refresh-triggering code paths deliberately bypass
Angular's interceptor chain, and the CSRF cookie the API sets carries no shared `Domain`
— proves nothing does. On the current state of both repositories deployed together,
**every real browser session fails token refresh roughly every 30 minutes and is forced
to log out.** `BACKEND-ISSUES.md` **B-20**. This is not a theoretical exposure; it is a
predictable functional break, confirmed structurally across three independent code layers
in two repositories.

**Working rule, unchanged and repeatedly vindicated:** treat this document as accurate
only as of the commits named above. v4 held about seven weeks. v5 through v8 each held
one day or less. This session moved the tree again within the same day it started.
Re-verify before planning, every time.

---

## 1. Project Identity

| Attribute | Value | Verified |
|---|---|---|
| Product | HudhudNestApi / HudhudNest — Real estate SaaS API | — |
| Target market | Syrian market (primary, active development) · European roadmap (parallel) | — |
| Architecture | Modular Monolith (deliberate, not microservices) | ✅ |
| Backend | ASP.NET Core, Clean Architecture, CQRS/MediatR | ✅ |
| Target framework | **net8.0** — a `.NET 10` migration *plan* exists (`docs/operations/net10-migration-plan.md`) but is not executed | ✅ |
| Compiler settings | `Nullable=enable`, `ImplicitUsings=enable`, `LangVersion=latest`, `AnalysisLevel=latest`, `EnforceCodeStyleInBuild=true`, **`TreatWarningsAsErrors=false`** | ✅ |
| Database | PostgreSQL 16 + PostGIS (EF Core **8.0.30**, Npgsql **8.0.11**), Supabase · **32 migrations** (was 29 in v8) | ✅ |
| Auth | JWT + ASP.NET Identity + hashed Refresh Tokens (cookie-delivered) + Phone OTP + email confirmation | ✅ |
| Transactional email | Resend (HTTP API) · SMTP · Console — selected by `Email:Provider`; Console refused in Production | ✅ |
| CSRF | Middleware wired, **now `Enabled=true` in the production baseline** — but see §4.1: the paired frontend change never shipped. This is now the project's single most severe open item | ✅ |
| Real-time | SignalR + Redis backplane (`AddStackExchangeRedis`) | ✅ |
| Caching / Rate limiting | Redis — mandatory in Production (boot throws if unconfigured); 14 named rate-limit policies (was 14 in v8 too — the count is stable, but the *rule* that enforces coverage is not, see §4) | ✅ |
| Media | Cloudinary EU | — |
| Cloud | Supabase (Postgres) + Render evaluated for hosting; DSGVO-relevant | — |
| Deployment shape | Multi-instance behind a load balancer — the performance suite requires traffic on both instances | ✅ |
| CI/CD | GitHub Actions — `ci.yml` (build/test/coverage/secret-scan/repo-hygiene), `production-gate.yml`, plus dedicated observability/performance/redis/backup/rollback/supply-chain workflows | ✅ |
| Tests | 8 projects · **five fast projects re-run this session: 679/679 passing** (Architecture 108, Application 278, Auth 280, Observability 9, Concurrency 4). Integration/Performance/StagingSmokeTests need live infra, not run this session | ⚠️/✅ mixed, see per-row |
| **Frontend** | Angular **20.3.26** (resolved; `package.json` pins `^20.2.0`), standalone, hash routing, Capacitor 8, Tailwind v4 alongside SCSS — **see `FRONTEND-REFERENCE.md`** | ✅ |

---

## 2. Layer Structure (verified against the live tree)

```
HudhudNestApi.sln
├── HudhudNestApi                      API layer — 25 controllers (unchanged count from v8)
│   ├── Controllers/
│   ├── Configuration/                NEW this cycle — composition-root extraction (§2.1)
│   ├── Middleware/                   ExceptionHandlingMiddleware
│   ├── Security/
│   │   ├── Auth/                     RefreshTokenCookie — HttpOnly/Secure/SameSite=None
│   │   ├── Csrf/                     CookieCsrfOptions · Middleware · Extensions — now Enabled=true
│   │   ├── Headers/                  Security response headers
│   │   ├── RateLimiting/             RedisRateLimitPartitionKeyResolver
│   │   └── Staging/                  StagingTestSupportAuthorization
│   ├── Health/                       HealthEndpointExtensions — NEW, MapOperationalHealthEndpoints
│   └── Program.cs                    205 lines (was 713 before this cycle's split — §2.1)
│
├── HudhudNestApi.Application          No infrastructure deps
│   └── {Admin, Agencies, Listings, Plans, Users, Notifications, …}/
│       └── Commands · Queries · DTOs · Interfaces · Mapping
│
├── HudhudNestApi.Domain               Zero external deps
│   └── {Agencies, Listings, Plans, Users, Transactions, Notifications, Common}/
│
├── HudhudNestApi.Infrastructure
│   ├── Auth/Services/                Console · Twilio · Http SMS
│   ├── Identity/Services/            CachedSecurityStampValidator (IDistributedCache)
│   ├── Listings/                     ListingExpiryHostedService — Plan.ListingLimit-driven quota now (§7.4)
│   ├── Agencies/                     AgencyInvitationLock — NEW, advisory lock for the invitation flow (§7.5)
│   ├── Search/                       SavedSearchMatchHostedService
│   ├── Health/                       ProductionStartupValidator
│   ├── Persistence/                  AppDbContext · Configurations · Seeds ·
│   │                                  BackgroundJobLock / BackgroundJobLockKeys
│   ├── Repositories/                 14 repositories (incl. PlanRepository)
│   └── Migrations/                   32 migrations (was 29 in v8; +3 this cycle — §7)
│
├── tests/                           8 projects
│   ├── HudhudNestApi.Application.Tests          278/278 — RE-RUN this session
│   ├── HudhudNestApi.Architecture.Tests          108/108 — RE-RUN this session
│   ├── HudhudNestApi.Auth.Tests                  280/280 — RE-RUN this session
│   ├── HudhudNestApi.Concurrency.Tests           4/4 — RE-RUN this session
│   ├── HudhudNestApi.Integration.Tests           needs live Postgres — not run this session
│   ├── HudhudNestApi.Observability.Tests         9/9 — RE-RUN this session
│   ├── HudhudNestApi.Performance.Tests           needs live multi-instance deployment — not run
│   └── HudhudNestApi.StagingSmokeTests           needs live staging — not run
│
├── docs/                            architecture · development · observability ·
│                                    operations · performance · security · testing
├── ci/ · scripts/ · tools/          Migrator · DatabaseRecoveryVerifier · PerfDataGenerator
└── observability/ · performance/
```

**Architecture guard suites** (`tests/HudhudNestApi.Architecture.Tests/`):
`APIDependencyGuardTests` · `HttpClientLifetimeTests` · `MiddlewareOrderGuardTests` ·
`OptionsValidationGuardTests` · `PublicEndpointPolicyTests` · **`RateLimitingGuardTests`
— rewritten this cycle as a reflected invariant, not a fixed list (§4)** ·
`RedisRateLimitingGuardTests` · **`BackgroundJobLockExclusionTests` — NEW, pins the
deliberate `SecurityAlertBackgroundService` exclusion (§6.9)**. All 108 tests in this
project pass, re-verified this session.

### 2.1 `Program.cs` composition-root split — new this cycle, no behavior change

`Program.cs` had grown to 713 lines by absorbing every hardening pass in the project's
history. `HudhudNestApi/Configuration/` now holds seven extracted, focused files
(`CorsRegistration`, `DatabaseSeedingExtensions`, `JwtAuthenticationRegistration`,
`RateLimitingRegistration`, `RedisConnectionResolver`, `SignalRRegistration`,
`SwaggerRegistration`), joining the three that already existed there
(`ForwardedHeadersRegistration`, `OutputCacheRegistration`, `StagingEnvironmentGuard`).
`Program.cs` is now 205 lines and reads as an ordered list of named steps. **The
middleware pipeline itself stays inline and in its exact original order deliberately** —
`MiddlewareOrderGuardTests` pins the physical call order in this one file as the real
invariant, and collapsing it into a single call would make that test meaningless. Verified
this session: `dotnet build` clean, `MiddlewareOrderGuardTests` among the 108 Architecture
passes.

---

## 3. Controller CQRS Audit — RE-VERIFIED

**25 controllers**, unchanged count from v8. Grepping `HudhudNestApi/Controllers/*.cs` for
`AppDbContext` still returns **3 matches**, unchanged:

| Controller | Uses `AppDbContext` | Gating | Assessment |
|---|---|---|---|
| `OperationalController` | ✅ direct | `IsStaging()` **+** `StagingTestSupportAuthorization` secret compare | ✅ correctly gated |
| `StagingTestSupportController` | ✅ direct | `IsStaging()` **+** config flag **+** constant-time secret compare | ✅ correctly gated |
| `ObservabilitySyntheticController` | ✅ direct | `IsStaging()` + `Staging:TestSupport:Enabled` | ✅ correctly gated |
| **All 22 business controllers** | ❌ none | — | ✅ CQRS clean |

Business controllers: Admin, Agencies, Amenities, Analytics, Auth, Contact, Csrf, Enum,
Favorites, LocationSuggestions, Lookups, Messages, Notifications, PhoneAuth,
PhonePasswordAuth, Plans, Properties, PropertyImages, Reviews, SavedSearch, Users, Visits.

`GetPropertyStatsQueryHandler` remains the one documented `AppDbContext`-direct handler
for a 5-table aggregate — still not a precedent.

**`AgenciesController` grew this cycle** (§7.5): the flat member-add endpoint is gone,
replaced by `POST .../invitations`, `GET .../invitations/mine`,
`POST .../invitations/{id}/accept`, `POST .../invitations/{id}/decline`,
`POST .../transfer-ownership`, `POST .../logo`, and `DELETE .../members/{memberUserId}` —
11 actions total now, up from 7 in v8.

---

## 4. Program.cs Middleware & Security Capability Matrix — RE-VERIFIED

Middleware order (`Program.cs`, section 11), pinned by `MiddlewareOrderGuardTests`,
**unchanged in sequence from v8** (only its physical location moved, per §2.1):

```
UseForwardedHeaders → performance instrumentation → observability →
UseHsts / UseHttpsRedirection (non-dev) → ExceptionHandlingMiddleware →
SecurityHeaders → Swagger (non-prod) → UseStaticFiles → UseRouting →
UseCors → UseAuthentication → PhoneVerificationRestriction →
UseRedisRateLimiting / UseRateLimiter → UseCookieCsrfProtection →
UseAuthorization → UseOutputCache → MapOperationalHealthEndpoints → MapControllers →
MapHub("/notificationHub")
```

| Capability | Present | Evidence |
|---|---|---|
| `UseHsts()` / HTTPS enforcement | ✅ | `AddHsts`, `RequireHttpsMetadata = !IsDevelopment()` |
| Redis distributed rate limiting | ✅ | Boot throws in Production if Redis unconfigured |
| Rate limit coverage | ✅ **changed** | 14 named policies incl. new `public-read`; enforcement is now a reflected test over every `[AllowAnonymous]` action, not a fixed list — closes v8's B-7 |
| Refresh-token delivery | ✅ unchanged | `RefreshTokenCookie`: `HttpOnly`, `Secure`, `SameSite=None`, `Path=/api/auth` |
| **CSRF protection** | ⚠️ **activated, but its client half doesn't exist** | `CookieCsrf:Enabled = true` in `appsettings.json` (production baseline) now, three structural bugs fixed and integration-tested — but the Angular client sends no `X-XSRF-TOKEN` (verified: zero matches in its source). See §4.1 and `BACKEND-ISSUES.md` **B-20** |
| Background job coordination | ✅ **decision verified, not just applied** | 4 of 5 recurring jobs locked via `BackgroundJobLock`; the 5th (`SecurityAlertBackgroundService`) is a deliberately-excluded in-process queue consumer, now pinned by `BackgroundJobLockExclusionTests` |
| Optimistic concurrency | ✅ **complete now** | `xmin`/`IsRowVersion` on `Property`, `Transaction`, and `UserAccount` — all three configured entities; `DbUpdateConcurrencyException → 409` covers all three via one unchanged `ExceptionHandlingMiddleware` mapping |
| Listing quota enforcement | ✅ **now plan-driven** | `IListingQuotaPolicy` resolves the limit via `UserAccount.PlanId → Plan.ListingLimit`, not a config constant — closes B-3 |
| Listing eligibility gates | ✅ unchanged | Contact confirmation + explicit plan selection required before first listing |
| Agency membership | ✅ **changed** | Consent-based invitation state machine replaces direct attach — closes B-2 |
| JSON casing | ✅ unchanged | `PropertyNamingPolicy = JsonNamingPolicy.CamelCase` |
| Reference-data seeding at boot | ✅ | `SeedReferenceDataAsync` (now in `DatabaseSeedingExtensions.cs`), idempotent, failures logged not thrown |

### 4.1 CSRF: architecturally correct, integration-tested, and functionally broken end-to-end

This is the section that matters most in this revision. Read `BACKEND-ISSUES.md` **B-20**
for the full evidence chain; this is the summary.

**What the backend got right, verified by direct code reading and by five passing
integration test scenarios in `CookieCsrfProtectionIntegrationTests.cs`:** the activation
condition (`Enabled` **and** an unsafe method **and** the `refresh_token` cookie present)
is exactly correct; three empirically-discovered bugs (wrong `AuthenticationCookieName`
default, `SameSite=Strict` on the antiforgery cookie, the visible `XSRF-TOKEN` cookie
never actually carrying the request token) are fixed; a cross-site attacker genuinely
cannot forge the header. `AuthController.Refresh`/`Logout` carry no
`[IgnoreAntiforgeryToken]` exemption — confirmed by direct search, zero matches.

**What breaks it, verified by direct reading of the live Angular repository (`e64daeb`):**

1. **Zero references to CSRF anywhere in the frontend.** A case-insensitive search for
   `csrf|xsrf` across all of `src/`, excluding specs, returns nothing. `GET
   /api/security/csrf-token` is never called.
2. **Even if it were, the visible cookie isn't readable from the frontend's origin.**
   `CsrfController.GetCsrfToken` sets `XSRF-TOKEN` with no explicit `Domain` — it defaults
   to the API's own host. The frontend runs on a different origin
   (`Cors:AllowedOrigins` in `.env.example`: `https://localhost:4200` vs. the API on a
   different port even locally), so `document.cookie` on the Angular page never sees it.
3. **Even if it were readable, the two request-triggering code paths bypass Angular's
   interceptor chain by design.** Both `refresh-auth.interceptor.ts`'s
   `requestNewAccessToken()` and `app.config.ts`'s `restoreSession()` construct
   `new HttpClient(httpBackend)` directly on `HttpBackend` — explicitly to skip every
   registered interceptor (including Angular's own built-in XSRF interceptor, if it were
   even configured, which it also is not: `provideHttpClient` carries no
   `withXsrfConfiguration`).

**The consequence, not a possibility:** on any live deployment of both repositories at
their current state, every logged-in user's access token expires after 30 minutes
(`Jwt:AccessTokenMinutes`), the silent-refresh call it triggers is rejected with
`403 CSRF_VALIDATION_FAILED`, and the frontend's own error handling then force-logs-out
the user. This reproduces for every session, every ~30 minutes, with no attacker
involved — the protection is doing exactly what it was built to do, indiscriminately.

**Why CI didn't catch it:** `appsettings.Testing.json` disables `CookieCsrf` specifically
so the rest of the suite doesn't need to carry a token — meaning no automated test in
either repository exercises the real frontend against a backend with CSRF turned on.

**The fix, restated from B-20:** wire the two bypassing code paths in the frontend to
fetch and attach the token explicitly (Angular's default XSRF interceptor is not enough
by itself, precisely because those two paths skip the interceptor chain on purpose) — or,
as an immediate stopgap, set `CookieCsrf:Enabled=false` again until that ships, since
leaving it on today buys no realized security benefit (refresh is already broken, so the
attack it prevents is moot) at the cost of breaking every session.

---

## 5. What Works Correctly (Verified Strengths)

### 5.1 Security subsystems
Refresh tokens SHA-256 hashed with atomic rotation, cookie-delivered; OTP HMAC-SHA-256
with `CryptographicOperations.FixedTimeEquals` and attempt limits; full
`[EnableRateLimiting]` coverage on auth endpoints, now enforced by a reflected invariant
test rather than a fixed list (§4); real Twilio SMS with boot-time validation; encrypted
user fields via Data Protection; audit logging; security headers; deny-by-default
authorization `FallbackPolicy`; Apple identity tokens nonce-bound end to end.

### 5.2 PostGIS geo-search
Unchanged: GIST index + `ST_DWithin`, radius capped at 50 km, `COUNT(*) OVER()`
single-round-trip pagination, fully parameterized raw SQL.

### 5.3 Text search — `pg_trgm` GIN indexes in place
Unchanged.

### 5.4 Soft delete is genuinely universal
Unchanged: `HasQueryFilter(e => !e.IsDeleted)` is the norm; repository `Remove()` is
itself intercepted and converted.

### 5.5 Money paths refuse to grant what was not paid for
Unchanged — still the correct shape, still no payment gateway.

### 5.6 Listing eligibility and quota — now fully wired to a real Plan catalog
`CreatePropertyCommandHandler` enforces, in order, before opening any transaction: contact
confirmation, then explicit plan selection, then a quota check that now genuinely reads
`Plan.ListingLimit` through `UserAccount.PlanId` — closing the gap v8 called "the headline
condition:" a purchased plan changes an actual limit now, for both individual accounts and
agency-pooled quotas (the agency-wide limit comes from the **owner's** plan, deliberately,
so a member can't inflate the shared pool via their own personal plan choice).

### 5.7 Agency lifecycle is now complete: create, edit, deactivate, transfer, brand, staff
`Agency` supports creation, update, deactivation, ownership transfer (gated on the new
owner already being a consenting member), and logo upload — the only two domain methods
left uncalled in v8 (`TransferOwnership()`, `SetLogo()`) now have real callers. Membership
itself moved from unconsented direct-attach to a full invitation state machine.

### 5.8 Operational maturity
Unchanged — `docs/operations/` and `docs/observability/` carry SLOs, runbooks, a dated
recovery-drill evidence file, and dedicated test projects.

---

## 6. Key Decisions and Patterns (carried forward, unchanged unless noted)

### 6.1 Positional Records Rule
```csharp
// WRONG
var cmd = new MyCommand { PropertyId = x, Title = y };
// CORRECT
var cmd = new MyCommand(PropertyId: x, Title: y);
```

### 6.2 PowerShell compatibility (ALL scripts)
Never `&&`, `||`, `2>/dev/null`. Use `-and`, `-or`, `$null`, `$?`.

### 6.3 Cloudinary SDK layer rule
`CloudinaryDotNet` stays in Infrastructure only.

### 6.4 Supabase/Render deployment
`DATABASE_URL` with real credentials, `SSL Mode=Require`, **port 5432 (Session Mode)** —
not 6543/Transaction Mode, which breaks EF Core prepared statements. `MaxPoolSize=20`.

### 6.5 `IPropertyReadRepository` decoupling pattern
Still the correct approach for Bookings/Reviews needing read-only Property data.

### 6.6 New public endpoints must be registered twice, and now carry a rate limit by rule, not by habit
`[AllowAnonymous]` alone is not enough: `Program.cs` sets a deny-by-default
`FallbackPolicy`, and `PublicEndpointPolicyTests.ApprovedAnonymousEndpoints` must list the
action or the build fails. **As of this cycle, `RateLimitingGuardTests` enforces the
companion rule by reflection** — any new `[AllowAnonymous]` action without
`[EnableRateLimiting]` or a documented exemption fails the build automatically. Closes
B-7's underlying pattern, not just its one known instance.

### 6.7 Policy constants live in Domain, as constants — with one exception that got resolved this cycle
`ListingLifecyclePolicy` holds commercial terms as `const`/`static readonly`, deliberately
outside `IOptions`. **v8 flagged `ListingQuotaOptions` as a documented interim
exception** (config-driven, not a Domain constant) "until a `Plan`-driven limit exists."
That limit now exists — `ListingQuotaOptions` and the exception it represented are both
**deleted**. `IListingQuotaPolicy` now resolves through `Plan.ListingLimit`, itself a
Domain entity property, restoring the general rule without a live exception.

### 6.8 Identity writes cannot join a database transaction
Unchanged: commit the domain transaction first, then attempt the role write, log rather
than throw on failure.

### 6.9 Advisory locks are a settled pattern — now with a documented exclusion, not just examples
`pg_advisory_xact_lock` via the infrastructure primitives: `ListingQuotaLock`,
`BackgroundJobLock`, and **`AgencyInvitationLock` — new this cycle**, guarding
duplicate-invite/double-accept/decline races the same way the other two guard their own
resources. **`BackgroundJobLockExclusionTests` — new this cycle — pins the one
deliberate non-user of this pattern** (`SecurityAlertBackgroundService`, an in-process
queue consumer, not a cross-instance sweeper) so the exception can't silently regress or
be copied by mistake for a service that actually needs the lock.

### 6.10 Composition root: thin `Program.cs` + static extension methods — now the whole file, not just part of it
`HudhudNestApi/Configuration/` — new this cycle — extends the pattern
`HudhudNestApi.Infrastructure/DependencyInjection.cs` already established to the API
project's own startup concerns (CORS, JWT auth, rate limiting, Redis resolution, SignalR,
Swagger, DB seeding). §2.1.

---

## 7. Free-listing lifecycle, featured placement, agencies, and plans

### 7.1 Free-listing lifecycle — unchanged this cycle

**Policy — one source of truth:** `HudhudNestApi.Domain/Listings/ListingLifecyclePolicy.cs`

| Term | Value |
|---|---|
| Publication period (and the length one extension buys) | 90 days |
| Warning lead time | 7 days |
| Grace period after expiry, before deletion | 30 days |
| Free-tier active-listing limit | now resolved via `Plan.ListingLimit`, not a Domain constant — see §6.7/§7.4 |
| Single-listing extension fee | **$1.00 USD** |
| Featured placement period | **30 days** |
| Featured placement fee | **$5.00 USD** |

### 7.2 Featured placement — unchanged this cycle
`Property.MarkFeatured()` / `IsCurrentlyFeatured()` in
`Domain/Listings/Entities/Property.cs`; featured-first default ordering only; geo search
badges but never reorders.

### 7.3 Listing eligibility gates — unchanged this cycle
```
CreatePropertyCommandHandler.Handle
  ├─ EnsureContactConfirmedAsync   → 403 LISTING_CONTACT_NOT_CONFIRMED
  ├─ EnsurePlanSelected            → 403 LISTING_PLAN_REQUIRED
  └─ CreateWithQuotaEnforcedAsync  → transaction + advisory lock + Plan.ListingLimit check (§7.4)
```

### 7.4 Plans — now the actual source of truth for listing quota, still not a subscription system

| Piece | Location |
|---|---|
| `Plan` entity, incl. **`ListingLimit`** (nullable = unlimited) — new this cycle | `Domain/Plans/Entities/Plan.cs` |
| `GET /api/plans` (exposes `listingLimit` now) | `PlansController` → `GetPlansQueryHandler`, `[AllowAnonymous]` |
| `POST /api/users/me/plan` | `UsersController` → `SelectPlanCommandHandler`, `[Authorize]` |
| `IListingQuotaPolicy.GetActiveListingLimitAsync(UserAccount)` — resolves via `UserAccount.PlanId → Plan.ListingLimit` | `Infrastructure/Listings/ListingQuotaPolicy.cs` |
| Seed with backfilled limits (free=1, basic=50, premium=250, elite=unlimited) | `Persistence/Seeds/PlansSeed.cs` |

**What is still not built:** no billing, no payment gateway. Selecting a plan is a catalog
choice with a real, now-enforced effect on quota — it is not a purchase or a subscription
lifecycle.

**Agency semantics, clarified and covered by tests this cycle:** the pooled agency limit
comes from the agency **owner's** plan specifically, not whichever member is creating the
listing — `Agency` deliberately has no `PlanId` of its own. Missing/invalid plan states
(no plan selected, plan not found, agency owner with no plan, agency not found) fail
closed with a clear error, never an accidental unlimited quota.

### 7.5 Agencies — now a complete lifecycle: create, edit, deactivate, transfer, brand, and consent-based staffing

| Endpoint | Status |
|---|---|
| `GET /api/agencies/{slug}` | ✅ rate-limited (`agencies-public`) |
| `GET /api/agencies/me` | ✅ unchanged |
| `POST /api/agencies` | ✅ unchanged |
| `PUT /api/agencies/{agencyId}` | ✅ unchanged from v8 |
| `DELETE /api/agencies/{agencyId}` (deactivate) | ✅ unchanged from v8 |
| `POST /api/agencies/{agencyId}/transfer-ownership` | ✅ **new this cycle** — `[Authorize(Roles=AgencyOwner)]`, requires the new owner already be a consenting member |
| `POST /api/agencies/{agencyId}/logo` | ✅ **new this cycle** — Cloudinary upload, same convention as avatar upload |
| `POST /api/agencies/{agencyId}/invitations` | ✅ **new this cycle** — replaces the old direct-add endpoint entirely |
| `GET /api/agencies/invitations/mine` | ✅ **new this cycle** |
| `POST /api/agencies/invitations/{id}/accept` | ✅ **new this cycle** — the only path that ever grants membership |
| `POST /api/agencies/invitations/{id}/decline` | ✅ **new this cycle** |
| `DELETE /api/agencies/{agencyId}/members/{memberUserId}` | ✅ unchanged (member removal, distinct from invitation) |
| ~~`POST /api/agencies/{agencyId}/members`~~ | ❌ **removed this cycle** — no in-repo consumers; superseded by the invitation flow |

**Authorization rule to copy, unchanged:** the role gates the route, but every handler
still re-compares the caller to the target agency's `OwnerUserId`.

**Consent is now structural, not just a public-page mitigation.** v8's B-2 was mitigated
by hiding non-consenting members from the public page only; this cycle replaces the
underlying mechanism itself — membership is never granted except by the invited user
accepting, closing the gap at its root rather than its most visible symptom.

---

## 8. Money handling rules — do not relax these

Unchanged in substance:

### 8.1 There is still no payment gateway
`Plan` selection (§7.4) is a catalog choice with a real quota effect, not a purchase.
Every fee (extension, featured) is still recorded as a `Pending` `Transaction` with
`PaymentMethod = BankTransfer` and settled by a human.

### 8.2 The single seam that must stay admin-only
`RequestListingExtension`/`RequestFeaturedListing` record; `ConfirmListingExtensionPayment`/
`ConfirmFeaturedListingPayment` grant. Unchanged, unrelaxed. Both confirmation handlers are
now additionally protected against a double-confirm race by `Transaction`'s new `xmin`
token (§6.9/§4).

### 8.3 The platform receiver sentinel
`Transaction.ReceiverId = Guid.Empty` means "the platform" — unchanged.

---

## 9. Open defects — roll-up only

Full evidence, reproduction and fixes: **`BACKEND-ISSUES.md`** (now v4 — **all 8 of v8's
open items closed this cycle; 1 new item opened, and it is the most severe entry this
document has ever carried**).

| ID | Title | Severity | Status |
|---|---|---|---|
| B-20 | 🆕 CSRF is architecturally on, but no client sends the token — real sessions fail refresh/logout every ~30 min | 🔴 High | **Open — new this cycle** |
| ~~B-2, B-3, B-4b, B-6b, B-7, B-9b, B-18, B-19~~ | — | — | ✅ All closed this cycle — see `BACKEND-ISSUES.md` §2 for evidence per item |

---

## 10. Final Architectural Decision

### ⚠️ SUITABLE WITH ONE CRITICAL CONDITION

**Why not "Not Suitable":** the Clean Architecture skeleton is unchanged and still
enforced by 108 passing guard-suite assertions; the release build is clean (0 warnings,
re-verified this session); every mitigated defect from v8 is now genuinely closed with
fresh evidence, not carried claims; and the operational/security posture (agency
lifecycle, listing quota tied to a real plan, complete optimistic concurrency, a reflected
rate-limit invariant) is measurably more complete than any prior revision.

**Why not "Suitable":** one defect (B-20) is functionally worse for users than anything it
replaced. The previous CSRF condition (B-18, "off by default, a live consideration") was a
theoretical exposure requiring a specific attack. **What replaced it breaks the product for
every legitimate user, unconditionally, every ~30 minutes**, the moment both repositories
are deployed together as they currently stand. This is exactly the sequencing risk this
document's own history keeps naming — v7 warned it for B-13, B-18 restated the warning
when B-13 closed, and now B-20 is that same warning's consequence a second time: *"all
parts land together or the app breaks."* The backend part landed. The frontend part did
not.

**The conditions, current:**

1. **Fix B-20 or revert `CookieCsrf:Enabled` to `false`, before anything else.** This is
   not a "nice to have" — it is a live session-breaking regression on any deployment of
   the current state of both repositories.
2. ~~Coordinate the merge of `claude/session-37b499`~~ **Resolved** — `405e23e` is on `master`;
   `GET /api/enums/OwnershipType|FurnishingStatus|AreaUnit|RentalDurationType` return 200
   (verified locally and on production 2026-09-20). The empty dropdowns seen since were a
   frontend caching defect (a failed startup enum fetch was cached as empty), fixed in `EnumService`.
3. **Run the full `dotnet test`/`ng test` suites against live infrastructure** at the
   current commits — this document's fast-project numbers (679/679) are real and
   re-verified this session, but `Integration.Tests`, `Performance.Tests`, and
   `StagingSmokeTests` still need an environment this session did not have.
4. **Re-verify this document at the next significant deployment cycle.** Every revision
   but one has held one day or less; there is no reason to expect this one holds longer.

---

*This document reflects direct inspection of the live HudhudNestApi repository at commit
`a151424` and the live Angular source at `e64daeb`, on 2026-08-27, with `dotnet build`
(clean) and five `dotnet test` projects (679/679 passing) executed fresh this session, plus
a fresh frontend `typecheck`/`audit:frontend`/`build:prod` pass. Nothing in this revision
is carried forward from v8 without being re-checked against current source; where a claim
could not be re-verified this session (`Integration.Tests`, `Performance.Tests`,
`StagingSmokeTests`, and B-20's real-world operational impact specifically), it is named
as such rather than asserted. Frontend detail lives in `FRONTEND-REFERENCE.md`; the
repository layout lives in `PROJECT-STRUCTURE.md`; open defects live in
`BACKEND-ISSUES.md`.*
