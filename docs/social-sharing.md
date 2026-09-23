# Social Sharing & Distribution

Lets a visitor share a public property listing via the device's native share sheet, Facebook,
WhatsApp, Telegram, Instagram (via the native share sheet), or a copied link — with correct
Open Graph/Twitter Card metadata for social crawlers, and lightweight, privacy-conscious
tracking of successful shares.

## Where things live

```
src/app/core/sharing/
  share.model.ts                     SharePlatform, ShareableContent, ShareResult, ShareProvider
  property-share-url.service.ts      the ONLY place the canonical public URL is built
  property-share-content.service.ts  builds the WhatsApp/Telegram message text + OG description
  property-meta.service.ts           applies <title>/OG/Twitter/canonical tags for a property
  social-share.service.ts            orchestrates providers + tracking — the single entry point
  property-share-tracking.service.ts fire-and-forget POST of a successful share event
  share-sheet-coordinator.service.ts ensures only one share sheet is open app-wide
  providers/
    facebook-share.provider.ts
    whatsapp-share.provider.ts
    telegram-share.provider.ts
    native-share.provider.ts         Web Share API
    instagram-share.provider.ts      delegates to native-share.provider.ts (see below)
    copy-link.provider.ts

src/app/core/api/property-share-events-api.service.ts   POST /api/properties/{id}/share-events

src/app/shared/ui/property-share-button.component.ts    the ONLY UI piece a page adds

netlify/edge-functions/
  social-crawler-meta.mjs            pre-renders OG/Twitter tags for known crawlers (see below)
  lib/social-crawler.mjs             its pure, unit-tested logic
```

Backend (PropertyApi, separate repo):
- `PropertyApi.Domain/Listings/Entities/PropertyShareEvent.cs` + `SharePlatform` enum
- `PropertyApi.Application/Listings/Commands/TrackPropertyShareEvent/*`
- `POST /api/properties/{id}/share-events` on `PropertiesController`

## Architecture

`PropertyDetailPage` (or any future page) only ever does:

```html
<app-property-share-button [property]="p"></app-property-share-button>
```

That component owns the trigger button, the share sheet, and calling `SocialShareService` — the
page never touches `SharePlatform`, `encodeURIComponent`, the Web Share API, or the Clipboard
API. `SocialShareService.getAvailableProviders(property)` returns whichever `ShareProvider`s are
both (a) available in the current browser/environment and (b) applicable to this property (empty
when the property isn't public — see `PropertyShareUrlService.canShare`), and the sheet just
renders whatever that list contains.

### Canonical URL

`PropertyShareUrlService.getPropertyPublicUrl(property)` is the **only** place in the whole
frontend that builds a property's public URL
(`https://hudhudnest.com/properties/{id}`). Every provider, `PropertyMetaService`, and the
Netlify Edge Function all either call it directly or receive its output — none of them build or
repeat that URL themselves. It returns `null` (never a best-effort/partial URL) for a property
that isn't public right now, and every caller treats `null` as "hide/disable sharing", not as
something to fall back from.

**Documented decision — no `slug`/`publicId` field exists yet.** The `Property` model (frontend
and backend) has only an internal `Id` (GUID) — no `slug`/`publicId`. It's already the identifier
used in the existing `/properties/:id` route and in every property API call, and it isn't
sensitive, so reusing it as the public share identifier is safe and required no data migration.
If a `slug`/`publicId` field is added later, `PropertyShareUrlService.getPropertyPublicUrl` is
the one function that needs to change — nothing else.

The site origin comes from `environment.siteUrl` (production:
`https://hudhudnest.com`, staging: `https://staging--hudhudnest.netlify.app`),
configurable via a `SITE_URL` build-time env var exactly like `API_URL`/`BASE_URL` already are
(see `tools/generate-env.mjs`). Local dev has no public domain, so it deliberately falls back to
`window.location.origin` at runtime rather than a hardcoded default.

### Metadata (Section 6) — and why the Edge Function exists

This project is a **pure client-side Angular SPA** — confirmed by there being no `@angular/ssr` /
`@angular/platform-server` dependency and no server bundle anywhere in the build. There is no
SSR and no prerendering.

`PropertyMetaService.applyTo(property)` (called from `PropertyDetailPage` once a property loads)
sets `<title>`, `og:*`, `twitter:*`, and `<link rel="canonical">` correctly for a real browser —
but only **after** the JS bundle has already run. Facebook's and WhatsApp's crawlers do not
execute JavaScript at all when unfurling a link; several others do so unreliably. Relying on
`PropertyMetaService` alone would fail the feature's own acceptance criteria (metadata must be
present in the *initial* HTML for crawlers).

