# PropertyApi — Architectural Reference Document

> **Purpose:** Living reference for all future development sessions.
> **Last updated:** 2026-08-23 · Analysis **v5.1** — rebuilt from direct inspection of the
> live working repository at `C:\Users\naeem\Source\Repos\PropertyApi` (HEAD `b3d0d0b`)
> **and**, for the first time, the Angular source at
> `C:\Users\naeem\OneDrive\Desktop\Notiz\WohnungsApp\Wohnungsmieten`.
> **Decision:** ⚠️ SUITABLE WITH CONDITIONS — but the conditions have changed. See §10.

---

## 0. Why v5 exists — read this before trusting anything below

v4 was written from a **ZIP snapshot** (`PropertyApi-safe-review-20260701_195852.zip`) and
was explicit that every frontend claim was unverifiable. Both limits are now gone: this
revision reads the **live repo** and the **live Angular source** side by side. What changed:

- **The single frontend unknown is answered.** H-4/S-2 (refresh/JWT client storage) was
  marked "Unverified, not resolved" for three document generations. It is now read directly
  from `token-storage.service.ts` — see §6.1. The answer is neither "fixed" nor "broken":
  access token in memory ✅, refresh token in `sessionStorage` ⚠️.
- **M-3 is resolved.** The IP-only rate-limit partition — the one confirmed open defect in
  v4, and condition #1 of its verdict — now partitions on `user:{id}:ip:{ip}` when
  authenticated. Verified in source.
- **v4's headline CQRS number is now wrong in the literal.** It claimed "15 controllers,
  0 bypass CQRS, 100%". There are now **23 controllers, and 3 touch `AppDbContext`
  directly**. §3 explains why the rule is still intact in substance — but the number as
  printed no longer matches the tree.
- **v4 overstated CSRF.** It lists "CSRF protection ✅ present". The middleware is present
  and correctly written, but `CookieCsrfOptions.Enabled` defaults to **`false`** and is
  `false` in every `appsettings`. It is a dormant switch, not an active defense — by
  design, because auth is Bearer-only. Calling it "present ✅" without that qualifier is
  how a future reader concludes the API is CSRF-protected when it does not need to be and
  is not.
- **The repo has grown well past what v4 describes:** 8 test projects (v4: 4), 24
  migrations, and a substantial `docs/` tree covering observability, SLOs, operational
  runbooks, recovery drills, and Redis HA.

**v5.1 — and the rule caught v5 itself.** Within the same day, building the free-listing
lifecycle proved two of v5's own gap-list claims wrong: `Property.ExpiresAt` and a working
notification producer both already existed. v5 inherited those claims from a session that
could not see the backend source, and repeated them without re-checking. §9.1 records the
correction and what was actually built. The lesson is the one this document keeps relearning:
a claim about code that was not read from that code is a guess, however confidently it was
written down.

**Working rule going forward:** unchanged from v4, and it earned its keep twice — treat this
document as accurate only as of the commit named above. Re-verify before planning.

---

## 1. Project Identity

| Attribute | Value | Verified |
|---|---|---|
| Product | PropertyApi / Bizorealestateworld — Real estate SaaS API | — |
| Target market | European (primary) · Syrian (parallel roadmap) | — |
| Architecture | Modular Monolith (deliberate, not microservices) | ✅ |
| Backend | ASP.NET Core, Clean Architecture, CQRS/MediatR | ✅ |
| Target framework | **net8.0** — a `.NET 10` migration *plan* exists (`docs/operations/net10-migration-plan.md`) but is not executed | ✅ |
| Database | PostgreSQL 16 + PostGIS (EF Core 8, Npgsql), Supabase · **24 migrations** | ✅ |
| Auth | JWT + ASP.NET Identity + hashed Refresh Tokens + Phone OTP | ✅ |
| CSRF | Middleware wired, **disabled by default** (Bearer-only auth) — §4 | ✅ |
| Real-time | SignalR + Redis backplane (`AddStackExchangeRedis`) | ✅ |
| Caching / Rate limiting | Redis — mandatory in Production (boot throws if unconfigured) | ✅ |
| Media | Cloudinary EU | — |
| Cloud | Azure (EU) / Render evaluated, DSGVO-relevant | — |
| Dev env | Windows, PowerShell, Visual Studio 2022 | — |
| CI/CD | GitHub Actions — build/test + Gitleaks + TruffleHog + Dependabot + coverage gates | ✅ |
| **Frontend** | Angular 20.2, standalone, hash routing, Capacitor 8 — **see `FRONTEND-REFERENCE.md`** | ✅ |

