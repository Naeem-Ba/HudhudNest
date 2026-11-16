// =============================================================
// netlify/edge-functions/sitemap.mjs
//
// Serves a real, dynamic /sitemap.xml listing every currently-published property plus the
// site's static public pages, so Google/Bing have an efficient discovery path instead of
// relying solely on internal links and crawl budget.
//
// WHY AN EDGE FUNCTION (not a static file, not a build-time-generated one): this app is a pure
// client-side SPA with no server (see social-crawler-meta.mjs's header for why), and property
// listings change far more often than deploys happen -- a sitemap baked in at build time would
// go stale (new listings missing, sold/expired ones still listed) between deploys. Running at
// the edge keeps it live without needing a backend endpoint change: it reuses the same public,
// already-filtered GET /api/properties the Angular app itself calls, which already returns only
// published, unexpired listings (see PropertyRepository.ApplyFilter on the backend) -- this
// function trusts that same rule rather than re-implementing "is this property public" here.
//
// PRODUCTION-ONLY: a sitemap actively helps crawlers find content, which is exactly what a
// Staging/preview/local deploy must never do (see generate-robots.mjs's identical policy for
// robots.txt). SITE_URL is the same Netlify environment variable already configured per branch
// for the Angular build (tools/generate-env.mjs) -- no new variable to manage -- and this
// function only ever serves the real sitemap when it equals the one real production origin, or
// when the request itself was made to the production hostname (so a missing or build-only-scoped
// SITE_URL can no longer silently blank the sitemap).
//
// SCALE: paginates three public lists (properties, short-stay listings, investment projects) at the
// backend's own max page size (100), each with a 50,000-URL hard cap, and the file as a whole is cut at
// the sitemap protocol's own per-file limit of 50,000 URLs -- see fetchAllPublishedProperties in
// ./lib/sitemap.mjs.
// A backend outage mid-fetch degrades to whatever pages were already gathered rather than
// failing the whole response, so a transient hiccup never takes the sitemap to empty.
//
// VERIFICATION NOTE (documented, not hidden): same caveat as social-crawler-meta.mjs -- the
// pure logic (pagination, XML building, the Production gate) is covered by real, executable
// tests (./lib/sitemap.test.mjs, `node --test netlify/edge-functions/lib`), but the Deno/Netlify
// runtime glue itself (Netlify.env.get, real edge routing) could not be exercised end-to-end in
// this sandbox (no Deno/Netlify CLI available). Verify with `netlify dev` or a deploy preview --
// `curl https://<preview-url>/sitemap.xml` -- and validate the result before relying on it in
// production.
// =============================================================

import {
  PRODUCTION_SITE_URL,
  isProductionSiteUrl,
  isProductionRequestUrl,
  buildSitemapXml,
  buildEmptySitemapXml,
  buildStaticUrlEntries,
  buildPropertyUrlEntries,
  buildShortStayUrlEntries,
  buildInvestmentUrlEntries,
  buildOfficeUrlEntries,
  OFFICE_DIRECTORY_PAGE_SIZE,
  fetchAllPublishedProperties
} from './lib/sitemap.mjs';

const DEFAULT_API_BASE_URL = 'https://api.hudhudnest.com/api';

export default async (request) => {
  const configuredSiteUrl = (Netlify.env.get('SITE_URL') || '').replace(/\/+$/, '');
  // Production if SITE_URL says so OR the request really hit the production host -- see
  // isProductionRequestUrl for why SITE_URL alone is not a reliable signal at runtime.
  const isProduction =
    isProductionSiteUrl(configuredSiteUrl) || (request ? isProductionRequestUrl(request.url) : false);
  const siteUrl = isProduction ? PRODUCTION_SITE_URL : configuredSiteUrl;

  if (!isProduction) {
    return new Response(buildEmptySitemapXml(), {
      status: 200,
      headers: {
        'content-type': 'application/xml; charset=utf-8',
        'x-robots-tag': 'noindex',
        'cache-control': 'public, max-age=3600'
      }
    });
  }

  const apiBaseUrl = (Netlify.env.get('API_URL') || DEFAULT_API_BASE_URL).replace(/\/+$/, '');

  // Each list is fetched independently: if one endpoint is down or rate-limited the others still
  // make it into the sitemap (fetchAllPublishedProperties keeps whatever pages it already has).
  const fetchList = (path, options) =>
    fetchAllPublishedProperties(async (page, pageSize) => {
      const response = await fetch(`${apiBaseUrl}${path}?page=${page}&pageSize=${pageSize}`, {
        headers: { accept: 'application/json' }
      });
      if (!response.ok) {
        throw new Error(`${path} page ${page} responded ${response.status}`);
      }
      return response.json();
    }, options);

  const [properties, shortStayListings, investmentProjects, offices] = await Promise.all([
    fetchList('/properties'),
    fetchList('/short-stay/listings'),
    fetchList('/investments/projects'),
    // The directory refuses a page larger than its own maximum, so it is walked at that size.
    fetchList('/agencies', { pageSize: OFFICE_DIRECTORY_PAGE_SIZE, maxPages: 1000 })
  ]);

  const xml = buildSitemapXml([
    ...buildStaticUrlEntries(siteUrl),
    ...buildPropertyUrlEntries(siteUrl, properties),
    ...buildShortStayUrlEntries(siteUrl, shortStayListings),
    ...buildInvestmentUrlEntries(siteUrl, investmentProjects),
    ...buildOfficeUrlEntries(siteUrl, offices)
  ]);

  return new Response(xml, {
    status: 200,
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      // An hour is plenty fresh for a sitemap -- crawlers re-fetch it on their own schedule
      // anyway -- and keeps a burst of crawler hits from repeatedly re-walking every page of
      // the backend's property listing.
      'cache-control': 'public, max-age=3600'
    }
  });
};

export const config = {
  path: '/sitemap.xml'
};
