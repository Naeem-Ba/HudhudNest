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
  'w3c_validator',
  // Added 2026-11-18 (share-links audit M-04): Viber is widely used in Syria; Snapchat, Bluesky's
  // card fetcher and Mastodon instances also unfurl links without running JavaScript.
  'viber',
  'snapchat',
  'cardyb',
  'mastodon'
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

/** The office slug from "/offices/<slug>" or "/offices/<slug>/"; null for the directory itself and anything nested. */
export function extractOfficeSlugFromPath(pathname) {
  const match = /^\/offices\/([^/]+)\/?$/.exec(pathname);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
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
export const SHARE_LANGUAGES = ['ar', 'en', 'de', 'tr'];

const SHARE_TEXT = {
  ar: {
    dir: 'rtl',
    locale: 'ar_SY',
    listSep: '، ',
    siteName: 'هدهد نيست',
    squareMeter: 'م²',
    rooms: n => `${n} غرف`,
    defaultTitle: 'تفاصيل العقار',
    forSale: 'للبيع',
    forRent: 'للإيجار',
    perMonth: price => `${price} شهريًا`,
    percent: v => `خصم ${v}%`,
    fixed: v => `خصم ${v}$`,
    freeMonths: v => (v === 1 ? 'شهر مجاني' : `${v} أشهر مجانية`),
    unavailableTitle: 'الإعلان غير متاح',
    unavailableBody: 'هذا الإعلان لم يعد متاحاً.',
    officeDescription: name => `${name}: مكتب عقاري على هدهد نيست. الإعلانات وساعات العمل وطرق التواصل.`,
    officeUnavailableTitle: 'المكتب غير متاح',
    officeUnavailableBody: 'هذا المكتب غير متاح.'
  },
  en: {
    dir: 'ltr',
    locale: 'en_US',
    listSep: ', ',
    siteName: 'HudhudNest',
    squareMeter: 'm²',
    rooms: n => `${n} ${Number(n) === 1 ? 'room' : 'rooms'}`,
    defaultTitle: 'Property details',
    forSale: 'For sale',
    forRent: 'For rent',
    perMonth: price => `${price}/month`,
    percent: v => `${v}% off`,
    fixed: v => `$${v} off`,
    freeMonths: v => (v === 1 ? '1 month free' : `${v} months free`),
    unavailableTitle: 'Listing unavailable',
    unavailableBody: 'This listing is no longer available.',
    officeDescription: name => `${name}: real estate office on HudhudNest. Listings, opening hours and contact details.`,
    officeUnavailableTitle: 'Office unavailable',
    officeUnavailableBody: 'This office is not available.'
  },
  de: {
    dir: 'ltr',
    locale: 'de_DE',
    listSep: ', ',
    siteName: 'HudhudNest',
    squareMeter: 'm²',
    rooms: n => `${n} Zimmer`,
    defaultTitle: 'Immobiliendetails',
    forSale: 'Zu verkaufen',
    forRent: 'Zu vermieten',
    perMonth: price => `${price}/Monat`,
    percent: v => `${v} % Rabatt`,
    fixed: v => `${v} $ Rabatt`,
    freeMonths: v => (v === 1 ? '1 Monat gratis' : `${v} Monate gratis`),
    unavailableTitle: 'Anzeige nicht verfügbar',
    unavailableBody: 'Diese Anzeige ist nicht mehr verfügbar.',
    officeDescription: name => `${name}: Immobilienbüro auf HudhudNest. Inserate, Öffnungszeiten und Kontakt.`,
    officeUnavailableTitle: 'Büro nicht verfügbar',
    officeUnavailableBody: 'Dieses Büro ist nicht verfügbar.'
  },
  tr: {
    dir: 'ltr',
    locale: 'tr_TR',
    listSep: ', ',
    siteName: 'HudhudNest',
    squareMeter: 'm²',
    rooms: n => `${n} oda`,
    defaultTitle: 'İlan ayrıntıları',
    forSale: 'Satılık',
    forRent: 'Kiralık',
    perMonth: price => `${price}/ay`,
    percent: v => `%${v} indirim`,
    fixed: v => `${v} $ indirim`,
    freeMonths: v => (v === 1 ? '1 ay ücretsiz' : `${v} ay ücretsiz`),
    unavailableTitle: 'İlan yayında değil',
    unavailableBody: 'Bu ilan artık yayında değil.',
    officeDescription: name => `${name}: HudhudNest üzerinde emlak ofisi. İlanlar, çalışma saatleri ve iletişim bilgileri.`,
    officeUnavailableTitle: 'Ofis kullanılamıyor',
    officeUnavailableBody: 'Bu ofis kullanılamıyor.'
  }
};

/** "de" from "?lang=de" (also "de-AT"; "tr" from "?lang=tr"); anything else, or nothing, is Arabic -- the original behaviour. */
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

  // Sale or rent first: the one fact a reader needs before the numbers mean anything (audit M-02).
  if (property.listingType === 'ForSale') {
    parts.push(text.forSale);
  } else if (property.listingType === 'ForRent') {
    parts.push(text.forRent);
  }

  if (property.area) {
    const unit = !property.areaUnit || property.areaUnit === 'SquareMeter' ? text.squareMeter : property.areaUnit;
    parts.push(`${property.area} ${unit}`);
  }

  if (property.rooms) {
    parts.push(text.rooms(property.rooms));
  }

  const isRent = property.purchasePrice == null && (property.coldRent != null || property.warmRent != null);
  const price = property.purchasePrice ?? property.coldRent ?? property.warmRent;
  if (price) {
    const currency = property.currencyCode ?? 'USD';
    const amount = `${Number(price).toLocaleString('en-US')} ${currency}`;
    parts.push(isRent ? text.perMonth(amount) : amount);
  }

  // City, then the region when it adds something (free text: either may be missing or repeat the other).
  const city = sanitizeText(property.city);
  const region = sanitizeText(property.region);
  const place = [city, region && region !== city ? region : ''].filter(Boolean).join(text.listSep);
  if (place) {
    parts.push(place);
  }

  const summary = parts.join(' • ');
  return summary.length > MAX_SUMMARY_LENGTH ? `${summary.slice(0, MAX_SUMMARY_LENGTH - 1)}…` : summary;
}

