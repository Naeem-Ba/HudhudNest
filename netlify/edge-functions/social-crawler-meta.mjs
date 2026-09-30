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
//   - anyone else (real visitors, unrecognized bots) → `context.next()`, i.e. serve the normal
//     Angular index.html exactly as before — this function is otherwise fully transparent.
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
  extractPropertyIdFromPath,
  buildPropertyMetaHtml,
  buildNotFoundHtml
} from './lib/social-crawler.mjs';

const DEFAULT_API_BASE_URL = 'https://wohnungen-api.onrender.com/api';
const FALLBACK_IMAGE_PATH = '/images/og-default.png';

export default async (request, context) => {
  const userAgent = request.headers.get('user-agent') ?? '';

  // Not a known crawler — every real visitor and any bot we don't specifically recognize gets
  // the normal Angular app, completely untouched.
  if (!isSocialCrawlerUserAgent(userAgent)) {
    return context.next();
  }

  const url = new URL(request.url);
  const propertyId = extractPropertyIdFromPath(url.pathname);
  if (!propertyId) {
    return context.next();
  }

  const apiBaseUrl = (Netlify.env.get('API_URL') || DEFAULT_API_BASE_URL).replace(/\/+$/, '');
  const canonicalUrl = `${url.origin}${url.pathname}`;
  const fallbackImageUrl = `${url.origin}${FALLBACK_IMAGE_PATH}`;

  try {
    // The public GET already only ever returns a published, unexpired listing (404 otherwise —
    // see GetPropertyByIdQueryHandler on the backend) — this function trusts that same rule
    // rather than re-implementing "is this property public" here.
    const response = await fetch(`${apiBaseUrl}/properties/${encodeURIComponent(propertyId)}`, {
      headers: { accept: 'application/json' }
    });

    if (!response.ok) {
      return new Response(buildNotFoundHtml(), {
        status: response.status === 404 ? 404 : 502,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    }

    const property = await response.json();
    const html = buildPropertyMetaHtml({ property, canonicalUrl, fallbackImageUrl });

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
  path: '/properties/*'
};
