// Pure request handler behind netlify/edge-functions/geo-country.mjs (GET /geo).
//
// Tells the Angular app which country a first-time visitor is in, so it can pick a starting language
// (see src/app/core/i18n/first-visit-language.ts). Netlify resolves the country from the request IP at the
// edge and exposes it as context.geo.country.code; this function forwards ONLY that two-letter code. The
// IP address is never read, logged or returned.
//
// Kill switch: set the Netlify environment variable GEO_LANGUAGE_ENABLED=false and the endpoint answers
// { "country": null }, which the app treats as "unknown" and falls back to the device language. No rebuild
// or redeploy of the app is needed.
//
// CORS: the Capacitor apps call this from https://localhost (Android) and capacitor://localhost (iOS). The
// reply is public, non-credentialed and contains nothing user-specific beyond the country code, so `*` is
// appropriate.

const COUNTRY_CODE = /^[A-Za-z]{2}$/;

const BASE_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  // Per-visitor answer: it must never be cached at the CDN or in a shared cache.
  'cache-control': 'private, no-store',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'accept',
  'x-content-type-options': 'nosniff'
};

export function isGeoLanguageEnabled(rawValue) {
  return String(rawValue ?? 'true').trim().toLowerCase() !== 'false';
}

export function handleGeoCountry(request, context, { enabled = true } = {}) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: BASE_HEADERS });
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { ...BASE_HEADERS, allow: 'GET, HEAD, OPTIONS' }
    });
  }

  const code = enabled ? context?.geo?.country?.code : undefined;
  const country = typeof code === 'string' && COUNTRY_CODE.test(code) ? code.toUpperCase() : null;

  return new Response(JSON.stringify({ country }), { status: 200, headers: BASE_HEADERS });
}
