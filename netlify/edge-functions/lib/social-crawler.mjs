// =============================================================
// netlify/edge-functions/lib/social-crawler.mjs
//
// Pure logic for the Social Sharing & Distribution crawler responder — deliberately plain
// JavaScript with no Deno-specific or Node-specific API, so the exact same file:
//   - runs unmodified inside the real Netlify Edge Function (Deno) — see
//     ../social-crawler-meta.mjs
//   - runs unmodified under plain `node` for real, fast, offline unit tests — see
//     ./social-crawler.test.mjs (run with `node --test netlify/edge-functions/lib`)
//
// This is intentionally NOT part of the Angular build (`src/`) — Netlify bundles Edge
// Functions itself, entirely separately from `ng build`, so keeping this out of `src/`
// avoids coupling the two build pipelines together for no benefit.
// =============================================================

/**
 * Known social link-unfurlers/preview-card generators that do not execute JavaScript (or do so
 * unreliably) and need pre-rendered HTML instead of the real SPA — see PropertyMetaService's doc
 * comment in the Angular app. Matched as a case-insensitive substring of the User-Agent header.
 *
 * Googlebot, Bingbot, and Yandex are deliberately NOT here (removed 2026-10, see
 * ARD-HudhudNest.md ADR-001-R and docs/social-sharing.md). They do execute JavaScript, and now
 * that the app routes with real paths instead of hash fragments, they can reach and render the
 * real Angular page exactly like a browser does — the same content a visitor sees, in full
 * (gallery, specs, amenities, nearby listings), not the thin title/description/one-link stand-in
 * this function returns. Serving search engines a substantially thinner document than real
 * visitors see is cloaking by Google's own definition, regardless of intent; that risk only
 * existed here because hash routing made the real page unreachable by a plain HTTP request in
 * the first place. A 404/unpublished property's noindex signal is now the SPA's own job (see
 * PropertyMetaService.markNotFound, wired into property-detail.page.ts's 404 handling) rather
 * than this function's buildNotFoundHtml, which still covers it for the crawlers below.
 *
 * Applebot stays: Apple does not operate a general web-ranking search index the way Google/Bing/
 * Yandex do — it's consumed for Siri Suggestions/Spotlight-style snippets, the same
 * preview-card-shaped use case as the social crawlers above, not full-page SEO indexing.
 */
const CRAWLER_USER_AGENT_SIGNATURES = [
  'facebookexternalhit',
  'facebookcatalog',
  'whatsapp',
  'telegrambot',
  'twitterbot',
  'linkedinbot',
  'slackbot',
  'discordbot',
  'pinterest',
  'skypeuripreview',
  'redditbot',
  'vkshare',
  'applebot',
  'embedly',
  'quora link preview',
  'outbrain',
  'nuzzel',
  'flipboard',
  'w3c_validator'
];

/**
 * Search-engine crawlers that execute JavaScript and therefore get the real SPA (see the note
 * above). Listed separately only so the edge function can give them a truthful HTTP status for a
 * property that no longer exists: the SPA shell is a 200 for every path, so Google would
 * otherwise only learn "not found" from a JS-injected noindex. The BODY they receive is
 * unchanged (the normal SPA shell) -- only the status differs, which is not cloaking.
 */
const SEARCH_ENGINE_USER_AGENT_SIGNATURES = [
  'googlebot',
  'google-inspectiontool',
  'adsbot-google',
  'bingbot',
  'bingpreview',
  'yandexbot',
  'duckduckbot',
  'baiduspider',
  'slurp'
];

export function isSearchEngineCrawlerUserAgent(userAgent) {
  if (!userAgent) {
    return false;
  }

  const normalized = userAgent.toLowerCase();
  return SEARCH_ENGINE_USER_AGENT_SIGNATURES.some(signature => normalized.includes(signature));
}

/** The one real production origin, and the hostnames that are aliases of the same deployment
 *  (old domain still attached to the Netlify site, the default *.netlify.app name, www). */
export const PRODUCTION_SITE_URL = 'https://hudhudnest.com';
const PRODUCTION_ALIAS_HOSTNAMES = new Set([
  'hudhudnest.com',
  'www.hudhudnest.com',
  'hudhudnest.netlify.app',
  'realestateworld.world',
  'www.realestateworld.world'
]);