/** Size every preview image is delivered at: the 1.91:1 card WhatsApp, Facebook, Telegram and X all crop to. */
export const PREVIEW_IMAGE_WIDTH = 1200;
export const PREVIEW_IMAGE_HEIGHT = 630;

const CLOUDINARY_UPLOAD = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/i;
const CLOUDINARY_TRANSFORM_SEGMENT = /^[a-z]{1,3}_[^/]*(,[a-z]{1,3}_[^/]*)*$/i;

/**
 * A Cloudinary photo as a preview-sized JPEG (audit L-02). Uploads are stored as the original file, which can be
 * several megabytes; link unfurlers (WhatsApp in particular) drop a large image and show a card without one.
 * `mode` 'fill' crops a photo to the card; 'pad' fits a logo inside it on white so nothing is cut off.
 * Returns null for anything that is not a plain Cloudinary upload URL (another host, or a URL that already
 * carries a transformation, whose order we would otherwise change), so the caller keeps the original.
 */
export function cloudinaryPreviewUrl(value, mode = 'fill') {
  if (typeof value !== 'string') return null;
  const match = CLOUDINARY_UPLOAD.exec(value.trim());
  if (!match) return null;
  const [, base, rest] = match;
  const firstSegment = rest.split('/', 1)[0];
  if (CLOUDINARY_TRANSFORM_SEGMENT.test(firstSegment)) return null;
  const size = `w_${PREVIEW_IMAGE_WIDTH},h_${PREVIEW_IMAGE_HEIGHT}`;
  const transform = mode === 'pad' ? `c_pad,b_white,${size},q_auto,f_jpg` : `c_fill,g_auto,${size},q_auto,f_jpg`;
  return `${base}${transform}/${rest}`;
}

/**
 * The preview image and whether its pixel size is known. Known = a Cloudinary image we resized, or the site's own
 * 1200x630 default; an image on any other host is used as is, without width/height tags it might contradict.
 */
