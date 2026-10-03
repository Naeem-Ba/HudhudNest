// Pure logic for the sitemap.xml edge function — deliberately plain JavaScript with no
// Deno-specific or Node-specific API, same split and same reason as ./social-crawler.mjs: runs
// unmodified inside the real Netlify Edge Function (Deno) and under plain `node` for fast,
// offline unit tests (see ./sitemap.test.mjs, run with `node --test netlify/edge-functions/lib`).

/** The one real production origin. A sitemap is only ever served for this origin — see
 *  ../sitemap.mjs's doc comment for why Staging/previews/local builds must never get a real
 *  one, matching robots.txt's "block everything outside Production" policy (generate-robots.mjs). */
export const PRODUCTION_SITE_URL = 'https://hudhudnest.com';

export function isProductionSiteUrl(siteUrl) {
  return (siteUrl ?? '').replace(/\/+$/, '') === PRODUCTION_SITE_URL;
}

/** True when the request itself was made to the real production host. Added because gating on
 *  the SITE_URL env var alone made the sitemap silently empty whenever that variable was unset,
 *  or scoped to "Builds" only (so invisible to an edge function at runtime) -- the live
 *  production site served an empty, noindex sitemap for exactly that reason (SEO audit,
 *  2026-10-03). The request host cannot be mis-scoped, and a Staging/preview host never equals
 *  the production hostname, so this does not weaken the Production-only rule. */
export function isProductionRequestUrl(requestUrl) {
  try {
    return new URL(requestUrl).hostname === new URL(PRODUCTION_SITE_URL).hostname;
  } catch {
    return false;
  }
}

export function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** ISO 8601 date (no time) for <lastmod>, or null for a missing/unparseable input — <lastmod>
 *  is optional per the sitemap protocol, so a bad date is omitted rather than guessed. */
export function toLastmod(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

/** Static, always-public pages worth listing. Deliberately NOT including filter/search-query
 *  combinations of /properties (city, rooms, price, ...) -- see the SEO plan's index-bloat
 *  rule: only the bare listing page is a real, distinct piece of content; every filtered
 *  variant is the same page with different client-side state, not a separate page to index. */
export function buildStaticUrlEntries(siteUrl) {
  return [
    { loc: `${siteUrl}/`, changefreq: 'daily', priority: '1.0' },
    { loc: `${siteUrl}/properties`, changefreq: 'hourly', priority: '0.8' }
  ];
}

/** One <url> entry per published property. `properties` items are the raw API DTOs
 *  (camelCase JSON from PropertyDto) -- only `id` and `updatedAt`/`publishedAt` are read. */
export function buildPropertyUrlEntries(siteUrl, properties) {
  return properties.map(property => ({
    loc: `${siteUrl}/properties/${encodeURIComponent(property.id)}`,
    lastmod: toLastmod(property.updatedAt ?? property.publishedAt),
    changefreq: 'daily',
    priority: '0.6'
  }));
}

export function buildSitemapXml(entries) {
  const urlTags = entries
    .map(entry => {
      const lastmodTag = entry.lastmod ? `<lastmod>${entry.lastmod}</lastmod>` : '';
      return (
        `  <url><loc>${escapeXml(entry.loc)}</loc>${lastmodTag}` +
        `<changefreq>${entry.changefreq}</changefreq><priority>${entry.priority}</priority></url>`
      );
    })
    .join('\n');

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    `${urlTags}\n` +
    '</urlset>\n'
  );
}

/** A deliberately tiny, always-valid sitemap for any non-Production origin -- empty rather
 *  than 404/error, because an edge function path match with no body at all is a worse crawler
 *  experience than a sitemap that correctly lists nothing. robots.txt already disallows
 *  everything on these origins (generate-robots.mjs), so this is defense in depth, not the
 *  primary control. */
export function buildEmptySitemapXml() {
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>\n';
}

/**
 * Fetches every published property from the public listing endpoint, paginating at the
 * server's own max page size, and stops as soon as the server's own totalCount says there is
 * no more -- not by guessing from a short page, which an off-by-one could get wrong.
 *
 * `fetchPage(page, pageSize)` is injected so this stays testable without a real network call;
 * the edge function below passes in a thin wrapper around the real `fetch`.
 *
 * `maxPages` is a hard safety cap (default 500 * 100 = 50,000 properties, the sitemap
 * protocol's own per-file URL limit) so a backend bug returning `hasNext: true` forever can
 * never turn this into an infinite loop or an unbounded-memory response.
 */
export async function fetchAllPublishedProperties(fetchPage, { pageSize = 100, maxPages = 500 } = {}) {
  const properties = [];

  for (let page = 1; page <= maxPages; page++) {
    let pageResult;
    try {
      pageResult = await fetchPage(page, pageSize);
    } catch {
      // Partial result beats none: whatever was gathered so far is still a valid, useful
      // sitemap -- see ../sitemap.mjs's catch block for the same reasoning at the top level.
      break;
    }

    if (!pageResult || !Array.isArray(pageResult.items)) {
      break;
    }

    properties.push(...pageResult.items);

    const totalCount = typeof pageResult.totalCount === 'number' ? pageResult.totalCount : null;
    if (totalCount !== null ? properties.length >= totalCount : pageResult.items.length < pageSize) {
      break;
    }
  }

  return properties;
}
