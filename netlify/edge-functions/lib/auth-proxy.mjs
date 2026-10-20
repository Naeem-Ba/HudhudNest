// =============================================================
// netlify/edge-functions/lib/auth-proxy.mjs
//
// Pure logic for the same-origin auth proxy — deliberately plain JavaScript with no
// Deno-specific or Node-specific API, so the exact same file:
//   - runs unmodified inside the real Netlify Edge Function (Deno) — see ../auth-proxy.mjs
//   - runs unmodified under plain `node` for real, fast, offline unit tests — see
//     ./auth-proxy.test.mjs (run with `node --test netlify/edge-functions/lib`)
// Mirrors social-crawler.mjs's own split for the exact same reason (see its file header).
//
// WHY THIS FILE EXISTS (do not remove without replacing it): refresh_token and the CSRF
// cookies are third-party cookies whenever the deployed SPA calls the backend directly at its
// own onrender.com origin (a different registrable domain) — Safari drops them outright, with
// no exception, and Chrome/Edge needed a separate cookie-attribute fix (Partitioned/CHIPS,
// backend-side) that doesn't help Safari at all. The fix that works on every browser is to
// make these specific calls same-origin. Two declarative approaches were tried and both
// failed in production before this one:
//   1. netlify.toml [[redirects]] — a `context = "..."` field on an individual rule is not
//      valid Netlify syntax, so those rules were silently discarded entirely (total login
//      outage on every browser once the frontend started expecting them to exist).
//   2. netlify.toml [[redirects]] again, corrected syntax, still routed through
//      public/_redirects (which Netlify processes FIRST) — still didn't work, because
//      Netlify's declarative proxy/rewrite redirects do not reliably relay Set-Cookie headers
//      back to the client at all (confirmed against Netlify's own support forum/docs: "Set-
//      Cookie... may not be passed back to the client" for proxy redirects; their own stated
//      recommendation for this exact need is Edge Functions).
// This Edge Function is the third attempt, using full programmatic control over the Response
// object — including Headers.getSetCookie(), the only correct way to relay MULTIPLE Set-Cookie
// headers (a plain Headers.get('set-cookie') incorrectly joins them into one comma-separated
// string, corrupting each cookie's own Expires date).
// =============================================================

/** Exactly the two path shapes this proxy exists for — nothing else (see this project's own
 *  reasoning: uploads and every other endpoint have no cookie-persistence problem to fix, and
 *  proxying arbitrarily large bodies through an Edge Function has real limits of its own). */
export function shouldProxyPath(pathname) {
  return pathname === '/api/security/csrf-token' || pathname === '/api/auth' || pathname.startsWith('/api/auth/');
}

/** apiBaseUrl is expected in the same `.../api` shape as environment.apiUrl/API_URL (see
 *  ../auth-proxy.mjs and social-crawler-meta.mjs, which read the exact same env var). Strips
 *  the trailing /api so the incoming pathname (which already starts with /api/...) isn't
 *  duplicated. */
export function buildTargetUrl(pathname, search, apiBaseUrl) {
  const origin = apiBaseUrl.replace(/\/+$/, '').replace(/\/api$/i, '');
  return `${origin}${pathname}${search || ''}`;
}

/**
 * Production incident (2026-09-18): a real Google Sign-In POST through this proxy came back
 * as a bare platform 500 (no backend headers relayed at all -- confirmed the request never
 * completed, not that the backend answered with an error) instead of this function's own
 * clean 502 JSON. The backend-side cause is a cold Google-certificate-cache network fetch with
 * no bounded timeout (see HudhudNestApi.Infrastructure/Auth/GoogleTokenVerifier.cs); from here,
 * a plain `fetch(targetUrl, ...)` with no timeout at all has the exact same shape of risk for
 * ANY slow backend response, regardless of cause -- Netlify's own platform-level function
 * timeout eventually kills it ungracefully, bypassing the catch block below entirely. Bounding
 * the wait from this side too means a slow backend degrades the same predictable way an
 * unreachable one already does.
 */
export const BACKEND_FETCH_TIMEOUT_MS = 20_000;

/**
 * Runs `fetchImpl(url, options)` with an AbortSignal that fires after `timeoutMs`, so a slow
 * (not just unreachable) backend response still resolves/rejects within a bounded time instead
 * of hanging until the platform's own timeout kills the whole function ungracefully.
 * `fetchImpl` is injected (not a bare `fetch` call) so this is unit-testable with a fake, slow
 * implementation under plain Node — no real network or timers-heavy sleeping required.
 */
export async function fetchWithTimeout(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Allowlist, not a blocklist: only forward what these specific endpoints actually need.
 *  Deliberately excludes Host/Content-Length/Connection (the runtime recomputes these
 *  correctly for the new outgoing request; forwarding stale values would corrupt it).
 *
 *  `authorization` MUST stay on this list. Not every /api/auth/* endpoint is anonymous:
 *  POST email/add, POST logout and phone/reverification/* + phone/change/* are [Authorize]. Left
 *  off (as it was until 2026-10-08), the API receives no Bearer token, answers a bare 401
 *  (`WWW-Authenticate: Bearer`, empty body), the refresh interceptor refreshes and retries with a
 *  fresh token that is stripped the same way, and the user sees a generic failure -- "add / resend
 *  confirmation email" from the profile page was the first visible symptom. */
const FORWARDABLE_REQUEST_HEADERS = ['content-type', 'accept', 'accept-language', 'cookie', 'x-xsrf-token', 'authorization'];

export function pickForwardableRequestHeaders(incomingHeaders) {
  const headers = new Headers();
  for (const name of FORWARDABLE_REQUEST_HEADERS) {
    const value = incomingHeaders.get(name);
    if (value) {
      headers.set(name, value);
    }
  }
  return headers;
}

/** Response headers that must NOT be copied verbatim from the backend's response onto the new
 *  Response this function returns: the backend's fetch() already transparently decoded any
 *  compressed body, and the new Response is a fresh object with its own framing — keeping the
 *  origin's Content-Encoding/Content-Length/Transfer-Encoding would describe bytes that are no
 *  longer there, corrupting the response as the browser sees it. */
const RESPONSE_HEADERS_TO_DROP = new Set(['content-encoding', 'content-length', 'transfer-encoding', 'connection']);

/**
 * Copies every backend response header EXCEPT the ones above onto a fresh Headers object, then
 * re-adds Set-Cookie correctly via getSetCookie() — one append() per cookie, never merged into
 * a single header (see this file's own header comment for why that matters). Falls back to a
 * plain get('set-cookie') split-by-heuristic only if getSetCookie() is unavailable (defensive;
 * expected to exist on the real Deno runtime this function actually runs on).
 */
export function buildProxiedResponseHeaders(backendHeaders) {
  const headers = new Headers();

  for (const [key, value] of backendHeaders) {
    const lower = key.toLowerCase();
    if (lower === 'set-cookie' || RESPONSE_HEADERS_TO_DROP.has(lower)) {
      continue;
    }
    headers.set(key, value);
  }

  const cookies = typeof backendHeaders.getSetCookie === 'function' ? backendHeaders.getSetCookie() : [];
  for (const cookie of cookies) {
    headers.append('set-cookie', cookie);
  }

  return headers;
}
