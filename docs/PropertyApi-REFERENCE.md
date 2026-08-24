# PropertyApi — Architectural Reference Document

> **Purpose:** Living reference for all future development sessions.
> **Last updated:** 2026-08-24 · Analysis **v6** — rebuilt from direct inspection of the
> live working repository at `C:\Users\naeem\Source\Repos\PropertyApi` (HEAD **`61bd779`**)
> together with the Angular source at
> `C:\Users\naeem\OneDrive\Desktop\Notiz\WohnungsApp\Wohnungsmieten` (HEAD **`c84052a`**).
> **Decision:** ⚠️ SUITABLE WITH CONDITIONS — see §12.
> **Companion documents:** `PROJECT-STRUCTURE.md` (the two repositories side by side) and
> **`BACKEND-ISSUES.md`** (every open defect, with evidence and a fix each). Defect detail
> lives there now; this file states architecture and points at it.

---

## 0. Why v6 exists — read this before trusting anything below

v5.1 was accurate as of commit `b3d0d0b` plus the listing-lifecycle work. Two commits
later the tree has moved again, and in ways that invalidate specific v5 claims:

- **A whole new bounded context exists.** `61bd779` added **Agencies**: entity, repository,
  five endpoints, two Identity roles, a public agency page, and 24 tests. v5 said "Agency /
  multi-tenant: ❌ not in the domain, requires a design spike first." That row is now wrong
  in the literal, and only half right in substance — see §10, which explains exactly how
  much of "multi-tenancy" was built (grouping) and how much was deliberately not (isolation).
- **The dead featured-placement fields are alive** (updated 2026-08-24). v5 said
  `Property.IsFeatured` / `FeaturedUntil` had "no code reading or writing them"; v6 as first
  written found writers but **no readers at all** — money changing hands for nothing visible.
  Both read paths now exist: featured listings lead the default ordering, and `PropertyDto`
  carries the effective flag. See §8. **B-1 in `BACKEND-ISSUES.md` is closed** (fix not yet
  committed).
- **Counts moved again**, exactly as v5 predicted they would: 23 → **24 controllers**,
  24 → **26 migrations**.

**v6 also splits the document.** v5 mixed architecture with a defect list, and the defect
list kept being the part that went stale. Defects now live in `BACKEND-ISSUES.md`, which is
built to be re-verified as a unit; this file keeps only a one-line severity roll-up (§11).

**Working rule, unchanged and repeatedly vindicated:** treat this document as accurate only
as of the commit named above. v4 held about seven weeks. v5 held **one day**. Re-verify
before planning.

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
| Database | PostgreSQL 16 + PostGIS (EF Core 8, Npgsql), Supabase · **26 migrations** | ✅ |
| Auth | JWT + ASP.NET Identity + hashed Refresh Tokens + Phone OTP | ✅ |
| CSRF | Middleware wired, **disabled by default** (Bearer-only auth) — §4 | ✅ |
| Real-time | SignalR + Redis backplane (`AddStackExchangeRedis`) | ✅ |
| Caching / Rate limiting | Redis — mandatory in Production (boot throws if unconfigured) | ✅ |
| Media | Cloudinary EU | — |
| Cloud | Azure (EU) / Render evaluated, DSGVO-relevant | — |
| Deployment shape | **Multi-instance behind a load balancer** — the performance suite requires traffic on both instances | ✅ |
| CI/CD | GitHub Actions — build/test + Gitleaks + TruffleHog + Dependabot + coverage gates | ✅ |
| Tests | 8 projects · 106 test files · **473 `[Fact]`/`[Theory]` cases** | ✅ |
| **Frontend** | Angular 20.2, standalone, hash routing, Capacitor 8, Tailwind v4 alongside SCSS — **see `FRONTEND-REFERENCE.md`** | ✅ |

---

## 2. Layer Structure (verified against the live tree)