**v4's caveat is retired.** The Angular source is no longer absent; frontend claims below
are read from code, not carried forward.

---

## 2. Layer Structure (verified against the live tree)

```
PropertyApi.sln
├── PropertyApi                      API layer — 23 controllers
│   ├── Controllers/
│   ├── Middleware/                  ExceptionHandlingMiddleware
│   ├── Security/
│   │   ├── Csrf/                    CookieCsrfOptions · Middleware · Extensions
│   │   ├── Headers/                 Security response headers
│   │   └── RateLimiting/            RedisRateLimitPartitionKeyResolver
│   └── Program.cs
│
├── PropertyApi.Application          No infrastructure deps
├── PropertyApi.Domain               Zero external deps
├── PropertyApi.Infrastructure
│   ├── Auth/Services/               Console · Twilio · Http SMS
│   ├── Identity/Services/           CachedSecurityStampValidator (IDistributedCache)
│   ├── Health/                      ProductionStartupValidator
│   ├── Security/DataProtection/     Encrypted user fields
│   └── Migrations/                  24 migrations
│
├── tests/                           8 projects (v4 listed 4)
│   ├── PropertyApi.Application.Tests
│   ├── PropertyApi.Architecture.Tests   7 guard suites (see below)
│   ├── PropertyApi.Auth.Tests
│   ├── PropertyApi.Concurrency.Tests    ← new since v4
│   ├── PropertyApi.Integration.Tests
│   ├── PropertyApi.Observability.Tests  ← new since v4
│   ├── PropertyApi.Performance.Tests    ← new since v4
│   └── PropertyApi.StagingSmokeTests    ← new since v4
│
├── docs/                            architecture · development · observability ·
│                                    operations · performance · security · testing
│                                    + ~20 phase-b slice documents
├── artifacts/                       coverage gates · production gate · vulnerability
├── ci/ · scripts/ · tools/          Migrator · DatabaseRecoveryVerifier · PerfDataGenerator
└── observability/ · performance/
```

**Architecture guard suites** (`tests/PropertyApi.Architecture.Tests/Api/`):
`APIDependencyGuardTests` · `HttpClientLifetimeTests` · `MiddlewareOrderGuardTests` ·
`OptionsValidationGuardTests` · `PublicEndpointPolicyTests` · `RateLimitingGuardTests` ·
`RedisRateLimitingGuardTests`.

> The `security-patch/` and `dbkeys_patch/` historical snapshot folders that v4 flagged
> are **no longer present** in the working repo. That operational risk is closed.

---

## 3. Controller CQRS Audit — RE-VERIFIED, and the number changed

**23 controllers** (v4: 15). Grepping `PropertyApi/Controllers/*.cs` for `AppDbContext`
now returns **3 matches**, not zero:

| Controller | Uses `AppDbContext` | Gating | Assessment |
|---|---|---|---|
| `OperationalController` | ✅ direct | **None** — `[AllowAnonymous]`, all environments | ⚠️ see N-1 in §6 |
| `StagingTestSupportController` | ✅ direct | `IsStaging()` **+** config flag **+** constant-time secret compare | ✅ correctly gated |
| `ObservabilitySyntheticController` | ✅ direct | `IsStaging()` + `Staging:TestSupport:Enabled` | ✅ correctly gated |
| **All 20 business controllers** | ❌ none | — | ✅ CQRS clean |

