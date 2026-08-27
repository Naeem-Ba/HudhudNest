# PropertyApi — Architectural Reference Document

> **Purpose:** Living reference for all future development sessions.
> **Last updated:** 2026-08-26 · Analysis **v8** — re-verified against the live working
> repository at `C:\Users\naeem\Source\Repos\PropertyApi` (HEAD **`3cadb4b`**, branch
> `master`) together with the Angular source at
> `C:\Users\naeem\OneDrive\Desktop\Notiz\WohnungsApp\Wohnungsmieten` (HEAD **`730af55`**,
> branch `feat/listing-eligibility-gates`).
> **v8 is backed by execution again:** `dotnet build PropertyApi.sln -c Release` was run
> this session (0 warnings, 0 errors, 59s) and `npm run audit:frontend` was run this
> session (passes). The full `dotnet test`/`ng test` suites and a live email-link click
> were **not** re-run this session — see §0 for exactly what that means for this
> revision's confidence.
> **Decision:** ⚠️ SUITABLE WITH CONDITIONS — fewer and lower-severity than v7. See §12.
> **Companion documents:** `PROJECT-STRUCTURE.md` (the two repositories side by side) and
> **`BACKEND-ISSUES.md`** (every open defect, with evidence and a fix each — now v3).
> Defect detail lives there; this file states architecture and points at it.

---

## 0. Why v8 exists — read this before trusting anything below