```
PropertyApi.sln
├── PropertyApi                      API layer — 24 controllers
│   ├── Controllers/
│   ├── Middleware/                  ExceptionHandlingMiddleware
│   ├── Security/
│   │   ├── Csrf/                    CookieCsrfOptions · Middleware · Extensions
│   │   ├── Headers/                 Security response headers
│   │   └── RateLimiting/            RedisRateLimitPartitionKeyResolver
│   └── Program.cs                   678 lines
│
├── PropertyApi.Application          No infrastructure deps
│   └── {Admin, Agencies, Listings, Users, Notifications, …}/
│       └── Commands · Queries · DTOs · Interfaces · Mapping
│
├── PropertyApi.Domain               Zero external deps
│   └── {Agencies, Listings, Users, Transactions, Notifications, Common}/
│
├── PropertyApi.Infrastructure
│   ├── Auth/Services/               Console · Twilio · Http SMS
│   ├── Identity/Services/           CachedSecurityStampValidator (IDistributedCache)
│   ├── Listings/                    ListingExpiryHostedService
│   ├── Search/                      SavedSearchMatchHostedService
│   ├── Health/                      ProductionStartupValidator
│   ├── Security/DataProtection/     Encrypted user fields
│   ├── Persistence/                 AppDbContext · Configurations · Seeds
│   ├── Repositories/                14 repositories
│   └── Migrations/                  26 migrations
│
├── tests/                           8 projects
│   ├── PropertyApi.Application.Tests     17 files
│   ├── PropertyApi.Architecture.Tests    23 files — 7 guard suites
│   ├── PropertyApi.Auth.Tests            29 files
│   ├── PropertyApi.Concurrency.Tests      1 file
│   ├── PropertyApi.Integration.Tests     32 files
│   ├── PropertyApi.Observability.Tests    2 files
│   ├── PropertyApi.Performance.Tests      1 file
│   └── PropertyApi.StagingSmokeTests      1 file
│
├── docs/                            architecture · development · observability ·
│                                    operations · performance · security · testing
├── artifacts/                       coverage gates · production gate · vulnerability
├── ci/ · scripts/ · tools/          Migrator · DatabaseRecoveryVerifier · PerfDataGenerator
└── observability/ · performance/
```

**Architecture guard suites** (`tests/PropertyApi.Architecture.Tests/Api/`):
`APIDependencyGuardTests` · `HttpClientLifetimeTests` · `MiddlewareOrderGuardTests` ·
`OptionsValidationGuardTests` · `PublicEndpointPolicyTests` · `RateLimitingGuardTests` ·
`RedisRateLimitingGuardTests`.

> ⚠️ Two of those guards are **allowlists, not invariants**, and the difference matters —
> see **B-7** in `BACKEND-ISSUES.md`.

---

## 3. Controller CQRS Audit — RE-VERIFIED

**24 controllers** (v5: 23; v4: 15). Grepping `PropertyApi/Controllers/*.cs` for
`AppDbContext` still returns **3 matches**:

| Controller | Uses `AppDbContext` | Gating | Assessment |
|---|---|---|---|
| `OperationalController` | ✅ direct | **None** — `[AllowAnonymous]`, all environments | ⚠️ B-8 |
| `StagingTestSupportController` | ✅ direct | `IsStaging()` **+** config flag **+** constant-time secret compare | ✅ correctly gated |
| `ObservabilitySyntheticController` | ✅ direct | `IsStaging()` + `Staging:TestSupport:Enabled` | ✅ correctly gated |
| **All 21 business controllers** | ❌ none | — | ✅ CQRS clean |

Business controllers: Admin, **Agencies**, Amenities, Analytics, Auth, Contact, Csrf, Enum,
Favorites, LocationSuggestions, Lookups, Messages, Notifications, PhoneAuth,
PhonePasswordAuth, Properties, PropertyImages, Reviews, SavedSearch, Users, Visits.

**Honest reading:** the CQRS rule holds **21/21 where it applies**. The three exceptions are
diagnostic/ops surfaces that exist to report database and migration state — routing that
through MediatR would add a handler per health probe for no architectural benefit. It is a
defensible carve-out, and it is a carve-out: anyone re-running the grep gets 3 hits.

`GetPropertyStatsQueryHandler` remains the one documented `AppDbContext`-direct handler for
a 5-table aggregate. Still not a precedent — if Analytics grows past this one query, build a
read-model repository rather than adding a second exception.

---

## 4. Program.cs Middleware & Security Capability Matrix — RE-VERIFIED