Business controllers: Admin, Amenities, Analytics, Auth, Contact, Csrf, Enum, Favorites,
LocationSuggestions, Lookups, Messages, Notifications, PhoneAuth, PhonePasswordAuth,
Properties, PropertyImages, Reviews, SavedSearch, Users, Visits.

**Honest reading:** the CQRS rule holds **20/20 where it applies**. The three exceptions
are diagnostic/ops surfaces that exist to report database and migration state — routing
that through MediatR would add a handler per health probe for no architectural benefit.
This is a defensible carve-out. But it is a carve-out, and v4's flat "100% / zero
matches" no longer describes the tree: anyone re-running that grep will get 3 hits and
reasonably conclude the doc is stale. State the exception explicitly instead.

`GetPropertyStatsQueryHandler` remains the one documented `AppDbContext`-direct handler
for a 5-table aggregate. Still not a precedent — if Analytics grows past this one query,
build a read-model repository rather than adding a second exception.

---

## 4. Program.cs Middleware & Security Capability Matrix — RE-VERIFIED

| Capability | Present | Evidence |
|---|---|---|
| `UseHsts()` / HTTPS enforcement | ✅ | `AddHsts`, `RequireHttpsMetadata = !IsDevelopment()` |
| `ForwardedHeaders` hardening | ✅ | Throws in Production if `TrustAllProxies=true` |
| CORS `AllowCredentials` in Production | ✅ | Scoped, with comment tying it to SignalR |
| Redis distributed rate limiting | ✅ | Boot throws in Production if Redis unconfigured |
| **Rate limit partition key** | ✅ **FIXED** | `RedisRateLimitPartitionKeyResolver.Resolve()` returns `user:{userId}:ip:{ip}` when authenticated, `ip:{ip}` when anonymous — **M-3 closed** |
| `AddOutputCache` + `UseOutputCache` | ✅ | Redis-backed |
| SignalR Redis backplane | ✅ | `AddStackExchangeRedis(...)` |
| **CSRF protection** | ⚠️ **wired but OFF** | `AddPropertyApiAntiforgery` (`Program.cs:125`) + `UseCookieCsrfProtection()` (`:586`), but `CookieCsrfOptions.Enabled = false` by default and `false` in every `appsettings` |
| Security headers middleware | ✅ | `AddPropertyApiSecurityHeaders` |
| `Console.WriteLine` DB leak | ✅ (fixed) | Patch-snapshot folders removed entirely |
| JSON casing | ⚠️ Still PascalCase | `PropertyNamingPolicy = null` (`Program.cs:301`) — deliberate (S-1) |

### 4.1 CSRF: why "off" is the correct state, and the trap in it

`CookieCsrfProtectionMiddleware` short-circuits unless `Enabled` **and** the request is
unsafe-method **and** an auth cookie is present. `CookieCsrfOptions` documents the reason
in-source: keep it disabled while the API authenticates with `Authorization: Bearer`
only. That is sound — CSRF exploits ambient cookie credentials, and there are none.

The Angular client correspondingly sends **no** `X-XSRF-TOKEN` header (verified: zero
matches for `csrf|xsrf|antiforgery` across the frontend source).

⚠️ **The trap:** these two states are coupled and neither side knows it. Enabling
`CookieCsrf:Enabled` without simultaneously teaching the frontend to fetch
`GET /api/security/csrf-token` and echo the header will make **every write request fail**
— and it will fail at the middleware, before any controller, so the failure will not look
like a CSRF problem. If browser cookie auth is ever introduced, both sides change in one
change.

---

## 5. What Works Correctly (Verified Strengths)