v7 (2026-08-25, `293a5c1`/`3d81d37`) documented 17 open defects and one architectural gap
(no `Subscription`/`Plan` entity at all). One development session later — two backend
commits (`c9345de`, `51c9e30`, merged as [PR #78](../../../pull/78) and
[PR #79](../../../pull/79)) and two matching frontend commits (`eec9f32`, `730af55`) —
**ten of those seventeen items are closed**, three are partially mitigated, and one new
architectural piece exists that v7 explicitly said did not: a real `Plan` catalog.

**What actually shipped, in order of how much it changes this document:**

- **Plans (partial).** `Plan` entity, `GET /api/plans`, `POST /api/users/me/plan`. This is
  *not* the `Subscription` entity v7 said was "deliberately deferred as a product
  decision" — it is a lighter, deliberately smaller thing: a catalog and an explicit
  per-user selection, with **no** billing, **no** payment gateway, and — this is the part
  worth remembering — **no wiring yet from the selected plan to the listing quota**. §7.4.
- **Listing eligibility gates.** Every account, every role, must now confirm a contact
  method (email or phone) and select a plan (free counts) before creating its first
  listing — `403 LISTING_CONTACT_NOT_CONFIRMED` / `403 LISTING_PLAN_REQUIRED`. Mirrored on
  the frontend by `ListingEligibilityGuard`, which does not replace the backend check —
  it only makes the 403 rare. §7.3.
- **Agency quota, job locking, optimistic concurrency, cookie refresh — all landed
  together in one commit** (`c9345de`). Four of six hosted services now take an advisory
  Postgres lock before running; `Property` carries an `xmin` concurrency token; the
  refresh token moved from the JSON body to an `HttpOnly`/`Secure`/`SameSite=None` cookie
  on **both** repositories. §4, §8.
- **A new finding this revision introduces, not carried from v7:** moving the refresh
  token into a `SameSite=None` cookie means `POST /api/auth/refresh` and
  `POST /api/auth/logout` now read a cross-site-sent credential while
  `CookieCsrfOptions.Enabled` is still `false` by default. This is **not** the same defect
  as the one just closed — it is what closing it opened. `BACKEND-ISSUES.md` **B-18**.
- **The 500 kB bundle-budget figure repeated in v5–v7 was wrong against the code that has
  always been there.** `angular.json`'s actual `production` budget is
  `maximumWarning: 650kB` / `maximumError: 1MB`. The measured initial bundle this
  session — **596.90 kB raw / 159.10 kB transfer** — is *inside* that budget and the build
  emits no warning. Whoever wrote "500 kB, exceeded by 95 kB" was reading a number that
  does not appear in this repository's `angular.json`. This is corrected here because it
  is exactly the kind of stale-claim-copied-forward this document exists to prevent.

**What this revision did *not* re-verify, stated plainly rather than carried forward
silently:** the full `dotnet test` run (588 cases at the last commit that ran it,
`293a5c1` — one commit before the changes described above), `ng test` (54 cases, 2 known
failing as of `3d81d37`), and an actual click on a delivered confirmation-email link
(B-14's closure is read from source, not from a real inbox). Treat those three numbers as
**carried, not re-measured**, until the next session runs them.

**Working rule, unchanged and repeatedly vindicated:** treat this document as accurate
only as of the commits named above. v4 held about seven weeks. v5, v6, and v7 each held
one day. This session moved the tree again within the same day it started. Re-verify
before planning, every time.

---

## 1. Project Identity

| Attribute | Value | Verified |
|---|---|---|
| Product | PropertyApi / Bizorealestateworld — Real estate SaaS API | — |
| Target market | European (primary) · Syrian (parallel roadmap) | — |
| Architecture | Modular Monolith (deliberate, not microservices) | ✅ |
| Backend | ASP.NET Core, Clean Architecture, CQRS/MediatR | ✅ |
| Target framework | **net8.0** — a `.NET 10` migration *plan* exists (`docs/operations/net10-migration-plan.md`) but is not executed | ✅ |
| Compiler settings | `Nullable=enable`, `ImplicitUsings=enable`, `EnforceCodeStyleInBuild=true`, **`TreatWarningsAsErrors=false`** | ✅ |
| Database | PostgreSQL 16 + PostGIS (EF Core 8.0.30, Npgsql 8.0.11), Supabase · **29 migrations** | ✅ |
| Auth | JWT + ASP.NET Identity + hashed Refresh Tokens (now cookie-delivered) + Phone OTP + email confirmation | ✅ |
| Transactional email | Resend (HTTP API) · SMTP · Console — selected by `Email:Provider`; Console refused in Production | ✅ |
| CSRF | Middleware wired, **disabled by default** — now a live consideration, not a settled non-issue; see §4.1 and `BACKEND-ISSUES.md` B-18 | ✅ |
| Real-time | SignalR + Redis backplane (`AddStackExchangeRedis`) | ✅ |
| Caching / Rate limiting | Redis — mandatory in Production (boot throws if unconfigured) | ✅ |
| Media | Cloudinary EU | — |
| Cloud | Supabase (Postgres) + Render evaluated for hosting; DSGVO-relevant | — |
| Deployment shape | Multi-instance behind a load balancer — the performance suite requires traffic on both instances | ✅ |
| CI/CD | GitHub Actions — `ci.yml` (build/test/coverage), `secret-scan` (Gitleaks), `production-gate.yml`, plus dedicated observability/performance/redis/backup/rollback/supply-chain workflows | ✅ |
| Tests | 8 projects · 111+ test files — **counts below are carried from the `293a5c1` run, not re-executed this session** | ⚠️ |
| **Frontend** | Angular 20.2, standalone, hash routing, Capacitor 8, Tailwind v4 alongside SCSS — **see `FRONTEND-REFERENCE.md`** | ✅ |

---

## 2. Layer Structure (verified against the live tree)

```
PropertyApi.sln
├── PropertyApi                      API layer — 25 controllers (was 24 in v7; +PlansController)
│   ├── Controllers/
│   ├── Middleware/                  ExceptionHandlingMiddleware
│   ├── Security/
│   │   ├── Auth/                    RefreshTokenCookie — NEW, HttpOnly/Secure/SameSite=None
│   │   ├── Csrf/                    CookieCsrfOptions · Middleware · Extensions
│   │   ├── Headers/                 Security response headers
│   │   ├── RateLimiting/            RedisRateLimitPartitionKeyResolver
│   │   └── Staging/                 StagingTestSupportAuthorization
│   └── Program.cs
│
├── PropertyApi.Application          No infrastructure deps
│   └── {Admin, Agencies, Listings, Plans, Users, Notifications, …}/
│       └── Commands · Queries · DTOs · Interfaces · Mapping
│
├── PropertyApi.Domain               Zero external deps
│   └── {Agencies, Listings, Plans, Users, Transactions, Notifications, Common}/
│
├── PropertyApi.Infrastructure
│   ├── Auth/Services/               Console · Twilio · Http SMS
│   ├── Identity/Services/           CachedSecurityStampValidator (IDistributedCache)
│   ├── Listings/                    ListingExpiryHostedService · ListingQuotaPolicy — NEW
│   ├── Search/                      SavedSearchMatchHostedService
│   ├── Health/                      ProductionStartupValidator
│   ├── Persistence/                 AppDbContext · Configurations · Seeds ·
│   │                                 BackgroundJobLock / BackgroundJobLockKeys — NEW
│   ├── Repositories/                14 repositories (incl. PlanRepository — NEW)
│   └── Migrations/                  29 migrations
│
├── tests/                           8 projects (counts carried from `293a5c1`, not
│   │                                 re-executed this session)
│   ├── PropertyApi.Application.Tests
│   ├── PropertyApi.Architecture.Tests    — 7 guard suites
│   ├── PropertyApi.Auth.Tests
│   ├── PropertyApi.Concurrency.Tests
│   ├── PropertyApi.Integration.Tests
│   ├── PropertyApi.Observability.Tests
│   ├── PropertyApi.Performance.Tests
│   └── PropertyApi.StagingSmokeTests
│
├── docs/                            architecture · development · observability ·
│                                    operations · performance · security · testing
├── ci/ · scripts/ · tools/          Migrator · DatabaseRecoveryVerifier · PerfDataGenerator
└── observability/ · performance/
```

**Architecture guard suites** (`tests/PropertyApi.Architecture.Tests/Api/`):
`APIDependencyGuardTests` · `HttpClientLifetimeTests` · `MiddlewareOrderGuardTests` ·
`OptionsValidationGuardTests` · `PublicEndpointPolicyTests` · `RateLimitingGuardTests` ·
`RedisRateLimitingGuardTests`.

> ⚠️ Two of those guards are **allowlists, not invariants** — see **B-7** in
> `BACKEND-ISSUES.md`. The one concrete gap it found (`agencies-public` with no rate
> limit) is now fixed; the pattern that let it happen is not.

---

## 3. Controller CQRS Audit — RE-VERIFIED

**25 controllers** (v7: 24; new: `PlansController`). Grepping
`PropertyApi/Controllers/*.cs` for `AppDbContext` still returns **3 matches**, unchanged
from v7:

| Controller | Uses `AppDbContext` | Gating | Assessment |
|---|---|---|---|
| `OperationalController` | ✅ direct | `IsStaging()` **+** `StagingTestSupportAuthorization` secret compare — **tightened this cycle**, see §7.5 | ✅ correctly gated |
| `StagingTestSupportController` | ✅ direct | `IsStaging()` **+** config flag **+** constant-time secret compare | ✅ correctly gated |
| `ObservabilitySyntheticController` | ✅ direct | `IsStaging()` + `Staging:TestSupport:Enabled` | ✅ correctly gated |
| **All 22 business controllers** | ❌ none | — | ✅ CQRS clean |

Business controllers: Admin, Agencies, Amenities, Analytics, Auth, Contact, Csrf, Enum,
Favorites, LocationSuggestions, Lookups, Messages, Notifications, PhoneAuth,
PhonePasswordAuth, **Plans**, Properties, PropertyImages, Reviews, SavedSearch, Users,
Visits.

`GetPropertyStatsQueryHandler` remains the one documented `AppDbContext`-direct handler
for a 5-table aggregate — still not a precedent.

---

## 4. Program.cs Middleware & Security Capability Matrix — RE-VERIFIED

Middleware order (`Program.cs`, section 11), pinned by `MiddlewareOrderGuardTests`,
**unchanged from v7**:

```
UseForwardedHeaders → performance instrumentation → observability →
UseHsts / UseHttpsRedirection (non-dev) → ExceptionHandlingMiddleware →
SecurityHeaders → Swagger (non-prod) → UseStaticFiles → UseRouting →
UseCors → UseAuthentication → PhoneVerificationRestriction →
UseRedisRateLimiting / UseRateLimiter → UseCookieCsrfProtection →
UseAuthorization → UseOutputCache → MapControllers → MapHub("/notificationHub")
```

| Capability | Present | Evidence |
|---|---|---|
| `UseHsts()` / HTTPS enforcement | ✅ | `AddHsts`, `RequireHttpsMetadata = !IsDevelopment()` |
| Redis distributed rate limiting | ✅ | Boot throws in Production if Redis unconfigured |
| Rate limit coverage | ⚠️ opt-in only | 15 named policies (was 14 — `agencies-public` fix added one gap-closer, not a new gap), no global limiter — B-7 |
| **Refresh-token delivery** | ✅ **changed** | `RefreshTokenCookie`: `HttpOnly`, `Secure`, `SameSite=None`, `Path=/api/auth`. No longer returned in the JSON body path clients are expected to read from |
| **CSRF protection** | ⚠️ **wired, OFF, and now touches a live cross-site cookie** | `CookieCsrfOptions.Enabled = false` by default; the refresh/logout endpoints now satisfy the middleware's third activation condition ("an auth cookie is present") that used to be false. See §4.1 and B-18 |
| **Background job coordination** | ⚠️ **4 of 5 recurring jobs now locked** | `BackgroundJobLock` (Postgres advisory lock) used by `ListingExpiryHostedService`, `SavedSearchMatchHostedService`, `OtpCleanupHostedService`, `PhoneVerificationHostedService`. `SecurityAlertBackgroundService` is not — B-6b |
| **Optimistic concurrency** | ⚠️ **`Property` only** | `xmin` row-version token added via `20260826073614_AddPropertyXminConcurrencyToken`. `Transaction`, `UserAccount` still have none — B-9b |
| **Listing quota enforcement** | ✅ **new** | Advisory-locked, transaction-scoped, keyed by agency (if any) or owner — no longer a read-then-write race (closes B-10) |
| **Listing eligibility gates** | ✅ **new** | Contact confirmation + explicit plan selection required before first listing, for every role, checked before the quota transaction opens |
| JSON casing | ✅ **changed** | `PropertyNamingPolicy = JsonNamingPolicy.CamelCase` (`Program.cs:317`) — **no longer `null`/PascalCase**. Every success and error body is camelCase now (closes B-11) |
| Reference-data seeding at boot | ✅ | `DatabaseSeeder.SeedAsync`, idempotent, failures logged not thrown |

### 4.1 CSRF: the state changed underneath an old, correct conclusion

v7 called "CSRF off" correct because the API authenticated with `Authorization: Bearer`
only and carried no cookie a browser would send ambiently. **That premise is no longer
true.** `POST /api/auth/refresh` and `POST /api/auth/logout` now read/clear a
`SameSite=None` cookie that *is* sent ambiently, cross-site, by design (it has to be —
the Angular app and this API are different origins even in local development).

The Angular client still sends **no** `X-XSRF-TOKEN` header (verified this session: zero
matches for `csrf|xsrf` across the frontend source, excluding specs).

**Concretely:** a hidden cross-site form can trigger `POST /api/auth/refresh` or
`POST /api/auth/logout` with the victim's cookie attached; CORS still blocks the attacker
page from *reading* the JSON response, so token theft is not the exposure — forced
rotation/logout is. See `BACKEND-ISSUES.md` **B-18** for the full analysis and the fix
(the same three-part change v7 already specified for closing B-13, applied together).

---

## 5. What Works Correctly (Verified Strengths)

### 5.1 Security subsystems
Refresh tokens SHA-256 hashed with atomic rotation, **now cookie-delivered**; OTP
HMAC-SHA-256 with `CryptographicOperations.FixedTimeEquals` and attempt limits; full
`[EnableRateLimiting]` coverage on auth endpoints; real Twilio SMS with boot-time
validation; encrypted user fields via Data Protection; audit logging; security headers;
deny-by-default authorization `FallbackPolicy`; **Apple identity tokens are now
nonce-bound end to end** (frontend generates and sends it, backend hashes and compares —
closes v7's B-16).

### 5.2 PostGIS geo-search
Unchanged from v7: GIST index + `ST_DWithin`, radius capped at 50 km,
`COUNT(*) OVER()` single-round-trip pagination, fully parameterized raw SQL.

### 5.3 Text search — `pg_trgm` GIN indexes in place
Unchanged from v7.

### 5.4 Soft delete is genuinely universal
Unchanged from v7: `HasQueryFilter(e => !e.IsDeleted)` is the norm; repository `Remove()`
is itself intercepted and converted.

### 5.5 Money paths refuse to grant what was not paid for
Unchanged from v7 — still the correct shape, still no payment gateway.

### 5.6 Listing eligibility — new in this cycle
`CreatePropertyCommandHandler` now enforces, in order, before opening any transaction:
contact confirmation (email **or** phone), then an explicit plan selection (including
"free" — never an implicit default). Both are cheap checks placed before the advisory
lock so a request that is going to be rejected never takes it. The frontend mirrors this
with `ListingEligibilityGuard` at the route level, explicitly documented in its own
source as *not* the source of truth — the 403 from the handler still is.

### 5.7 Operational maturity
Unchanged from v7 — `docs/operations/` and `docs/observability/` carry SLOs, runbooks, a
dated recovery-drill evidence file, and dedicated test projects.

---

## 6. Key Decisions and Patterns (carried forward, unchanged)

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

### 6.6 New public endpoints must be registered twice
`[AllowAnonymous]` alone is not enough: `Program.cs` sets a deny-by-default
`FallbackPolicy`, and `PublicEndpointPolicyTests.ApprovedAnonymousEndpoints` must list the
action or the build fails. It still does not force a rate limit — B-7.

### 6.7 Policy constants live in Domain, as constants
`ListingLifecyclePolicy` holds commercial terms as `const`/`static readonly`, deliberately
outside `IOptions`. **New tension worth flagging:** `ListingQuotaOptions` (the agency
quota, `Listings:Quota:AgencyActiveListingLimit` in `appsettings.json`) is the opposite
choice — a runtime-configurable value, not a Domain constant — made explicitly as an
interim measure until a `Plan`-driven limit exists (§7.4). Do not treat this as the new
pattern; it is a documented exception.

### 6.8 Identity writes cannot join a database transaction
Unchanged from v7 — commit the domain transaction first, then attempt the role write,
log rather than throw on failure.

### 6.9 Advisory locks are now a real pattern, not a one-off — NEW
Two independent seams use `pg_advisory_xact_lock` via the infrastructure primitives added
this cycle: `ListingQuotaLock` (transaction-scoped, keyed by owner or agency, guards the
listing-quota read-then-write) and `BackgroundJobLock` (guards a recurring hosted
service's `RunOnceAsync` from running concurrently across instances). Both release
automatically on commit/rollback or on the lock's own scope disposal. A third
serialization need should reach for one of these before inventing a new mechanism.

---

## 7. Free-listing lifecycle, featured placement, agencies, and plans

### 7.1 Free-listing lifecycle (built 2026-08-23) — unchanged this cycle

**Policy — one source of truth:** `PropertyApi.Domain/Listings/ListingLifecyclePolicy.cs`

| Term | Value |
|---|---|
| Publication period (and the length one extension buys) | 90 days |
| Warning lead time | 7 days |
| Grace period after expiry, before deletion | 30 days |
| Free-tier active-listing limit (individual, no agency) | **1** |
| Agency-pooled active-listing limit — **new**, see §7.4 | **50** (config-driven, `ListingQuotaOptions`) |
| Single-listing extension fee | **$1.00 USD** |
| Featured placement period | **30 days** |
| Featured placement fee | **$5.00 USD** |

The scheduler (`ListingExpiryHostedService`, every 6 hours) is unchanged in shape but is
now **advisory-locked** (§6.9) — see §4 and `BACKEND-ISSUES.md`'s closed-items list for
what that fixed.

### 7.2 Featured placement (built 2026-08-23/24) — unchanged this cycle

See `BACKEND-ISSUES.md`'s closed-B-1 writeup for the full history; nothing here moved
this cycle. `Property.MarkFeatured()` / `IsCurrentlyFeatured()` in
`Domain/Listings/Entities/Property.cs:455-505`; featured-first default ordering only;
geo search badges but never reorders.

### 7.3 Listing eligibility gates — NEW this cycle

```
CreatePropertyCommandHandler.Handle
  ├─ EnsureContactConfirmedAsync   → 403 LISTING_CONTACT_NOT_CONFIRMED
  │    reads IdentityAccountSnapshot (EmailConfirmed || PhoneConfirmed), not a cached flag
  ├─ EnsurePlanSelected            → 403 LISTING_PLAN_REQUIRED
  │    UserAccount.PlanId must be non-null — "free" must be chosen, never assumed
  └─ CreateWithQuotaEnforcedAsync  → transaction + advisory lock + quota check (§6.9)
```

Applies to every role, including `AgencyOwner`/`AgencyAgent`, by deliberate decision.
`GET /api/users/me` now exposes `PlanTier`/`PlanSelectedAt`/`PhoneConfirmed` so the
frontend can render the right prompt without a second round trip.

### 7.4 Plans — a catalog and a choice, not a subscription system

| Piece | Location |
|---|---|
| `Plan` entity | `Domain/Plans/Entities/Plan.cs` |
| `GET /api/plans` | `PlansController` → `GetPlansQueryHandler`, `[AllowAnonymous]` |
| `POST /api/users/me/plan` | `UsersController` → `SelectPlanCommandHandler`, `[Authorize]` |
| `UserAccount.PlanId` / `.PlanSelectedAt` | `Domain/Users/Entities/UserAccount.cs` |
| Seed matching the frontend's four tiers | `Persistence/Seeds/PlansSeed.cs` |

**What this is not, stated in the migration's own commit message:** *"a deliberately
lighter-weight addition than the full Subscription system documented (but not built) in
[FRONTEND_BACKEND_CONTRACT.md] §11.3/§11.4."* There is still no billing, no payment
gateway, and — the gap that matters most operationally — **`EnsureListingQuotaAvailableAsync`
does not read `UserAccount.PlanId` at all.** The listing-quota check (§7.5/`ListingQuotaOptions`)
and the plan a user selected are two unconnected facts today. Selecting a paid-sounding
plan changes nothing about how many listings an account may create. See
`BACKEND-ISSUES.md` **B-3**.

### 7.5 Agencies (built 2026-08-23) — grouping, not tenancy; now editable

Unchanged core model from v7 (`Agency` is organisational grouping, not row-level
isolation — see §10.3's limit, still true). **What changed this cycle:**

| Endpoint | Status |
|---|---|
| `GET /api/agencies/{slug}` | ✅ unchanged, now rate-limited (`agencies-public`) |
| `GET /api/agencies/me` | ✅ unchanged |
| `POST /api/agencies` | ✅ unchanged |
| `PUT /api/agencies/{agencyId}` | ✅ **new** — `UpdateAgencyCommandHandler`, `[Authorize(Roles=AgencyOwner)]` |
| `DELETE /api/agencies/{agencyId}` | ✅ **new** — `DeactivateAgencyCommandHandler`, same role gate |
| Transfer ownership | ❌ still no endpoint — `Agency.TransferOwnership()` exists, uncalled outside tests — B-4b |
| Set logo | ❌ still no endpoint — `Agency.SetLogo()` exists, uncalled outside tests — B-4b |
| `POST /api/agencies/{agencyId}/members` | ⚠️ unchanged — still no consent step, but the public page no longer exposes an unconsenting member's name — B-2 |
| Agency-scoped property listing | ✅ **new** — `PropertyFilterDto.AgencyId` now filters `PropertyRepository`, and `PropertyDto.AgencyId` is exported — closes v7's B-5 |
| Agency-pooled listing quota | ✅ **new**, interim — see §7.4/B-3 |

**Authorization rule to copy, unchanged:** the role gates the route, but every handler
still re-compares the caller to the target agency's `OwnerUserId`.

**Public-page consent boundary, unchanged principle, new enforcement:**
`GetAgencyBySlugQueryHandler` now returns **only the owner** in the public member list —
`publicMembers = members.Where(m => m.Id == agency.OwnerUserId)` — explicitly to stop
publishing a non-consenting added member's name and photo. The underlying gap (no
invitation/acceptance flow for `POST .../members`) is unchanged; only its most
irreversible consequence is closed. See `BACKEND-ISSUES.md` **B-2**.

---

## 8. Money handling rules — do not relax these

Unchanged from v7 in substance:

### 8.1 There is still no payment gateway
`Plan` selection (§7.4) is a catalog choice, not a purchase. Every fee (extension,
featured) is still recorded as a `Pending` `Transaction` with
`PaymentMethod = BankTransfer` and settled by a human.

### 8.2 The single seam that must stay admin-only
`RequestListingExtension`/`RequestFeaturedListing` record; `ConfirmListingExtensionPayment`/
`ConfirmFeaturedListingPayment` grant. Unchanged, unrelaxed.

### 8.3 The platform receiver sentinel
`Transaction.ReceiverId = Guid.Empty` means "the platform" — unchanged.

### 8.4 There is still no listing-limit-to-plan link
Restated from §7.4 because it is the one place this cycle's work looks more finished than
it is: a `Plan` exists, a user can select one, and nothing downstream reads that
selection to size their quota yet.

---

## 9. Open defects — roll-up only

Full evidence, reproduction and fixes: **`BACKEND-ISSUES.md`** (now v3 — 10 of v7's 17
items closed this cycle, 3 partially mitigated, 2 new items added).

| ID | Title | Severity | Status |
|---|---|---|---|
| B-18 | 🆕 Refresh cookie is `SameSite=None`; CSRF is still off by default | 🟠 Medium | Open — new this cycle |
| B-2 | Agency owner can still attach a member without consent (internal only now — public exposure fixed) | 🟠 Medium | Open, mitigated |
| B-3 | Listing quota is agency-pooled now, but still not plan-driven | 🟠 Medium-High | Open, mitigated |
| B-4b | Agency ownership transfer and logo upload have no endpoint | 🟠 Medium | Open (half of v7's B-4 fixed) |
| B-7 | Rate-limit/public-endpoint guards are allowlists, not invariants | 🟠 Medium | Open (the one known instance is fixed) |
| B-6b | `SecurityAlertBackgroundService` has no advisory lock (4 of 5 others do) | 🟡 Low | Open, mitigated |
| B-9b | Optimistic concurrency exists on `Property` only | 🟡 Low-Medium | Open, mitigated |
| B-19 | 🆕 Mojibake — literal `????` where Arabic doc-comments used to be, in 3 files | 🟢 Low | Open — new this cycle |
| ~~B-1, B-4a, B-5, B-6a, B-8, B-10, B-11, B-12, B-13, B-14, B-15, B-16, B-17~~ | — | — | ✅ Closed — see `BACKEND-ISSUES.md` §2 for evidence per item |

---

## 10. Final Architectural Decision

### ⚠️ SUITABLE WITH CONDITIONS

**Why not "Not Suitable":** the Clean Architecture skeleton is unchanged and still
enforced by seven guard suites; the build is clean (0 warnings, re-verified this
session); the security roadmap keeps shipping (Apple nonce, refresh cookie, listing
eligibility, agency edit/deactivate, quota race fix); and the operational layer remains
more mature than most projects at this stage.

**Why not "Suitable":** one new condition replaced several old ones. The refresh-token
cookie migration — a real fix for a real problem (B-13) — was landed without its paired
CSRF activation, which is exactly the sequencing v7 warned against for this same change:
*"all three land together or the app breaks."* Two land now; the third does not.
Separately, the plan catalog that finally gives `/pricing` a backend still cannot change
what anyone's quota actually is, which will read as a bug to a paying customer, not as an
architectural nuance.

**The conditions, current:**

1. **Enable `CookieCsrf:Enabled` and wire the frontend's CSRF fetch/echo** (B-18) — the
   remaining third of the change v7 already specified for B-13.
2. **Connect `ListingQuotaOptions`/`ListingLifecyclePolicy` to `UserAccount.PlanId`**
   (B-3) so a purchased plan changes an actual limit.
3. **Add the two missing agency endpoints** — transfer ownership, set logo (B-4b).
4. **Turn the rate-limit/public-endpoint allowlist tests into invariant tests** (B-7).
5. **Convert agency member addition into an invitation** (B-2) — the worst consequence
   (unconsented public exposure) is fixed; the consent gap itself is not.
6. **Apply `BackgroundJobLock` to `SecurityAlertBackgroundService`** and `xmin` to
   `Transaction`/`UserAccount` (B-6b, B-9b) — small, for consistency.
7. **Re-run the full test suites and click a real confirmation-email link** at the
   current commit — this document's §0 states plainly that this session did not.
8. **Re-verify this document at the next significant deployment cycle.** Every prior
   revision but one held one day or less.

---

*This document reflects direct inspection of the live PropertyApi repository at commit
`3cadb4b` and the live Angular source at `730af55`, on 2026-08-26, with `dotnet build`
and `npm run audit:frontend` executed this session (both clean/passing) and the frontend
production bundle measured fresh (596.90 kB raw, inside the actual 650 kB budget in
`angular.json`). Full test-suite execution and a live email-link click were not repeated
this session and are named as such rather than carried forward as if they had been.
Frontend detail lives in `FRONTEND-REFERENCE.md`; the repository layout lives in
`PROJECT-STRUCTURE.md`; open defects live in `BACKEND-ISSUES.md`.*