**The fix**: `netlify/edge-functions/social-crawler-meta.mjs`, a Netlify Edge Function (Deno)
that runs in front of `/properties/*`. It inspects the request's User-Agent:
- a **known crawler** (Facebook, WhatsApp, Telegram, Twitter/X, LinkedIn, Slack, Discord,
  Pinterest, Skype, Reddit, Apple, Google, Bing, Yandex, …) → fetches the property from the real
  backend API and returns a small, complete HTML document with the same tags
  `PropertyMetaService` would set, built by the same rules as
  `PropertyShareContentService.buildMetaDescription` (intentionally re-implemented in plain JS —
  see the file header for why it can't literally import the Angular service).
- **anyone else** (real visitors, unrecognized bots) → `context.next()`, i.e. the normal Angular
  `index.html`, completely untouched.

This needed no `netlify.toml` change: the function declares its own route via
`export const config = { path: '/properties/*' }` in the file itself (Netlify's supported
alternative to a `[[edge_functions]]` block), so the existing, already-fixed `netlify.toml` (see
the `frontend-repo-location` deployment notes) is left exactly as-is.

It reads the backend origin from the **same** `API_URL` Netlify environment variable already
configured per branch for the Angular build itself — no new environment variable to manage.

An unpublished/deleted/expired property (backend 404) gets a minimal, `noindex`,
property-**agnostic** document — no metadata about that listing is ever generated or leaked.

**Verification limits, stated plainly**: this repo/sandbox has no `deno`/`netlify` CLI
available, so the Deno/Netlify runtime glue (`context.next()`, `Netlify.env.get`, real edge
routing) could not be executed against the actual Netlify edge runtime. What *was* verified for
real:
- `netlify/edge-functions/lib/social-crawler.mjs` (crawler detection, HTML building, sanitization)
  — plain JS, run with `node --test netlify/edge-functions/lib` (17 tests, all passing).
- `netlify/edge-functions/social-crawler-meta.mjs`'s actual handler — run under plain Node with
  only the one Netlify-specific global (`Netlify.env.get`) stubbed; everything else
  (`Request`/`Response`/`URL`/`fetch`) is standard Fetch API, so this genuinely exercises the
  real file. `node --test netlify/edge-functions/lib/social-crawler-meta.test.mjs` (5 tests, all
  passing) — lives in `lib/` (moved 2026-09-13) so Netlify's directory-based edge function
  auto-discovery, which scans only the top level of `netlify/edge-functions/`, doesn't try to
  bundle this test file as a deployable function. Combined: `npm run test:edge-functions`.

Before relying on this in production, confirm it against the real Netlify edge runtime with
`netlify dev` (or a deploy preview) — e.g. `curl -A "facebookexternalhit/1.1"
https://<preview-url>/properties/<a real published id>` and check the returned HTML's `<meta
property="og:...">` tags, then Facebook's own [Sharing Debugger](https://developers.facebook.com/tools/debug/)
against the real deployed URL.

### Web Share API (`NativeShareProvider`)

Wraps `navigator.share`. Works in supporting browsers **and inside the Capacitor WebView** on
modern Android/iOS — no Capacitor plugin is required today (Chrome-based WebView and WKWebView
both implement it). `isAvailable()` gates whether the button/option is even shown. A user
dismissing the native share sheet rejects with `AbortError`, which is mapped to
`{ cancelled: true }` — never surfaced as an error toast.

The provider interface is deliberately identical to every other `ShareProvider`, so it can be
swapped later for one backed by `@capacitor/share` (guaranteed native behavior on older
WebViews) by changing **only** `native-share.provider.ts` — `SocialShareService` and the UI
would not need to change.

### Instagram

Instagram has no official web share/publish API — there is no equivalent of Facebook's
`sharer.php` or Telegram's share widget, and this feature deliberately does not call any
unofficial/private endpoint. `InstagramShareProvider` is only ever available when
`NativeShareProvider` is (the one honest path: the person picks Instagram themselves from their
device's own share sheet), and it delegates to it — tracked as `SharePlatform.Other`, not
`Native`, so analytics can still tell the two entry points apart. When Web Share API isn't
supported, the Instagram button is hidden entirely — never shown disabled or faked.

### Copy Link

`CopyLinkProvider` copies **only** the canonical URL — never the whole message, never an
internal route — via `navigator.clipboard.writeText`, falling back to a
`document.execCommand('copy')` textarea trick for browsers/contexts without the Clipboard API
(or where it rejects, e.g. a permission prompt denial).

### Tracking (Section 11)

`PropertyShareTrackingService.recordSuccess(propertyId, platform)` is fire-and-forget: it is only
ever called by `SocialShareService` **after** a provider reports `success: true`, its
`Observable` is subscribed with both `next`/`error` swallowed, and it returns `void` — a
tracking failure (404, 429, network error) can structurally never surface as a share failure to
the user, and a cancelled/failed share can structurally never record a "success" event, because
`SocialShareService.shareVia` only calls it inside the `if (result.success)` branch.

Backend: `POST /api/properties/{id}/share-events`, anonymous (`UserId` attached only when a
valid access token happens to be present — most sharers aren't logged in), rate-limited
(`property-share-events`, 20/min per client), and independently re-validates the listing is
still published/unexpired (`IPropertyRepository.IsPubliclyVisibleAsync`) before writing anything
— a client claiming a share happened proves nothing by itself. No message content, no social
handles, no access tokens, no IP address are ever stored — see `PropertyShareEvent`'s doc
comment on the backend.

## Adding a new sharing platform

1. Create `src/app/core/sharing/providers/<platform>-share.provider.ts` implementing
   `ShareProvider` (`platform`, `labelKey`, `isAvailable()`, `share(content)`).
2. Add the platform to `SharePlatform` in **both** `share.model.ts` (frontend) and
   `PropertyApi.Domain.Listings.Enums.SharePlatform` (backend) — keep the string values in sync,
   they travel over the wire in the share-events POST body.
3. Register the provider in `SocialShareService`'s `providers` array (constructor-injected like
   the others).
4. Add its `labelKey` strings to `public/i18n/{ar,en,de}.json` under `SHARE`.
5. Add one entry to `SHARE_PLATFORM_UTM_SOURCE`/`SHARE_PLATFORM_UTM_MEDIUM` in
   `utm-platform-mapping.ts` — this is the ONLY place a UTM default is hardcoded; without it the
   platform silently falls back to `utm_source=other`/`utm_medium=social`.
6. `PropertyShareButtonComponent` needs **no changes** — it already renders whatever
   `getAvailableProviders()` returns, and `SocialShareService.shareVia()` attributes the URL for
   every provider uniformly.
7. Add a unit spec mirroring any existing `providers/*.spec.ts` file.

## Testing

- Frontend unit/component tests: `npm run test:ci` (Karma/Jasmine) — covers every provider, the
  URL/content/meta services, `SocialShareService`, `PropertyShareButtonComponent`, the
  `PropertyShareEventsApiService`/`PropertyAttributionEventsApiService` HTTP contracts, and the
  full UTM/Attribution layer (`UtmAttributionService`, `AttributionContextService`,
  `PropertyAttributionTrackingService`).
- Edge Function tests: `npm run test:edge-functions` (plain Node, no extra dependency).
- Backend unit tests: `dotnet test tests/PropertyApi.Application.Tests` — covers
  `PropertyShareEvent`/`PropertyAttributionEvent` (the domain entities) and their
  `TrackPropertyShareEventCommandHandler`/`TrackPropertyAttributionEventCommandHandler`.
- `dotnet test tests/PropertyApi.Architecture.Tests` — enforces that both new anonymous endpoints
  is deliberately approved (`PublicEndpointPolicyTests`) and that the EF model has no pending,
  un-migrated changes.

## UTM Attribution (Phase 2)

Every external share now carries UTM parameters so a visit/contact/lead can be traced back to
the platform it came from: `Facebook → Property → Visit → Contact`.

```
src/app/core/sharing/
  utm-attribution.model.ts        AttributionContext, AttributionUrlOptions
  utm-platform-mapping.ts         the ONLY place utm_source/utm_medium defaults are hardcoded
  utm-attribution.service.ts      builds/parses attributed URLs — no UI, no HTTP, no component
  attribution-context.service.ts  captures + stores first/last-touch attribution (localStorage)
  property-attribution-event.model.ts   PropertyAttributionEventType (View/Contact/Lead/...)
  property-attribution-tracking.service.ts  fire-and-forget view/contact/lead tracking

src/app/core/api/property-attribution-events-api.service.ts   POST /properties/{id}/attribution-events
```

Backend (PropertyApi): `PropertyShareEvent` gained four optional `Utm*` columns; a new sibling
table/entity `PropertyAttributionEvent` (+ `PropertyAttributionEventType` enum) records what
happens *after* a share — `POST /api/properties/{id}/attribution-events`, anonymous, rate-limited
(`property-attribution-events`), independently re-validates the listing is still public.

### Canonical URL vs. attributed URL

`PropertyShareUrlService.getPropertyPublicUrl()` never changes — it stays the plain, UTM-free
URL used for `og:url`/`<link rel="canonical">` (via `PropertyMetaService`, which never imports
`UtmAttributionService`) and for the Netlify Edge Function's crawler HTML. `SocialShareService.
shareVia()` separately asks `UtmAttributionService.buildAttributedPropertyUrl()` for a
platform-specific URL — the canonical URL with `utm_source`/`utm_medium`/`utm_campaign`/
`utm_content` appended via `URLSearchParams` — and that attributed URL is what every provider
(Facebook, WhatsApp, Telegram, Native, Copy Link) actually opens or copies. The two URLs are
never the same value on purpose.

### Default UTM values (utm-platform-mapping.ts)

| Platform  | utm_source | utm_medium | utm_campaign     | utm_content              |
|-----------|------------|------------|-------------------|--------------------------|
| Facebook  | facebook   | social     | property_share    | property_{id}            |
| WhatsApp  | whatsapp   | social     | property_share    | property_{id}            |
| Telegram  | telegram   | social     | property_share    | property_{id}            |
| Native    | native     | social     | property_share    | property_{id}            |
| Copy Link | copy_link  | **referral** | property_share  | property_{id}            |
| Instagram/Other | other| social     | property_share    | property_{id}            |

**Documented decision — Copy Link is `referral`, not `social`.** Tapping "Copy Link" doesn't post
anything to a social network by itself; the link is only distributed once the visitor pastes it
somewhere else (SMS, email, another app) — exactly what `utm_medium=referral` conventionally
means. `utm_content` reuses the property's existing public `Id` (same "no slug field" decision as
Phase 1's canonical URL) as `property_{id}` — stable, non-personal, safe as a report dimension.

### Capturing attribution on landing

Wired at the app root (`AppComponent`, on every `Router` `NavigationEnd`), **not** inside
`PropertyDetailPage` — a shared property link is the common case today, but capture is a
whole-app concern. `AttributionContextService.captureFromUrl()` parses `utm_*` via
`UtmAttributionService.parseAttributionFromUrl()`; a *valid* `utm_source` is stored as the new
last-touch (first-touch is seeded once and kept alongside it — **last non-direct-click
attribution with first-touch retained**, the spec's documented default). A direct visit (no/
invalid `utm_source`) never overwrites existing attribution and never fabricates one.

Storage is first-party `localStorage` only (never a cookie, never third-party storage) with an
in-memory fallback for when it's unavailable (private browsing, a locked-down WebView) — so
attribution still works for the rest of that page session even then. **Attribution window: 30
days** (one constant in `attribution-context.service.ts`), after which stored attribution is
treated as expired/direct until a new `utm_source` is captured. The visible URL's `utm_*`
parameters are stripped via `history.replaceState` after capture (cosmetic only — capture has
already happened, and no other query parameter is touched).

### Tracking the funnel

- **Share** (`PropertyShareEvent`, existing table): now also carries `UtmSource/Medium/Campaign/
  Content` — the UTM context of the attributed link that was actually opened/copied, computed by
  `UtmAttributionService.getDefaultContext()` and passed by `SocialShareService.shareVia()` only
  after `provider.share()` reports success (unchanged Phase-1 rule).
- **View** (`PropertyAttributionEvent`, `EventType=View`): fired once per property per page
  session from `PropertyDetailPage.loadProperty()`'s success callback — never from the Share
  button. De-duplicated in `PropertyAttributionTrackingService` (an in-memory `Set`) so OnPush
  re-renders or navigating back within the same session don't double-count a view.
  `getContext()` (the *current* last-touch, possibly `null` for a direct visit) is attached.
- **Contact/Lead** (`PropertyAttributionEvent`, `EventType=PhoneClick/MessageSent/
  VisitRequestCreated`): fired from the property detail page's existing phone `tel:` link,
  `sendMessage()`'s success callback, and `submitVisit()`'s success callback respectively — none
  of these events are de-duplicated (two real messages or two real calls are two real actions).

**Documented decision — no dedicated `Lead` entity for this phase.** This product's closest
equivalent to a marketing "Lead" is a visit/viewing request (`VisitService.requestVisit`), so
`PropertyAttributionEventType.VisitRequestCreated` is what section 15's `property_lead_created`
maps to. A pre-launch, unrelated `Lead`/`Offer` marketing-funnel model already exists in this
codebase (`PropertyApi.Domain.Marketing.Entities.Lead`, behind `MarketingEventsController`) — it
is a different bounded context (landing-page waitlist capture, keyed by email, no `PropertyId`)
and was deliberately **not** reused or widened for this feature, matching that controller's own
documented rationale for not sharing a name/table with `AnalyticsController` either. Reusing it
here would have required bolting an unrelated `PropertyId`/UTM-event shape onto a table designed
around `LeadId`/`OfferId` foreign keys for a different feature entirely.

**Documented decision — Messages/VisitRequest backend entities were not modified.** Rather than
adding optional Attribution fields onto the existing, already-shipped `Message`/`VisitRequest`
write paths (touching two unrelated, previously-stable features), attribution is recorded as its
own event, in its own new table (`PropertyAttributionEvent`), fired *alongside* the existing
success path — zero risk of regressing message-sending or visit-request creation.

### Privacy & validation

Every `Utm*` value (frontend and backend) is independently trimmed, lowercased, length-capped at
60 characters, and restricted to `[a-zA-Z0-9_.-]` — an invalid individual field is dropped
(stored as `null`), never used to reject the whole event (`PropertyShareEvent.
SanitizeUtmField`/`UtmAttributionService`'s private sanitizer implement the identical rule on
each side, so a value accepted client-side is guaranteed to survive server-side storage
unchanged). No PII, no access tokens, no message content, no IP address, no phone/email is ever
part of a UTM value or an attribution event. `UserId` stays optional everywhere. A tracking
failure (network error, 404, 429) never blocks sharing, viewing, messaging, or requesting a
visit — every tracking call is fire-and-forget with `next`/`error` both swallowed.

## Known limitations

- **Instagram**: no direct publish, no official web API — native share sheet or nothing (see
  above). This is a platform limitation, not something this implementation could work around.
- **Web Share API support**: not universal (notably absent on desktop Firefox at the time of
  writing) — `NativeShareProvider.isAvailable()` hides it there, and `getAvailableProviders()`
  always includes Facebook/WhatsApp/Telegram/Copy Link (all plain link-openers, so they work
  everywhere) as the fallback.
- **Social crawlers**: covered by the Edge Function above, verified via unit tests only in this
  session (no `deno`/`netlify` CLI available) — needs a real `netlify dev`/deploy-preview check
  plus Facebook's Sharing Debugger before this is considered fully confirmed in production.
- **Capacitor**: `NativeShareProvider` should work unmodified in the Android/iOS WebView on
  modern OS versions; it was not device-tested in this session (no physical/emulator device
  available). If it ever doesn't behave as expected on an older WebView, swap in
  `@capacitor/share` inside `native-share.provider.ts` only.
