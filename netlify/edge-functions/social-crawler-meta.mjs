// =============================================================
// netlify/edge-functions/social-crawler-meta.mjs
//
// Social Sharing & Distribution — the server-side piece that makes Open Graph/Twitter Card
// metadata actually visible to social crawlers.
//
// WHY THIS FILE EXISTS (do not remove without replacing it): this project is a pure
// client-side Angular SPA — no @angular/ssr, no prerendering, confirmed by there being no
// server bundle and no such dependency in package.json. PropertyMetaService (Angular) sets
// <title>/OG/Twitter/canonical tags correctly, but only AFTER the JS bundle has already
// executed in a real browser. Facebook's and WhatsApp's crawlers in particular do not execute
// JavaScript at all when unfurling a link; several others do so unreliably or with a short
// timeout. Without this file, every property link shared to those platforms would show a
// blank/generic preview instead of the listing's real title, price, and photo.
//
// HOW IT WORKS: this Edge Function runs (Deno, on Netlify's edge) in front of the static
// Angular build for exactly the /properties/:id route (see `config` below). It inspects the
// request's User-Agent:
//   - a KNOWN crawler → fetch this property from the real backend API and return a small,
//     complete HTML document with the right tags (see ./lib/social-crawler.mjs)
//   - a SEARCH ENGINE (Googlebot, Bingbot...) → the normal SPA body, but with a real 404 status
//     when the backend says the listing doesn't exist (see respondForSearchEngine)
//   - anyone else (real visitors, unrecognized bots) → `context.next()`, i.e. serve the normal
//     Angular index.html exactly as before — this function is otherwise fully transparent.
//
// The same function also serves /landing (marketing offer previews, see respondForLandingCrawler).
//
// This keeps the SPA architecture completely unchanged for actual users; it only intercepts
// the narrow slice of traffic that can't run the SPA in the first place.
//
// CONFIGURATION: reads the backend API base URL from the `API_URL` Netlify environment
// variable — the SAME variable already configured per branch/context for the Angular build
// itself (see tools/generate-env.mjs and the Netlify dashboard config described in the
// frontend-repo-location memory) — no new environment variable to manage. Falls back to the
// production API if unset, matching environment.prod.ts's own fallback.
//
// VERIFICATION NOTE (documented, not hidden): this file was written and reviewed carefully and
// its pure logic (crawler detection, HTML building, sanitization) is covered by real,
// executable tests — see ./lib/social-crawler.test.mjs, runnable with
// `node --test netlify/edge-functions/lib`. The Deno/Netlify runtime glue in THIS file
// (Netlify.env.get, context.next(), the Response object) could not be executed end-to-end in
// the sandboxed environment this feature was built in — no Deno or Netlify CLI is available
// there. Verify it for real with `netlify dev` or a Netlify deploy preview before relying on
// it in production; see docs/social-sharing.md for the exact steps.
// =============================================================

import {
  isSocialCrawlerUserAgent,
  isSearchEngineCrawlerUserAgent,
  extractPropertyIdFromPath,
  isLandingPath,
  resolveCanonicalOrigin,
  buildPropertyMetaHtml,
  buildOfferMetaHtml,
  buildNotFoundHtml,
  resolveShareLanguage,
  extractOfficeSlugFromPath,
  buildOfficeMetaHtml,
  buildOfficeNotFoundHtml
} from './lib/social-crawler.mjs';

const DEFAULT_API_BASE_URL = 'https://api.hudhudnest.com/api';
const FALLBACK_IMAGE_PATH = '/images/og-default.png';

/** How long a search-engine crawler's status check may delay the page. Fails open (serves the
 *  normal SPA with 200) on timeout, so a slow backend can never make a live listing look gone. */
const SEARCH_ENGINE_STATUS_CHECK_TIMEOUT_MS = 3000;

/**
 * Search engines (Googlebot, Bingbot...) get the normal SPA body -- see social-crawler.mjs for why
 * they are not served pre-rendered HTML -- but the SPA shell is a 200 for EVERY path, so a deleted
 * or unpublished listing would otherwise only be reported "not found" via a JS-injected noindex
 * (a soft 404). When the backend definitively says 404, keep the SPA body and send a real 404
 * status instead. Only an explicit 404 changes anything: any other outcome (200, 5xx, timeout,
 * network error) passes the SPA through as a 200, so this can never de-list a live property.
 */
async function respondForSearchEngine(resourceUrl, context) {
  try {
    const response = await fetch(resourceUrl, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(SEARCH_ENGINE_STATUS_CHECK_TIMEOUT_MS)
    });

    if (response.status === 404) {
      const spa = await context.next();
      return new Response(spa.body, { status: 404, headers: spa.headers });
    }
  } catch {
    // Timeout / network failure -- fall through to the unmodified SPA below.
  }

  return context.next();
}

async function respondForLandingCrawler(request, context) {
  const apiBaseUrl = (Netlify.env.get('API_URL') || DEFAULT_API_BASE_URL).replace(/\/+$/, '');
  const canonicalOrigin = resolveCanonicalOrigin(request.url);
  // The sharer's language (?lang=de on the shared link); Arabic when the link names none.
  const lang = resolveShareLanguage(new URL(request.url).searchParams.get('lang'));

  try {
    const response = await fetch(`${apiBaseUrl}/offers/active`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(SEARCH_ENGINE_STATUS_CHECK_TIMEOUT_MS)
    });

    if (response.status !== 200) {
      return context.next();
    }

    const html = buildOfferMetaHtml({
      offer: await response.json(),
      canonicalUrl: `${canonicalOrigin}/landing`,
      fallbackImageUrl: `${canonicalOrigin}${FALLBACK_IMAGE_PATH}`,
      lang
    });

    if (!html) {
      return context.next();
    }

    return new Response(html, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        // Short: a paused/ended offer must stop being previewed within minutes.
        'cache-control': 'public, max-age=300'
      }
    });
  } catch {
    return context.next();
  }
}