Middleware order (`Program.cs`, section 11), which `MiddlewareOrderGuardTests` pins:

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
| `ForwardedHeaders` hardening | ✅ | Throws in Production if `TrustAllProxies=true` |
| CORS `AllowCredentials` in Production | ✅ | Scoped, with a comment tying it to SignalR |
| Redis distributed rate limiting | ✅ | Boot throws in Production if Redis unconfigured |
| Rate limit partition key | ✅ | `user:{userId}:ip:{ip}` when authenticated, `ip:{ip}` when anonymous — M-3 closed in v5 |
| **Rate limit coverage** | ⚠️ **opt-in only** | 14 named policies, **no global limiter**; an endpoint without `[EnableRateLimiting]` is unlimited — B-7 |
| `AddOutputCache` + `UseOutputCache` | ✅ | Redis-backed |
| SignalR Redis backplane | ✅ | `AddStackExchangeRedis(...)` |
| **Background job coordination** | ❌ **absent** | 6 hosted services, zero leader election — B-6 |
| **CSRF protection** | ⚠️ **wired but OFF** | `AddPropertyApiAntiforgery` + `UseCookieCsrfProtection()`, but `CookieCsrfOptions.Enabled = false` by default and no `CookieCsrf` key in any `appsettings` |
| Security headers middleware | ✅ | `AddPropertyApiSecurityHeaders` |
| Reference-data seeding at boot | ✅ | `DatabaseSeeder.SeedAsync`, idempotent, failures logged not thrown |
| Optimistic concurrency | ❌ **none** | Zero `IsConcurrencyToken` / `RowVersion` / `xmin` in the model — B-9 |
| JSON casing | ⚠️ Still PascalCase | `PropertyNamingPolicy = null` (`Program.cs:301`) — deliberate (S-1) |

### 4.1 CSRF: why "off" is the correct state, and the trap in it

`CookieCsrfProtectionMiddleware` short-circuits unless `Enabled` **and** the request is
unsafe-method **and** an auth cookie is present. `CookieCsrfOptions` documents the reason
in-source: keep it disabled while the API authenticates with `Authorization: Bearer` only.
That is sound — CSRF exploits ambient cookie credentials, and there are none.

The Angular client correspondingly sends **no** `X-XSRF-TOKEN` header (verified: zero
matches for `csrf|xsrf|antiforgery` across the frontend source).

⚠️ **The trap:** these two states are coupled and neither side knows it. Enabling
`CookieCsrf:Enabled` without simultaneously teaching the frontend to fetch
`GET /api/security/csrf-token` and echo the header will make **every write request fail** —
and it will fail at the middleware, before any controller, so the failure will not look like
a CSRF problem. If browser cookie auth is ever introduced, both sides change in one change.

---

## 5. What Works Correctly (Verified Strengths)

### 5.1 Security subsystems
Refresh tokens SHA-256 hashed with atomic rotation; OTP HMAC-SHA-256 with
`CryptographicOperations.FixedTimeEquals` and attempt limits; full `[EnableRateLimiting]`
coverage on auth endpoints, enforced by `RateLimitingGuardTests`; real Twilio SMS with
boot-time validation; encrypted user fields via Data Protection; audit logging; security
headers; deny-by-default authorization `FallbackPolicy`.

### 5.2 PostGIS geo-search
GIST index + `ST_DWithin`, radius capped at 50 km, `COUNT(*) OVER()` single-round-trip
pagination, fully parameterized raw SQL.

### 5.3 Text search — `pg_trgm` GIN indexes in place
Trigram GIN on `City` and `Region` plus a partial index on `(Status, IsPublished,
CreatedAt)`. Correct fix for leading-wildcard `ILIKE`, properly applied.

### 5.4 Soft delete is genuinely universal
19 `HasQueryFilter(e => !e.IsDeleted)` registrations, and repository `Remove()` is itself
intercepted and converted to `IsDeleted = true`. **Nothing in this codebase physically
removes a `Property`.** Any new sweep or admin action inherits that guarantee for free —
do not be the first to break it.

### 5.5 Money paths refuse to grant what was not paid for
Both fee flows (extension and featured) separate *recording a charge* from *delivering the
thing*. Request endpoints return `202` and change nothing; only an admin-only confirmation
handler mutates the listing, inside an explicit transaction that rolls back together. This
is the correct shape for a system with no payment gateway, and the seam where a gateway
callback will plug in later. See §9.2 for the exact rule that must not be relaxed.