### 5.1 Security subsystems
Refresh tokens SHA-256 hashed with atomic rotation; OTP HMAC-SHA-256 with
`CryptographicOperations.FixedTimeEquals` and attempt limits; full `[EnableRateLimiting]`
attribute coverage on auth endpoints, enforced by `RateLimitingGuardTests`; real Twilio
SMS with boot-time validation; encrypted user fields via Data Protection; audit logging;
security headers.

### 5.2 PostGIS geo-search
GIST index + `ST_DWithin`, radius capped at 50 km, `COUNT(*) OVER()` single-round-trip
pagination, fully parameterized raw SQL.

### 5.3 Text search — `pg_trgm` GIN indexes in place
Trigram GIN on `City` and `Region` plus a partial index on `(Status, IsPublished,
CreatedAt)`. Correct fix for leading-wildcard `ILIKE`, properly applied.

### 5.4 Operational maturity — new since v4, and substantial
`docs/operations/` and `docs/observability/` carry an SLO definition, alert-response and
telemetry-failure runbooks, a metric-cardinality policy, database backup/restore and
migration-recovery runbooks, an application rollback runbook, a Redis failure/failover
runbook with an HA architecture and an explicit production-readiness decision, and a
**dated recovery-drill evidence file (2026-07-28)**. Dedicated `Observability`,
`Performance`, `Concurrency`, and `StagingSmoke` test projects back this.

v4's operational warning — "confirm the incident runbook covers Redis outage as a
distinct failure mode" — is **satisfied**: `redis-failure-and-failover-runbook.md` and
`redis-failure-policy.md` exist.

---

## 6. Open Defects (re-prioritized after v5 verification)

### 6.1 H-4 / S-2 — Frontend token storage: **ANSWERED**, partially open

Read from `src/app/core/services/token-storage.service.ts`:

| Item | Storage | Assessment |
|---|---|---|
| Access token | private in-memory field only | ✅ Correct — never persisted |
| **Refresh token** | **`sessionStorage`** key `wohnungsapp_refresh` | ⚠️ **XSS-readable. Not an HttpOnly cookie.** |
| "Remember me" flag | `localStorage` key `wohnungsapp_remember` | See F-1 below |

**Verdict: open, materially mitigated.** Keeping the access token out of storage removes
the most-stolen credential from reach. But one XSS gives an attacker a refresh token — a
renewable session, not a 15-minute one. Moving the refresh token to an HttpOnly,
`SameSite=Strict`, `Secure` cookie is the real fix, and it is a **backend change too**
(`/auth/refresh` must read the cookie, and CSRF protection must then be enabled — §4.1).

Do not mark this resolved on the strength of "access token is in memory". That is half
the finding.

### 6.2 New findings from the v5 cross-source review

| ID | Location | Issue | Severity |
|---|---|---|---|
| **N-1** | `OperationalController.BuildInfo` | `[AllowAnonymous]`, **not environment-gated**, and approved in `PublicEndpointPolicyTests`. Returns environment name, commit SHA, deployment version, applied/pending migration counts and latest migration name, PostGIS availability, and `Staging:*` isolation markers — to any unauthenticated caller in **Production**. Standard build/infrastructure disclosure; it hands an attacker exact schema-version and deploy fingerprints for free. Deliberate as an ops surface, but the anonymity is the questionable half, not the endpoint. **Fix:** require an ops API key or network-restrict it, or gate the response detail to non-Production. | Low-Medium |
| **F-1** | `token-storage.service.ts` | "Remember me" writes a persistent flag to `localStorage` while the refresh token always goes to `sessionStorage`. After the tab closes the flag survives and the token does not — the feature does not do what its name promises. Functional bug, not a security one. | Low |
| **F-2** | Angular app config | `@angular/service-worker` is a dependency and `ngsw-config.json` exists, but there is **no** `provideServiceWorker(...)` and no `serviceWorker` entry in `angular.json`. The PWA layer is orphaned config, and the `/offline` route has no caching mechanism behind it. | Low |

### 6.3 Resolved since v4

