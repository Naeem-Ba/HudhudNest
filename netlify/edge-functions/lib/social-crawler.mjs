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
 * Known Social Sharing & Distribution crawlers/link-unfurlers that do not execute
 * JavaScript (or do so unreliably) — see PropertyMetaService's doc comment in the Angular app
 * for why they need pre-rendered HTML instead. Matched as a case-insensitive substring of the
 * User-Agent header.
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
  'googlebot',
  'bingbot',
  'yandex',
  'embedly',
  'quora link preview',
  'outbrain',
  'nuzzel',
  'flipboard',
  'w3c_validator'
];

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

/** Mirrors PropertyShareContentService.buildMetaDescription() on the Angular side — same
 *  facts (area • rooms • price • city), same 160-char cap, same fallback to the title when
 *  there is nothing structured to show. Duplicated intentionally rather than shared at
 *  runtime; see the file header for why. */
export function buildSummary(property) {
  const parts = [];

  if (property.area) {
    const unit = !property.areaUnit || property.areaUnit === 'SquareMeter' ? 'م²' : property.areaUnit;
    parts.push(`${property.area} ${unit}`);
  }

  if (property.rooms) {
    parts.push(`${property.rooms} غرف`);
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

/**
 * Builds the full pre-rendered HTML document a crawler receives for one public property.
 * `canonicalUrl` must be the SAME canonical URL used everywhere else (Web Share API,
 * Facebook/WhatsApp/Telegram links, Copy Link) — see PropertyShareUrlService on the Angular
 * side, the single source of truth this document's og:url/canonical must match.
 */
export function buildPropertyMetaHtml({ property, canonicalUrl, fallbackImageUrl }) {
  const title = sanitizeText(property.title) || 'تفاصيل العقار';
  const description = buildSummary(property) || title;
  const image =
    (typeof property.mainImageUrl === 'string' && /^https?:\/\//i.test(property.mainImageUrl) && property.mainImageUrl) ||
    (Array.isArray(property.images) && property.images.find(img => img && /^https?:\/\//i.test(img.url))?.url) ||
    fallbackImageUrl;

  const fullTitle = `${title} | هدهد نيست`;
  const t = escapeHtml(fullTitle);
  const d = escapeHtml(description);
  const u = escapeHtml(canonicalUrl);
  const img = escapeHtml(image);

  return `<!doctype html>
<html lang="ar" dir="rtl">
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
<meta property="og:site_name" content="هدهد نيست">
<meta property="og:locale" content="ar_SY">
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
export function buildNotFoundHtml() {
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<title>الإعلان غير متاح | هدهد نيست</title>
<meta name="robots" content="noindex">
</head>
<body>
<p>هذا الإعلان لم يعد متاحاً.</p>
</body>
</html>
`;
}