### 5.6 Operational maturity
`docs/operations/` and `docs/observability/` carry an SLO definition, alert-response and
telemetry-failure runbooks, a metric-cardinality policy, database backup/restore and
migration-recovery runbooks, an application rollback runbook, a Redis failure/failover
runbook with an HA architecture and an explicit production-readiness decision, and a
**dated recovery-drill evidence file (2026-07-28)**. Dedicated `Observability`,
`Performance`, `Concurrency`, and `StagingSmoke` test projects back this.

---

## 6. Key Decisions and Patterns (carried forward, re-checked)

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
Still the correct approach for Bookings/Reviews needing read-only Property data without
full cross-module coupling.

### 6.6 New public endpoints must be registered twice
Adding `[AllowAnonymous]` is not enough: `Program.cs` sets a deny-by-default
`FallbackPolicy`, and `PublicEndpointPolicyTests.ApprovedAnonymousEndpoints` must list the
action or **the build fails**. This is a feature — it forces every anonymous surface through
review. Note what it does **not** force: a rate limit (B-7).

### 6.7 Policy constants live in Domain, as constants
`ListingLifecyclePolicy` holds every commercial term (periods, prices, quotas) as
`const`/`static readonly` rather than `IOptions`, deliberately: the Application layer takes
no dependency on `Microsoft.Extensions.Options`, and changing a term a customer was shown
before they paid should be a code change and therefore a reviewed change.

### 6.8 Identity writes cannot join a database transaction
Role grants go through ASP.NET Identity's own store, which does not enlist in
`IUnitOfWork`'s transaction. The established pattern (`CreateAgencyCommandHandler`,
`AddAgencyMemberCommandHandler`) is: commit the domain transaction **first**, then attempt
the role write, and **log an error rather than throw** if it fails. The ordering is chosen
so a partial failure leaves the safe half — a user attached without extra rights, never
rights granted for an entity that was rolled back. Follow the same ordering; do not invent
a compensating rollback that could delete committed data.

---

## 7. Free-listing lifecycle (built 2026-08-23, verified in v6)

**Policy — one source of truth:** `PropertyApi.Domain/Listings/ListingLifecyclePolicy.cs`

| Term | Value |
|---|---|
| Publication period (and the length one extension buys) | 90 days |
| Warning lead time | 7 days |
| Grace period after expiry, before deletion | 30 days |
| Free-tier active-listing limit | **1** |
| Single-listing extension fee | **$1.00 USD** |
| Featured placement period | **30 days** |
| Featured placement fee | **$5.00 USD** |

**The scheduler:** `ListingExpiryHostedService`, every 6 hours, 200 rows per phase per run,
four phases in a fixed order — warn → expire → delete → clear elapsed featured. The ordering
is load-bearing: a listing must not cross two boundaries in one sweep without its owner
hearing about the first.

`Property.ExpiresAt` has existed since the **initial migration** and
`PublishPropertyCommandHandler` has always stamped a 90-day window on publish;
`PropertyRepository` has always excluded elapsed listings from search. What `34cdce3` added
was everything *after* the date passes: an owner who is told, a `Status` that says
`Expired`, and a cleanup that eventually runs.

**Deletion is soft, deliberately** — `MarkExpiredListingDeletedBySystem()` sets the same
`IsDeleted` flag the global query filter already honours (§5.4).

---

## 8. Featured placement (built 2026-08-23, read side added 2026-08-24)

| Piece | Location |
|---|---|
| `Property.MarkFeatured()` / `ClearFeatured()` / `IsCurrentlyFeatured()` | `Domain/Listings/Entities/Property.cs:455-505` |
| `TransactionType.FeaturedListingFee` | `Domain/Transactions/Enums/TransactionType.cs` |
| `POST /api/properties/{id}/featured` → 202 + quote | `RequestFeaturedListingCommandHandler` |
| `POST /api/properties/featured/{transactionId}/confirm` → admin-only | `ConfirmFeaturedListingPaymentCommandHandler` |
| Scheduler phase that ends elapsed placements | `ListingExpiryHostedService.ClearElapsedFeaturedAsync` |
| Index `IX_Properties_FeaturedUntil_Active` (filtered on `IsFeatured = true`) | `PropertyConfiguration.cs:217` |
| Ordering key `Property.CurrentlyFeatured(asOfUtc)` (SQL-translatable) | `Domain/Listings/Entities/Property.cs` |
| Featured-first default ordering | `PropertyRepository.ApplySort` |
| `PropertyDto.IsFeatured` / `.FeaturedUntil`, and the geo DTO's badge fields | `PropertyMapper.ToDto`, `PropertyGeoSearchRepository` |
| 27 tests + `PropertySortOrderTests` | `Application.Tests/Listings/FeaturedListingTests.cs`, `Architecture.Tests/Persistence/` |

