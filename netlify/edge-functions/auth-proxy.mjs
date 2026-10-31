// =============================================================
// netlify/edge-functions/auth-proxy.mjs
//
// Same-origin auth proxy — see ./lib/auth-proxy.mjs's file header for the full incident
// history (why this exists, and why the two declarative netlify.toml/_redirects attempts
// before it both failed live in production).
//
// HOW IT WORKS: intercepts exactly POST/GET requests to /api/auth/* and
// /api/security/csrf-token (see `config` below — Edge Functions run in front of both the
// static Angular build AND the _redirects/netlify.toml rewrite engine), forwards them
// server-side to the real backend, and relays the backend's response — including every
// individual Set-Cookie header — back to the browser under this site's own origin. The
// browser then sees an ordinary same-origin response, so refresh_token/CSRF cookies are never
// third-party cookies in the first place; no SameSite/Partitioned/ITP exception needed.
//
// This must NOT run for local dev or the native Capacitor app — it doesn't: this file only
// exists on the deployed Netlify site, and Angular's src/app/core/auth/auth-api-base-url.ts
// only ever sends a request here in the first place when running as the deployed web app on
// production (see that file's own doc comment for the staging exclusion, still in effect).
//
// CONFIGURATION: reads the backend API base URL from the `API_URL` Netlify environment
// variable — the SAME variable already configured for the Angular build itself and for
// social-crawler-meta.mjs (see that file's own comment). Falls back to the production API if
// unset, matching environment.prod.ts's own fallback.
//
// VERIFICATION NOTE (documented, not hidden): the pure logic (path matching, URL building,
// header allowlisting/relaying) is covered by real, executable tests — see
// ./lib/auth-proxy.test.mjs, runnable with `node --test netlify/edge-functions/lib`. The
// Deno/Netlify runtime glue in THIS file (Netlify.env.get, context.next(), a live fetch to a
// real backend) could not be executed end-to-end in the sandboxed environment this was written
// in — no Deno or Netlify CLI available there. This is the third fix attempt for the same
// underlying bug after two declarative ones failed live; verify this one for real (a real
// login, then a real page reload, on Chrome AND Safari) immediately after deploying — do not
// assume it works just because it deployed without errors, the same as the two before it.
// =============================================================

import { shouldProxyPath, buildTargetUrl, pickForwardableRequestHeaders, addClientIdentityHeaders, buildProxiedResponseHeaders, fetchWithTimeout, BACKEND_FETCH_TIMEOUT_MS } from './lib/auth-proxy.mjs';

const DEFAULT_API_BASE_URL = 'https://api.hudhudnest.com/api';

export default async (request, context) => {
  const url = new URL(request.url);

  if (!shouldProxyPath(url.pathname)) {
    return context.next();
  }

  const apiBaseUrl = (Netlify.env.get('API_URL') || DEFAULT_API_BASE_URL).replace(/\/+$/, '');
  const targetUrl = buildTargetUrl(url.pathname, url.search, apiBaseUrl);
  const isBodylessMethod = request.method === 'GET' || request.method === 'HEAD';

  try {
    const backendResponse = await fetchWithTimeout(
      fetch,
      targetUrl,
      {
        method: request.method,
        // context.ip is the visitor's address as Netlify saw it; EDGE_PROXY_SECRET must equal the
        // API's EdgeProxy__SharedSecret (launch audit A4-001).
        headers: addClientIdentityHeaders(pickForwardableRequestHeaders(request.headers), context.ip, Netlify.env.get('EDGE_PROXY_SECRET')),
        body: isBodylessMethod ? undefined : await request.text()
      },
      BACKEND_FETCH_TIMEOUT_MS
    );

    return new Response(backendResponse.body, {
      status: backendResponse.status,
      statusText: backendResponse.statusText,
      headers: buildProxiedResponseHeaders(backendResponse.headers)
    });
  } catch {
    // Backend unreachable/slow/network failure (including this function's own
    // BACKEND_FETCH_TIMEOUT_MS abort) — the frontend already has its own retry/timeout
    // handling for exactly this (see app.config.ts's restoreSession); surface a plain 502
    // rather than leaking an error page, so it fails the same documented way a direct
    // cross-origin network error would have.
    return new Response(JSON.stringify({ message: 'Upstream request failed.' }), {
      status: 502,
      headers: { 'content-type': 'application/json; charset=utf-8' }
    });
  }
};

export const config = {
  path: ['/api/auth/*', '/api/security/csrf-token']
};