| ID | Issue | Status |
|---|---|---|
| **M-3** | IP-only rate-limit partitioning | ✅ **RESOLVED** — `user:{id}:ip:{ip}` for authenticated requests |
| **OPS-1** | `security-patch/` / `dbkeys_patch/` in deployment artifacts | ✅ **RESOLVED** — folders no longer exist |
| **OPS-2** | Redis outage not covered as a distinct failure mode | ✅ **RESOLVED** — dedicated failover runbook + policy + HA doc |

### 6.4 Strategic (documented, not blocking)

| ID | Issue | Status |
|---|---|---|
| S-1 | JSON PascalCase (`PropertyNamingPolicy = null`) | Confirmed unchanged. The frontend pays it via `apiToCamelCase()` in **15 files**. Compounding wrinkle now verified: `ExceptionHandlingMiddleware` serializes **error** bodies as camelCase, so success and error payloads use *different* casing conventions on the same API. Revisit before any public API or third-party integration. |

---

## 7. v4 Claims vs. v5 Verified Reality

| Item | v4 said | v5 verified |
|---|---|---|
| M-3 (IP-only rate limiting) | Still open — real gap | **Resolved** — user+IP partitioning |
| H-4/S-2 (token storage) | Unverifiable — no frontend | **Answered** — memory ✅ / `sessionStorage` ⚠️, open |
| Controllers | 15, zero use `AppDbContext` | **23**, three ops/diagnostic controllers use it (two hard-gated) |
| Test projects | 4 | **8** |
| CSRF | "✅ present" | Present but **disabled by default**, correctly so — the qualifier was missing |
| `security-patch/` risk | Open operational flag | **Gone** — folders removed |
| Redis outage runbook | "Confirm it exists" | **Exists** — plus HA architecture and readiness decision |
| Visit booking Angular page | Unknown | **Built** — `features/visits` + `visit.service.ts` |
| User profile image edit | ⚠️ Partial | **Built** — `POST /api/Users/me/avatar` + frontend |
| S-1 (JSON casing) | Still open, strategic | **Still open**, and worse than described (mixed casing) |

---

## 8. Key Decisions and Patterns (carried forward, re-checked)

### 8.1 Positional Records Rule
```csharp
// WRONG
var cmd = new MyCommand { PropertyId = x, Title = y };
// CORRECT
var cmd = new MyCommand(PropertyId: x, Title: y);
```

### 8.2 PowerShell compatibility (ALL scripts)
Never `&&`, `||`, `2>/dev/null`. Use `-and`, `-or`, `$null`, `$?`.

### 8.3 Cloudinary SDK layer rule
`CloudinaryDotNet` stays in Infrastructure only.

### 8.4 Supabase/Render deployment
`DATABASE_URL` with real credentials, `SSL Mode=Require`, **port 5432 (Session Mode)** —
not 6543/Transaction Mode, which breaks EF Core prepared statements. `MaxPoolSize=20`.

### 8.5 `IPropertyReadRepository` decoupling pattern
Still the correct approach for Bookings/Reviews needing read-only Property data without
full cross-module coupling.

### 8.6 New public endpoints must be registered twice
Adding `[AllowAnonymous]` is not enough: `Program.cs` sets a deny-by-default
`FallbackPolicy`, and `PublicEndpointPolicyTests.ApprovedAnonymousEndpoints` must list
the action or **the build fails**. This is a feature — it forces every anonymous surface
through review. N-1 above is what it looks like when an entry passes that review on
convenience grounds.

---

## 9. What Has NOT Been Built (verified against both sources)

