// Run with: node --test netlify/edge-functions/lib
// Plain Node's built-in test runner — same convention as social-crawler.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldProxyPath,
  buildTargetUrl,
  pickForwardableRequestHeaders,
  buildProxiedResponseHeaders,
  fetchWithTimeout
} from './auth-proxy.mjs';

test('shouldProxyPath matches /api/security/csrf-token exactly', () => {
  assert.equal(shouldProxyPath('/api/security/csrf-token'), true);
  assert.equal(shouldProxyPath('/api/security/csrf-token/'), false);
  assert.equal(shouldProxyPath('/api/security/other'), false);
});

test('shouldProxyPath matches /api/auth and every /api/auth/* sub-path', () => {
  assert.equal(shouldProxyPath('/api/auth'), true);
  assert.equal(shouldProxyPath('/api/auth/login'), true);
  assert.equal(shouldProxyPath('/api/auth/refresh'), true);
  assert.equal(shouldProxyPath('/api/auth/logout'), true);
  // Multi-segment sub-paths — this is the exact class of endpoint the declarative
  // `[[redirects]]` splat also had to match (phone/social/OTP auth flows).
  assert.equal(shouldProxyPath('/api/auth/phone/registration/verify'), true);
  assert.equal(shouldProxyPath('/api/auth/social/google'), true);
});

test('shouldProxyPath rejects unrelated paths', () => {
  assert.equal(shouldProxyPath('/api/properties'), false);
  assert.equal(shouldProxyPath('/api/authors'), false); // must not match on a bare prefix
  assert.equal(shouldProxyPath('/'), false);
});

test('buildTargetUrl strips the apiBaseUrl\'s trailing /api and appends the full incoming path', () => {
  assert.equal(
    buildTargetUrl('/api/auth/login', '', 'https://api.hudhudnest.com/api'),
    'https://api.hudhudnest.com/api/auth/login'
  );
});

test('buildTargetUrl preserves the query string', () => {
  assert.equal(
    buildTargetUrl('/api/security/csrf-token', '?x=1', 'https://api.hudhudnest.com/api'),
    'https://api.hudhudnest.com/api/security/csrf-token?x=1'
  );
});

test('buildTargetUrl tolerates a trailing slash on apiBaseUrl', () => {
  assert.equal(
    buildTargetUrl('/api/auth/refresh', '', 'https://api.hudhudnest.com/api/'),
    'https://api.hudhudnest.com/api/auth/refresh'
  );
});

test('pickForwardableRequestHeaders copies only the allowlisted headers', () => {
  const incoming = new Headers({
    cookie: 'refresh_token=abc',
    'content-type': 'application/json',
    'x-xsrf-token': 'token-value',
    'x-forwarded-for': '1.2.3.4', // must NOT be forwarded
    host: 'hudhudnest.com' // must NOT be forwarded
  });

  const forwarded = pickForwardableRequestHeaders(incoming);

  assert.equal(forwarded.get('cookie'), 'refresh_token=abc');
  assert.equal(forwarded.get('content-type'), 'application/json');
  assert.equal(forwarded.get('x-xsrf-token'), 'token-value');
  assert.equal(forwarded.get('x-forwarded-for'), null);
  assert.equal(forwarded.get('host'), null);
});

test('pickForwardableRequestHeaders forwards the Bearer token ([Authorize] endpoints under /api/auth/* need it)', () => {
  // Regression (2026-10-08): the allowlist lacked `authorization`, so POST /api/auth/email/add (and
  // logout, phone/change/*, phone/reverification/*) reached the API without a token and answered a
  // bare 401 no matter how fresh the token was.
  const incoming = new Headers({
    authorization: 'Bearer test-access-token',
    'content-type': 'application/json'
  });

  const forwarded = pickForwardableRequestHeaders(incoming);

  assert.equal(forwarded.get('authorization'), 'Bearer test-access-token');
});

test('pickForwardableRequestHeaders sends no authorization header when the caller sent none', () => {
  const forwarded = pickForwardableRequestHeaders(new Headers({ 'content-type': 'application/json' }));

  assert.equal(forwarded.get('authorization'), null);
});

test('buildProxiedResponseHeaders drops content-encoding/content-length/transfer-encoding', () => {
  const backendHeaders = new Headers({
    'content-type': 'application/json',
    'content-encoding': 'br',
    'content-length': '123',
    'transfer-encoding': 'chunked'
  });

  const result = buildProxiedResponseHeaders(backendHeaders);

  assert.equal(result.get('content-type'), 'application/json');
  assert.equal(result.get('content-encoding'), null);
  assert.equal(result.get('content-length'), null);
  assert.equal(result.get('transfer-encoding'), null);
});

test('buildProxiedResponseHeaders relays EVERY Set-Cookie header individually via getSetCookie(), not merged', () => {
  // This is the exact bug this whole file exists to avoid: a plain Headers.get('set-cookie')
  // joins multiple cookies into one comma-separated string, corrupting each cookie's own
  // Expires date (which itself contains a comma) and losing the second cookie entirely.
  const backendHeaders = new Headers();
  backendHeaders.append('set-cookie', 'refresh_token=abc; Path=/api/auth; Secure; SameSite=None; Partitioned');
  backendHeaders.append('set-cookie', 'XSRF-TOKEN=xyz; Secure; SameSite=None; Partitioned');

  const result = buildProxiedResponseHeaders(backendHeaders);
  const relayedCookies = result.getSetCookie();

  assert.equal(relayedCookies.length, 2);
  assert.ok(relayedCookies.some(c => c.startsWith('refresh_token=abc')));
  assert.ok(relayedCookies.some(c => c.startsWith('XSRF-TOKEN=xyz')));
});

test('buildProxiedResponseHeaders on a response with no cookies sets none', () => {
  const backendHeaders = new Headers({ 'content-type': 'application/json' });
  const result = buildProxiedResponseHeaders(backendHeaders);

  assert.equal(result.getSetCookie().length, 0);
});

test('fetchWithTimeout resolves normally when the backend responds well within the budget', async () => {
  const fakeFetch = async (url, options) => {
    assert.equal(url, 'https://example.test/x');
    assert.equal(options.signal instanceof AbortSignal, true);
    return new Response('ok', { status: 200 });
  };

  const response = await fetchWithTimeout(fakeFetch, 'https://example.test/x', {}, 1000);
  assert.equal(response.status, 200);
});

test('fetchWithTimeout aborts and rejects once the backend exceeds the budget, instead of hanging', async () => {
  // Regression guard for the 2026-09-18 Google Sign-In incident: a slow (not just
  // unreachable) backend response must not be allowed to hang past this function's own
  // budget, or the platform ends up killing the whole edge function ungracefully instead.
  const neverSettlingFetch = (url, options) =>
    new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('aborted')));
    });

  await assert.rejects(
    () => fetchWithTimeout(neverSettlingFetch, 'https://example.test/slow', {}, 20)
  );
});

test('fetchWithTimeout propagates the fetch implementation\'s own rejection unchanged', async () => {
  const failingFetch = async () => {
    throw new TypeError('network error');
  };

  await assert.rejects(
    () => fetchWithTimeout(failingFetch, 'https://example.test/x', {}, 1000),
    TypeError
  );
});