/**
 * The origin to put in canonical/og:url. It used to be the request's own origin, which made a
 * page reached through an alias host (old domain, *.netlify.app) declare ITSELF canonical -- the
 * opposite of what an alias should do. Alias hosts now resolve to the production origin; any
 * other host (staging, deploy previews, local) keeps its own origin so previews still unfurl
 * correctly when tested there.
 */
export function resolveCanonicalOrigin(requestUrl) {
  const url = new URL(requestUrl);
  return PRODUCTION_ALIAS_HOSTNAMES.has(url.hostname) ? PRODUCTION_SITE_URL : url.origin;
}

export function isSocialCrawlerUserAgent(userAgent) {
  if (!userAgent) {
    return false;
  }

  const normalized = userAgent.toLowerCase();
  return CRAWLER_USER_AGENT_SIGNATURES.some(signature => normalized.includes(signature));
}

/** Extracts the property id from a request path like "/properties/<id>" or
 *  "/properties/<id>/". Returns null for anything else (nested paths, other routes). */
export function extractPropertyIdFromPath(pathname) {
  const match = /^\/properties\/([^/]+)\/?$/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

/** Strips HTML markup and collapses whitespace — the same defensive sanitization
 *  PropertyMetaService.sanitize() applies on the Angular side, reimplemented here since this
 *  file cannot import Angular/TypeScript code (see the file header). Keep the two in sync if
 *  either changes. */
export function sanitizeText(value) {
  return String(value ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const MAX_SUMMARY_LENGTH = 160;

/** The preview languages. Arabic is the original and the default for a link that names none. */
export const SHARE_LANGUAGES = ['ar', 'en', 'de'];

const SHARE_TEXT = {
  ar: {
    dir: 'rtl',
    locale: 'ar_SY',
    siteName: 'هدهد نيست',
    squareMeter: 'م²',
    rooms: n => `${n} غرف`,
    defaultTitle: 'تفاصيل العقار',
    percent: v => `خصم ${v}%`,
    fixed: v => `خصم ${v}$`,
    freeMonths: v => (v === 1 ? 'شهر مجاني' : `${v} أشهر مجانية`),
    unavailableTitle: 'الإعلان غير متاح',
    unavailableBody: 'هذا الإعلان لم يعد متاحاً.'
  },
  en: {
    dir: 'ltr',
    locale: 'en_US',
    siteName: 'HudhudNest',
    squareMeter: 'm²',
    rooms: n => `${n} ${Number(n) === 1 ? 'room' : 'rooms'}`,
    defaultTitle: 'Property details',
    percent: v => `${v}% off`,
    fixed: v => `$${v} off`,
    freeMonths: v => (v === 1 ? '1 month free' : `${v} months free`),
    unavailableTitle: 'Listing unavailable',
    unavailableBody: 'This listing is no longer available.'
  },
  de: {
    dir: 'ltr',
    locale: 'de_DE',
    siteName: 'HudhudNest',
    squareMeter: 'm²',
    rooms: n => `${n} Zimmer`,
    defaultTitle: 'Immobiliendetails',
    percent: v => `${v} % Rabatt`,
    fixed: v => `${v} $ Rabatt`,
    freeMonths: v => (v === 1 ? '1 Monat gratis' : `${v} Monate gratis`),
    unavailableTitle: 'Anzeige nicht verfügbar',
    unavailableBody: 'Diese Anzeige ist nicht mehr verfügbar.'
  }
};

/** "de" from "?lang=de" (also "de-AT"); anything else, or nothing, is Arabic -- the original behaviour. */
export function resolveShareLanguage(value) {
  const primary = String(value ?? '').trim().toLowerCase().split(/[-_]/, 1)[0];
  return SHARE_LANGUAGES.includes(primary) ? primary : 'ar';
}

function shareText(lang) {
  return SHARE_TEXT[resolveShareLanguage(lang)];
}

/** Mirrors PropertyShareContentService.buildMetaDescription() on the Angular side — same
 *  facts (area • rooms • price • city), same 160-char cap, same fallback to the title when
 *  there is nothing structured to show. Duplicated intentionally rather than shared at
 *  runtime; see the file header for why. */
export function buildSummary(property, lang = 'ar') {
  const text = shareText(lang);
  const parts = [];

  if (property.area) {
    const unit = !property.areaUnit || property.areaUnit === 'SquareMeter' ? text.squareMeter : property.areaUnit;
    parts.push(`${property.area} ${unit}`);
  }

  if (property.rooms) {
    parts.push(text.rooms(property.rooms));
  }

  const price = property.purchasePrice ?? property.coldRent ?? property.warmRent;
  if (price) {
    const currency = property.currencyCode ?? 'USD';
    parts.push(`${Number(price).toLocaleString('en-US')} ${currency}`);
  }

  if (property.city) {
    parts.push(sanitizeText(property.city));
  }

  const summary = parts.join(' • ');
  return summary.length > MAX_SUMMARY_LENGTH ? `${summary.slice(0, MAX_SUMMARY_LENGTH - 1)}…` : summary;
}

/** schema.org/Offer.businessFunction — same GoodRelations terms schema.org itself points to.
 *  Mirrors PropertyStructuredDataService.resolveBusinessFunction on the Angular side (kept in
 *  sync manually, same reason as buildSummary above: this file cannot import Angular/TS code).
 *  'ForRentAndSale' maps to neither alone, so it's omitted rather than guessed. */
function resolveBusinessFunction(listingType) {
  if (listingType === 'ForSale') return 'http://purl.org/goodrelations/v1#Sell';
  if (listingType === 'ForRent') return 'http://purl.org/goodrelations/v1#LeaseOut';
  return null;
}

/** schema.org/Offer.availability, mapped from PropertyStatus — mirrors
 *  PropertyStructuredDataService.resolveAvailability on the Angular side. */
function resolveAvailability(status) {
  switch (status) {
    case 'Available': return 'https://schema.org/InStock';
    case 'Reserved': return 'https://schema.org/LimitedAvailability';
    case 'Sold':
    case 'Rented': return 'https://schema.org/SoldOut';
    case 'Archived': return 'https://schema.org/Discontinued';
    default: return null;
  }
}

function collectImageUrls(property) {
  const candidates = [
    property.mainImageUrl,
    ...(Array.isArray(property.images) ? property.images.map(img => img && img.url) : [])
  ];
  const seen = new Set();
  const urls = [];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && /^https?:\/\//i.test(candidate) && !seen.has(candidate)) {
      seen.add(candidate);
      urls.push(candidate);
    }
  }
  return urls;
}

/**
 * Builds the schema.org RealEstateListing JSON-LD for one public property — mirrors
 * PropertyStructuredDataService.buildListing on the Angular side exactly (field for field),
 * duplicated here rather than shared at runtime for the same reason as buildSummary above: this
 * is the ONLY document Googlebot/Bingbot ever receive for this route, since both are in
 * CRAWLER_USER_AGENT_SIGNATURES above — they never reach the real Angular-rendered page (or its
 * own client-side JSON-LD) at all, so this is not optional/best-effort the way it would be for
 * a crawler that does execute JS.
 */
export function buildListingJsonLd(property, canonicalUrl) {
  const price = property.purchasePrice ?? property.coldRent ?? property.warmRent;
  const businessFunction = resolveBusinessFunction(property.listingType);
  const availability = resolveAvailability(property.status);

  const offers =
    price != null && property.currencyCode
      ? {
          '@type': 'Offer',
          price,
          priceCurrency: property.currencyCode,
          ...(businessFunction ? { businessFunction } : {}),
          ...(availability ? { availability } : {})
        }
      : null;

  const hasAddressData = Boolean(property.street || property.city || property.countryCode);
  const address = hasAddressData
    ? {
        '@type': 'PostalAddress',
        ...(property.street ? { streetAddress: sanitizeText(property.street) } : {}),
        ...(property.city ? { addressLocality: sanitizeText(property.city) } : {}),
        ...(property.countryCode ? { addressCountry: property.countryCode } : {})
      }
    : null;

  const images = collectImageUrls(property);

  return {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name: sanitizeText(property.title) || 'عقار',
    url: canonicalUrl,
    ...(property.description ? { description: sanitizeText(property.description) } : {}),
    ...(property.publishedAt ? { datePosted: property.publishedAt } : {}),
    ...(images.length ? { image: images } : {}),
    ...(address ? { address } : {}),
    ...(offers ? { offers } : {})
  };
}

/**
 * Builds the full pre-rendered HTML document a crawler receives for one public property.
 * `canonicalUrl` must be the SAME canonical URL used everywhere else (Web Share API,
 * Facebook/WhatsApp/Telegram links, Copy Link) — see PropertyShareUrlService on the Angular
 * side, the single source of truth this document's og:url/canonical must match.
 */
export function buildPropertyMetaHtml({ property, canonicalUrl, fallbackImageUrl, lang = 'ar' }) {
  const text = shareText(lang);
  const title = sanitizeText(property.title) || text.defaultTitle;
  const description = buildSummary(property, lang) || title;
  const image =
    (typeof property.mainImageUrl === 'string' && /^https?:\/\//i.test(property.mainImageUrl) && property.mainImageUrl) ||
    (Array.isArray(property.images) && property.images.find(img => img && /^https?:\/\//i.test(img.url))?.url) ||
    fallbackImageUrl;

  const fullTitle = `${title} | ${text.siteName}`;
  const t = escapeHtml(fullTitle);
  const d = escapeHtml(description);
  const u = escapeHtml(canonicalUrl);
  const img = escapeHtml(image);
  // < escapes '<' so a value containing a literal "</script>" (e.g. an address or
  // description field that somehow bypassed sanitizeText above) can never break out of this
  // <script> tag's content and start injecting markup -- JSON.parse treats < identically
  // to a literal '<', so this changes nothing about the data once parsed. Never rely on
  // sanitizeText alone for this: it protects today's fields, not whatever is added here later.
  const jsonLd = JSON.stringify(buildListingJsonLd(property, canonicalUrl)).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="${resolveShareLanguage(lang)}" dir="${text.dir}">
<head>
<meta charset="utf-8">
<title>${t}</title>
<meta name="description" content="${d}">
<link rel="canonical" href="${u}">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:image" content="${img}">
<meta property="og:url" content="${u}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${text.siteName}">
<meta property="og:locale" content="${text.locale}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="${img}">
<script type="application/ld+json">${jsonLd}</script>
</head>
<body>
<h1>${t}</h1>
<p>${d}</p>
<p><a href="${u}">${u}</a></p>
</body>
</html>
`;
}

/** True for the page that shows the live marketing offer: "/landing" or "/landing/". */
export function isLandingPath(pathname) {
  return /^\/landing\/?$/.test(pathname);
}

/** One-line description of an offer's discount in the preview language. */
function describeOfferDiscount(offer, text) {
  const value = Number(offer.discountValue);
  if (!Number.isFinite(value)) return '';
  switch (offer.discountType) {
    case 'Percentage': return text.percent(value);
    case 'FixedAmountUsd': return text.fixed(value);
    case 'FreeMonths': return text.freeMonths(value);
    default: return '';
  }
}

/**
 * Pre-rendered document for a social crawler hitting /landing while an offer is live. Built only
 * from what GET /api/offers/active already makes public (name, description, discount, end date);
 * it never carries status, ids or counters. Returns null when `offer` has no usable name, so the
 * caller serves the normal SPA (whose static tags describe the platform) instead of a hollow card.
 */
export function buildOfferMetaHtml({ offer, canonicalUrl, fallbackImageUrl, lang = 'ar' }) {
  const text = shareText(lang);
  const name = sanitizeText(offer?.name);
  if (!name) {
    return null;
  }

  const discount = describeOfferDiscount(offer, text);
  const details = sanitizeText(offer.description);
  const description = [discount, details].filter(Boolean).join(' — ') || name;

  const t = escapeHtml(`${name} | ${text.siteName}`);
  const d = escapeHtml(description.slice(0, 200));
  const u = escapeHtml(canonicalUrl);
  const img = escapeHtml(fallbackImageUrl);

  return `<!doctype html>
<html lang="${resolveShareLanguage(lang)}" dir="${text.dir}">
<head>
<meta charset="utf-8">
<title>${t}</title>
<meta name="description" content="${d}">
<link rel="canonical" href="${u}">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:image" content="${img}">
<meta property="og:url" content="${u}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${text.siteName}">
<meta property="og:locale" content="${text.locale}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="${img}">
</head>
<body>
<h1>${t}</h1>
<p>${d}</p>
<p><a href="${u}">${u}</a></p>
</body>
</html>
`;
}

/** Minimal, non-leaking document for a property id that is unpublished/deleted/expired/not
 *  found — never includes any property-specific data, per the feature's privacy rules. */
export function buildNotFoundHtml(lang = 'ar') {
  const text = shareText(lang);
  return `<!doctype html>
<html lang="${resolveShareLanguage(lang)}" dir="${text.dir}">
<head>
<meta charset="utf-8">
<title>${text.unavailableTitle} | ${text.siteName}</title>
<meta name="robots" content="noindex">
</head>
<body>
<p>${text.unavailableBody}</p>
</body>
</html>
`;
}