The purchase mechanics are correct: repeat requests reuse the existing pending fee rather
than stacking charges; a purchase extends from the later of *now* and the existing
`FeaturedUntil`, so a late payer gets the full period; expired and unpublished listings are
refused because promoting something nobody can find is selling nothing.

**The read side (added 2026-08-24, closing B-1).** Three rules, all deliberate:

1. **Featured leads the default ordering only.** `ApplySort` puts
   `Property.CurrentlyFeatured(nowUtc)` ahead of `CreatedAt` when the caller asked for the
   default or for `createdat`. An explicit `purchaseprice` / `coldrent` / `area` sort is
   returned exactly as asked — a paid placement must never make "cheapest first" untrue.
2. **The DTO carries the *effective* flag, not the column.** `ClearElapsedFeaturedAsync`
   sweeps every six hours, so a row can sit with `IsFeatured = true` over an elapsed window.
   `PropertyMapper.ToDto` maps `p.IsCurrentlyFeatured(asOfUtc)`; `FeaturedUntil` is passed
   raw, as the record of what was bought.
3. **Geo search badges but does not reorder.** `PropertyGeoSearchRepository` computes the
   effective flag in its own SQL. Its `nearest_candidates` CTE truncates to the closest
   page via the KNN operator *before* anything else runs, so promoting featured rows would
   promote only those that happened to land inside that window, and "nearest first" would
   stop being true. Proximity is that endpoint's contract.

> ⚠️ **The featured ordering key has no index and cannot have one.** It is a time-dependent
> expression; a PostgreSQL expression index needs an `IMMUTABLE` function and `now()` is not
> one. No migration was needed either — the columns and their two indexes have existed since
> `20260823195955`. If the listing table grows large enough for the sort to hurt, the answer
> is a materialised `IsCurrentlyFeatured` column maintained by the sweep, not an index here.

---

## 9. Money handling rules — do not relax these

### 9.1 There is still no payment gateway
Zero matches for `stripe|paytabs|paymob|billing|invoice|subscription` across all four
projects. Every fee is recorded as a `Pending` `Transaction` with
`PaymentMethod = BankTransfer` and settled by a human.

### 9.2 The single seam that must stay admin-only
`RequestListingExtension` and `RequestFeaturedListing` **record**; `ConfirmListingExtensionPayment`
and `ConfirmFeaturedListingPayment` **grant**. The confirm handlers are the only code that
turns an unpaid fee into a delivered product.

> **If either confirm handler is ever moved behind an owner-callable endpoint, the fee
> becomes optional and every owner gets the product for free.** That is where a gateway
> callback plugs in — as a *new caller of the same handler*, authenticated as the gateway,
> never by loosening the endpoint.

### 9.3 The platform receiver sentinel
`Transaction.ReceiverId = Guid.Empty` means "the platform". There is no platform
`UserAccount` row and `ReceiverId` carries no foreign key. Both fee handlers use it. Any
reporting query that joins `ReceiverId` to users must exclude `Guid.Empty` or it will
silently drop every platform fee.

### 9.4 There is no `Subscription` entity
Nothing can ask which plan a user is on, so **every account is treated as free tier** and
the limit of 1 active listing applies to all of them — including agency members (B-3).
Existing owners keep listings they already have; they simply cannot create another.

---

## 10. Agencies (built 2026-08-23 in `61bd779`) — grouping, **not** tenancy

This is the section that replaces v5's "Agency: ❌ not in the domain, needs a design spike".

### 10.1 What it is

`Agency` is an **organisational grouping**: a named office several users work under.
`UserAccount.AgencyId` records who works where; `Property.AgencyId` records which office a
listing was published under. A `Property` still belongs to its `OwnerId` exactly as before.