function previewImage(candidates, fallbackImageUrl) {
  for (const { url, mode } of candidates) {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) continue;
    const resized = cloudinaryPreviewUrl(url, mode);
    return resized ? { url: resized, sized: true } : { url, sized: false };
  }
  return { url: fallbackImageUrl, sized: true };
}

function imageMetaTags(image, alt) {
  const img = escapeHtml(image.url);
  const a = escapeHtml(alt);
  const lines = [
    `<meta property="og:image" content="${img}">`,
    `<meta property="og:image:alt" content="${a}">`
  ];
  if (image.sized) {
    lines.push(
      `<meta property="og:image:width" content="${PREVIEW_IMAGE_WIDTH}">`,
      `<meta property="og:image:height" content="${PREVIEW_IMAGE_HEIGHT}">`
    );
  }
  lines.push(`<meta name="twitter:image" content="${img}">`, `<meta name="twitter:image:alt" content="${a}">`);
  return lines.join('\n');
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
  const image = previewImage(
    [
      { url: property.mainImageUrl, mode: 'fill' },
      ...(Array.isArray(property.images) ? property.images.map(img => ({ url: img && img.url, mode: 'fill' })) : [])
    ],
    fallbackImageUrl
  );

  const fullTitle = `${title} | ${text.siteName}`;
  const t = escapeHtml(fullTitle);
  const d = escapeHtml(description);
  const u = escapeHtml(canonicalUrl);
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
${imageMetaTags(image, title)}
<meta property="og:url" content="${u}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${text.siteName}">
<meta property="og:locale" content="${text.locale}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
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

function httpsUrl(value) {
  return typeof value === 'string' && /^https:\/\//i.test(value) ? value : null;
}

/**
 * Pre-rendered preview for a social crawler on an office page (/offices/<slug>). Built only from what the public
 * office endpoint already shows (name, description, cover or logo). Returns null when the office has no usable name,
 * so the caller serves the normal SPA instead of a hollow card.
 */
export function buildOfficeMetaHtml({ agency, canonicalUrl, fallbackImageUrl, lang = 'ar' }) {
  const text = shareText(lang);
  const name = sanitizeText(agency?.name);
  if (!name) {
    return null;
  }

  const own = sanitizeText(agency.description);
  // The office's city leads the text when the office has one (audit M-02): who and where, before the pitch.
  const city = sanitizeText(agency.city);
  const body = own || text.officeDescription(name);
  const full = city ? `${city} • ${body}` : body;
  const description = full.length > MAX_SUMMARY_LENGTH ? `${full.slice(0, MAX_SUMMARY_LENGTH - 1)}…` : full;
  // The cover is a photo (cropped to the card); a logo is padded so it is never cut off.
  const image = previewImage(
    [
      { url: httpsUrl(agency.coverImageUrl), mode: 'fill' },
      { url: httpsUrl(agency.logoUrl), mode: 'pad' }
    ],
    fallbackImageUrl
  );

  const t = escapeHtml(`${name} | ${text.siteName}`);
  const d = escapeHtml(description);
  const u = escapeHtml(canonicalUrl);

  return `<!doctype html>
<html lang="${resolveShareLanguage(lang)}" dir="${text.dir}">
<head>
<meta charset="utf-8">
<title>${t}</title>
<meta name="description" content="${d}">
<link rel="canonical" href="${u}">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
${imageMetaTags(image, name)}
<meta property="og:url" content="${u}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${text.siteName}">
<meta property="og:locale" content="${text.locale}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
</head>
<body>
<h1>${t}</h1>
<p>${d}</p>
<p><a href="${u}">${u}</a></p>
</body>
</html>
`;
}

/** Minimal, non-leaking document for an unknown or deactivated office. */
export function buildOfficeNotFoundHtml(lang = 'ar') {
  const text = shareText(lang);
  return `<!doctype html>
<html lang="${resolveShareLanguage(lang)}" dir="${text.dir}">
<head>
<meta charset="utf-8">
<title>${text.officeUnavailableTitle} | ${text.siteName}</title>
<meta name="robots" content="noindex">
</head>
<body>
<p>${text.officeUnavailableBody}</p>
</body>
</html>
`;
}