| Feature | Status | Evidence |
|---|---|---|
| Payment (Stripe/PayTabs/Paymob) | ❌ Not built | Zero matches for `subscription\|billing\|invoice\|stripe\|paytabs\|paymob` in all four backend projects |
| Subscriptions / plans (`GET /api/plans`) | ❌ Not built | No `PlansController`. Frontend `/pricing` renders a **local** catalog; contract documented in `FRONTEND_BACKEND_CONTRACT.md §11` |
| Free-listing expiry cycle (3-month validity, alert, paid extension, deletion) | ✅ **Built 2026-08-23** | See §9.1 |
| Payment gateway for the extension fee | ❌ Not built | The fee is recorded `Pending` and settled by an admin confirmation. No Stripe/PayTabs/Paymob |
| Featured placement in search | ❌ Dead fields | `Property.IsFeatured` / `FeaturedUntil` declared (`Property.cs:210-211`) + one index in `PropertyConfiguration.cs:210`; **no code reads or writes them** |
| Agency / multi-tenant, agent & staff seats | ❌ Not in the domain | Zero `Agency` matches. `Property.AgentId` is a single FK to `UserAccount`. `عقار-تيك §9` requires an independent Design Spike first |
| Verified Properties/Agents | ❌ Not built | — |
| Video for properties | ❌ Not built | Zero matches in Domain/Application |
| 2FA (TOTP) | ❌ Not built | Only Identity's scaffolded `TwoFactorEnabled` column; phone OTP covers the use case |
| Push notifications (FCM) | ❌ Not built | Zero `firebase\|fcm` matches |
| Visit booking Angular page | ✅ **Built** | `features/visits` + `core/api/visit.service.ts` |
| User profile image edit | ✅ **Built** | `UsersController` `POST me/avatar` + frontend `users/me/avatar` |

### 9.1 Free-listing lifecycle — built 2026-08-23

**Correction to the row this section replaces.** The v5 gap list, and the frontend contract
doc it was derived from, claimed there was "no `ExpiresAt` on Property, no scheduler, no
notification producer". Two of those three were wrong, and were wrong because they were
carried forward from a session where the backend source was not on hand:

- `Property.ExpiresAt` has existed since the **initial migration**, and
  `PublishPropertyCommandHandler` has always stamped it with a 90-day window on publish.
- `PropertyRepository` has always excluded elapsed listings from search
  (`ExpiresAt == null || ExpiresAt > now`), in both the paged and the by-id read paths.
- A notification **producer** existed too: `INotificationService` plus
  `SavedSearchMatchHostedService`, which is a working precedent for exactly this kind of job.

What was genuinely missing was everything *after* the date passes. A listing went quiet and
stayed quiet: `Status` still read `Available`, the owner was never told, and nothing ever
cleaned it up. The date filter made a listing invisible; nothing made expiry an event.

**Policy — one source of truth:** `PropertyApi.Domain/Listings/ListingLifecyclePolicy.cs`

| Term | Value |
|---|---|
| Publication period (and the length one extension buys) | 90 days |
| Warning lead time | 7 days |
| Grace period after expiry, before deletion | 30 days |
| Free-tier active-listing limit | **1** |
| Single-listing extension fee | **$1.00 USD** |

**What was added:**

| Piece | Location |
|---|---|
| `PropertyStatus.Expired` (stored as the string `"Expired"`) | `Domain/Enums/PropertyStatus.cs` |
| `NotificationType.ListingExpiringSoon` / `ListingExpired` | `Domain/Notifications/Enums/NotificationType.cs` |
| `TransactionType.ListingExtensionFee` | `Domain/Transactions/Enums/TransactionType.cs` |
| `Property.ExpiryWarningSentAt` + `MarkExpired()` / `ExtendPublication()` / `MarkExpiredListingDeletedBySystem()` | `Domain/Listings/Entities/Property.cs` |
| Three-phase sweep (warn → expire → delete), every 6h, 200 rows per phase per run | `Infrastructure/Listings/ListingExpiryHostedService.cs` |
| Arabic expiry notifications (persist + SignalR push) | `Infrastructure/Notifications/NotificationService.cs` |
| Free-tier quota enforcement | `Application/Listings/Commands/CreateProperty/CreatePropertyCommandHandler.cs` |
| `POST /api/properties/{id}/extension` → 202 + quote | `RequestListingExtensionCommandHandler` |
| `POST /api/properties/extension/{transactionId}/confirm` → admin-only | `ConfirmListingExtensionPaymentCommandHandler` |
| Migration `20260823183821_AddListingExpiryWarningStamp` | one nullable column + two indexes, fully reversible |
| 16 tests | `tests/PropertyApi.Application.Tests/Listings/ListingLifecycleTests.cs` |