| Piece | Location |
|---|---|
| `Agency` entity (`AuditableEntity`, `MaxMembers = 50`) | `Domain/Agencies/Entities/Agency.cs` |
| `UserAccount.AgencyId` + `AgencyJoinedAt` + `JoinAgency()` / `LeaveAgency()` | `Domain/Users/Entities/UserAccount.cs` |
| `Property.AgencyId` + `SetAgency()` | `Domain/Listings/Entities/Property.cs:83, 443` |
| `RoleNames.AgencyOwner` / `RoleNames.AgencyAgent` | `Domain/Users/Constants/RoleNames.cs` |
| Repository (7 methods) | `Infrastructure/Repositories/AgencyRepository.cs` |
| Config: unique slug, query filter, FK, two filtered indexes | `Persistence/Configurations/AgencyConfiguration.cs`, `PropertyConfiguration.cs:224-229` |
| Migration `20260823195955_AddAgencyAndFeaturedListingPath` | `Infrastructure/Migrations/` |
| 24 tests | `tests/PropertyApi.Application.Tests/Agencies/AgencyTests.cs` |

### 10.2 Endpoints

| Endpoint | Auth | Notes |
|---|---|---|
| `GET /api/agencies/{slug}` | **Anonymous** | Public agency page. In `ApprovedAnonymousEndpoints`. No rate limit — B-7 |
| `GET /api/agencies/me` | `[Authorize]` | `204 No Content` when the caller is independent — not `404`, because being independent is the normal state |
| `POST /api/agencies` | `[Authorize]` | Any authenticated user, once. The `AgencyOwner` role is *granted by* the handler, so it cannot be required on the route |
| `POST /api/agencies/{agencyId}/members` | `[Authorize(Roles = AgencyOwner)]` | Handler **also** compares caller to `OwnerUserId` |
| `DELETE /api/agencies/{agencyId}/members/{memberUserId}` | `[Authorize]` | Owner removing, or member leaving; a leaver holds `AgencyAgent`, not `AgencyOwner` |

**Authorization rule to copy:** the role gates the route, but it is **never the whole
check**. Holding `AgencyOwner` says a user owns *an* agency, not *this* one — every handler
re-compares the caller to the target agency's `OwnerUserId`.

### 10.3 The scope limit, stated plainly

There is deliberately **no global query filter on `AgencyId`** and no row-level isolation.
Two agencies' rows live in the same tables and are separated only by explicit predicates a
handler remembers to write. **A handler that forgets the predicate leaks across agencies.**

That is a documented limit, not an oversight: every pre-existing query keeps working
untouched, and nothing added here can silently hide a row from a query that did not ask
about agencies. If strict isolation is ever required, the upgrade is a global query filter
plus an ambient `IAgencyContext` — which is the design spike `عقار-تيك §9` asked for, and a
bigger change than this module.

### 10.4 Invariants the code enforces

- One agency per user (owned **or** joined) — checked twice on create.
- The owner cannot be removed, by anyone, including themselves. Transfer or delete instead.
- Slug is normalised (lower-cased, non-alphanumerics collapsed to single dashes) **before**
  the uniqueness check, so `"Damascus Homes"` and `"damascus-homes"` cannot both be
  accepted and then collide on the unique index. **Arabic letters are kept** — a Syrian
  agency should not need a transliteration nobody would type.
- `LicenseNumber` is free text, written only through its own dedicated setter, and
  **never validated, inferred, or auto-filled**. Nothing in this codebase treats a present
  licence number as proof of anything, and clients must not present it as accreditation.
- Deactivating an agency hides its page but **does not touch its members' listings** —
  those belong to the members, not the office.

### 10.5 Known gaps in this module

Four, all in `BACKEND-ISSUES.md`: members can be added without consent (**B-2**), the free
tier quota makes multi-agent offices unusable (**B-3**), an agency cannot be edited,
deactivated, transferred or deleted after creation (**B-4**), and `Property.AgencyId` is
written but never read (**B-5**).

---

## 11. Open defects — roll-up only

Full evidence, reproduction and fixes: **`BACKEND-ISSUES.md`**.