/**
 * Social crawler on an office page: a preview card from the public office endpoint. An unknown or deactivated office
 * (404) gets the minimal noindex document; any other failure falls through to the SPA, like the property preview.
 */
async function respondForOfficeCrawler(request, slug, officeUrl, context) {
  const canonicalOrigin = resolveCanonicalOrigin(request.url);
  const lang = resolveShareLanguage(new URL(request.url).searchParams.get('lang'));

  try {
    const response = await fetch(officeUrl, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(SEARCH_ENGINE_STATUS_CHECK_TIMEOUT_MS)
    });

    if (response.status === 404) {
      return new Response(buildOfficeNotFoundHtml(lang), {
        status: 404,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    }
    if (!response.ok) {
      return context.next();
    }

    const agency = await response.json();
    // The canonical uses the office's own slug as the server returns it, the same URL the app declares.
    const canonicalUrl = `${canonicalOrigin}/offices/${encodeURIComponent(agency?.slug || slug)}`;
    const html = buildOfficeMetaHtml({
      agency,
      canonicalUrl,
      fallbackImageUrl: `${canonicalOrigin}${FALLBACK_IMAGE_PATH}`,
      lang
    });

    if (!html) {
      return context.next();
    }

    return new Response(html, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'public, max-age=300'
      }
    });
  } catch {
    return context.next();
  }
}

export default async (request, context) => {
  const userAgent = request.headers.get('user-agent') ?? '';
  const isSocialCrawler = isSocialCrawlerUserAgent(userAgent);
  const isSearchEngine = !isSocialCrawler && isSearchEngineCrawlerUserAgent(userAgent);

  // Neither a social unfurler nor a search engine — every real visitor and any bot we don't
  // specifically recognize gets the normal Angular app, completely untouched (and without an
  // extra backend round-trip).
  if (!isSocialCrawler && !isSearchEngine) {
    return context.next();
  }

  const url = new URL(request.url);

  // /landing: a social crawler gets the live marketing offer's name/description as its preview.
  // Anything short of a clean 200 with a usable offer (no offer = 204, backend down, timeout)
  // falls through to the normal SPA, whose static tags describe the platform -- an offer
  // preview must never turn into an error page.
  if (isLandingPath(url.pathname)) {
    return isSocialCrawler ? respondForLandingCrawler(request, context) : context.next();
  }

  const officeSlug = extractOfficeSlugFromPath(url.pathname);
  if (officeSlug) {
    const apiBaseUrl = (Netlify.env.get('API_URL') || DEFAULT_API_BASE_URL).replace(/\/+$/, '');
    const officeUrl = `${apiBaseUrl}/agencies/${encodeURIComponent(officeSlug)}`;
    return isSearchEngine
      ? respondForSearchEngine(officeUrl, context)
      : respondForOfficeCrawler(request, officeSlug, officeUrl, context);
  }

  const propertyId = extractPropertyIdFromPath(url.pathname);
  if (!propertyId) {
    return context.next();
  }

  const apiBaseUrl = (Netlify.env.get('API_URL') || DEFAULT_API_BASE_URL).replace(/\/+$/, '');

  if (isSearchEngine) {
    return respondForSearchEngine(`${apiBaseUrl}/properties/${encodeURIComponent(propertyId)}`, context);
  }

  // Alias hosts (old domain, *.netlify.app) must declare the production URL canonical, not
  // themselves -- see resolveCanonicalOrigin.
  const canonicalOrigin = resolveCanonicalOrigin(request.url);
  // Rebuilt from the id (not url.pathname) so "/properties/<id>/" and "/properties/<id>" share
  // one canonical, matching PropertyShareUrlService.getPropertyPublicUrl on the Angular side.
  const canonicalUrl = `${canonicalOrigin}/properties/${encodeURIComponent(propertyId)}`;
  const fallbackImageUrl = `${canonicalOrigin}${FALLBACK_IMAGE_PATH}`;
  const lang = resolveShareLanguage(url.searchParams.get('lang'));

  try {
    // The public GET already only ever returns a published, unexpired listing (404 otherwise —
    // see GetPropertyByIdQueryHandler on the backend) — this function trusts that same rule
    // rather than re-implementing "is this property public" here.
    const response = await fetch(`${apiBaseUrl}/properties/${encodeURIComponent(propertyId)}`, {
      headers: { accept: 'application/json' }
    });

    if (!response.ok) {
      return new Response(buildNotFoundHtml(lang), {
        status: response.status === 404 ? 404 : 502,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    }

    const property = await response.json();
    const html = buildPropertyMetaHtml({ property, canonicalUrl, fallbackImageUrl, lang });

    return new Response(html, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        // Short cache: long enough to absorb a burst of crawler hits right after a share,
        // short enough that an edited/unpublished listing's preview doesn't stay stale for long.
        'cache-control': 'public, max-age=300'
      }
    });
  } catch {
    // Network/backend failure — never surface an error page or leak details to a crawler;
    // fall through to the normal SPA response instead (best-effort, not a hard failure).
    return context.next();
  }
};

export const config = {
  path: ['/properties/*', '/landing', '/offices/*']
};