**Deletion is soft, deliberately.** `MarkExpiredListingDeletedBySystem()` sets the same
`IsDeleted` flag the global query filter already honours, so the listing disappears from
every read path while the row survives for audit and recovery. Nothing in this codebase
physically removes a `Property` — repository `Remove()` is itself intercepted and converted
to `IsDeleted=true` — and an unattended sweep is the last place to break that.

**Two things a reader must not misread as finished:**

1. **There is still no payment gateway.** `RequestListingExtension` records a `Pending`
   `Transaction` and stops; it does **not** extend the listing. The extension is granted
   only by `ConfirmListingExtensionPayment`, which is admin-only. If that handler ever
   moves behind an owner-callable endpoint, the fee becomes optional and every owner gets a
   free extension. That single seam is where a gateway callback plugs in.
2. **There is still no Subscription entity**, so nothing can ask which plan a user is on.
   Every account is therefore treated as free tier, and the limit of 1 applies to all of
   them. Existing owners keep every listing they already have — nothing is removed
   retroactively — but cannot create another until they are back under the limit.

**Known follow-up:** the sweep's own query predicates are untested. `RunOnceAsync` is
`internal`, matching `SavedSearchMatchHostedService`, and this solution has no
`InternalsVisibleTo` anywhere; adding one is a cross-cutting convention change that was
left for the maintainers rather than made unilaterally. The destructive decisions the sweep
relies on **are** tested at the domain level (`ListingLifecycleTests`).

---

## 10. Final Architectural Decision

### ⚠️ SUITABLE WITH CONDITIONS

**Why not "Not Suitable":** the Clean Architecture skeleton is correct and enforced by
seven guard test suites; the security roadmap has shipped; and the operational layer —
SLOs, runbooks, a dated recovery drill, Redis HA, coverage and production gates — is more
mature than most projects at this stage. **Both v4 conditions #1 and #3 are now met.**

**Why not "Suitable":** the one item v4 could not assess turns out to be a real, open
gap (refresh token in `sessionStorage`), and it is the kind that cannot be closed on one
side alone — it needs a coordinated backend + frontend + CSRF change. A second, smaller
disclosure surface (N-1) is live in Production today.

**The conditions, updated:**

1. ~~Fix rate-limit partitioning~~ ✅ **DONE** (`user:{id}:ip:{ip}`).
2. **Move the refresh token to an HttpOnly / `SameSite=Strict` / `Secure` cookie.** This
   is now a *specified* task, not an audit: backend accepts the cookie at
   `/auth/refresh`, `CookieCsrf:Enabled` flips to `true`, and the frontend starts
   fetching and echoing the CSRF token. All three land together or the app breaks.
3. ~~Confirm patch folders excluded from deployment~~ ✅ **DONE** (folders removed).
4. **Restrict `GET /api/operational/build-info`** — ops key, network restriction, or
   reduced detail outside Staging.
5. **Re-verify this document at the next significant deployment cycle.** v4 held for
   roughly seven weeks before its controller count, test-project count, and headline CQRS
   claim all went stale. Assume the same half-life.

---

*This document reflects direct static inspection of the live PropertyApi repository at
commit `b3d0d0b` and the live Angular source, on 2026-08-23. Claims that could not be
verified in code are marked as such rather than carried forward from prior revisions.
Frontend detail lives in `FRONTEND-REFERENCE.md`; the API contract lives in
`FRONTEND_BACKEND_CONTRACT.md`.*