| ID | Title | Severity |
|---|---|---|
| ~~**B-1**~~ | ~~Featured placement is sold but never surfaced~~ | ✅ Closed 2026-08-24 |
| **B-2** | An agency owner can attach any user without consent | 🟠 Medium-High |
| **B-3** | Free-tier quota of 1 applies per user, making agencies unusable | 🟠 Medium-High |
| **B-4** | An agency cannot be edited, deactivated, transferred or deleted | 🟠 Medium |
| **B-5** | `Property.AgencyId` is write-only — no agency listing page is possible | 🟠 Medium |
| **B-6** | Six hosted services, no leader election, multi-instance deployment | 🔴 High |
| **B-7** | Rate limiting and public-endpoint guards are allowlists, not invariants | 🟠 Medium |
| **B-8** | `GET /api/operational/build-info` is anonymous in Production | 🟡 Low-Medium |
| **B-9** | No optimistic concurrency token anywhere — last write wins | 🟠 Medium |
| **B-10** | Listing-quota check is a read-then-write race | 🟡 Low-Medium |
| **B-11** | Success bodies are PascalCase, error bodies and two endpoints are camelCase | 🟡 Low |
| **B-12** | Invalid slug returns 400 while unknown slug returns 404 on an anonymous route | 🟢 Info |
| **B-13** | Frontend refresh token lives in `sessionStorage`, not an HttpOnly cookie | 🟠 Medium (cross-repo) |

### Resolved and still resolved

| ID | Issue | Status |
|---|---|---|
| M-3 | IP-only rate-limit partitioning | ✅ Resolved — `user:{id}:ip:{ip}` |
| OPS-1 | `security-patch/` / `dbkeys_patch/` in deployment artifacts | ✅ Resolved — folders gone |
| OPS-2 | Redis outage not covered as a distinct failure mode | ✅ Resolved — failover runbook + policy + HA doc |
| Dead `IsFeatured` columns | v5's "no code reads or writes them" | ✅ Resolved — written *and* read; see §8 (B-1) |
| Two divergent `PropertyDto` mappers | `GetPropertyByIdQueryHandler.MapToDto` trailed `PropertyMapper.ToDto` by seven fields on the public paths | ✅ Resolved — duplicate deleted, one mapper |

---

## 12. Final Architectural Decision

### ⚠️ SUITABLE WITH CONDITIONS

**Why not "Not Suitable":** the Clean Architecture skeleton is correct and enforced by seven
guard suites; 473 tests back it; the security roadmap has shipped; the operational layer —
SLOs, runbooks, a dated recovery drill, Redis HA, coverage and production gates — is more
mature than most projects at this stage; and the two money paths added this week are
structured so the system cannot deliver a product it was not paid for.

**Why not "Suitable":** two things are live that should not be. The scheduler that expires
and deletes listings runs on **every** instance of a load-balanced deployment with no
coordination (B-6). And a user can be attached to a business they never joined, with their
name shown on its public page (B-2). The third — a paid feature that delivered nothing
(B-1) — was fixed on 2026-08-24 and is no longer among them.

**The conditions:**

1. ~~Fix rate-limit partitioning~~ ✅ **DONE**.
2. ~~Confirm patch folders excluded from deployment~~ ✅ **DONE**.
3. **Make the scheduled jobs single-writer** before the next scale-out (B-6).
4. ~~**Either surface featured placement or stop selling it** (B-1)~~ ✅ **DONE** — surfaced.
   It was the one defect here with a legal dimension rather than merely a technical one.
5. **Add consent to agency membership** (B-2).
6. **Move the refresh token to an HttpOnly / `SameSite=Strict` / `Secure` cookie** (B-13).
   Backend accepts the cookie at `/auth/refresh`, `CookieCsrf:Enabled` flips to `true`, and
   the frontend starts fetching and echoing the CSRF token. All three land together or the
   app breaks.
7. **Restrict `GET /api/operational/build-info`** (B-8).
8. **Re-verify this document at the next significant deployment cycle.** v5 held for one
   day. Assume days, not weeks.

---

*This document reflects direct static inspection of the live PropertyApi repository at
commit `61bd779` and the live Angular source at `c84052a`, on 2026-08-24. Claims that could
not be verified in code are marked as such rather than carried forward from prior revisions.
Frontend detail lives in `FRONTEND-REFERENCE.md`; the repository layout lives in
`PROJECT-STRUCTURE.md`; open defects live in `BACKEND-ISSUES.md`; the API contract lives in
`FRONTEND_BACKEND_CONTRACT.md`.*
