// Run with: node --test netlify/edge-functions/lib/geo-country.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleGeoCountry, isGeoLanguageEnabled } from './geo-country.mjs';

const get = () => new Request('https://hudhudnest.com/geo');
const ctx = code => ({ geo: { country: code === undefined ? undefined : { code } } });

test('returns only the upper-cased country code', async () => {
  const res = handleGeoCountry(get(), ctx('de'));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { country: 'DE' });
});

test('returns null when Netlify has no country (local, unknown IP)', async () => {
  assert.deepEqual(await handleGeoCountry(get(), ctx(undefined)).json(), { country: null });
  assert.deepEqual(await handleGeoCountry(get(), {}).json(), { country: null });
});

test('ignores malformed country values', async () => {
  for (const bad of ['', 'DEU', 'D1', 42, null]) {
    assert.deepEqual(await handleGeoCountry(get(), ctx(bad)).json(), { country: null }, String(bad));
  }
});

test('answers null when the feature is switched off', async () => {
  const res = handleGeoCountry(get(), ctx('SY'), { enabled: false });
  assert.deepEqual(await res.json(), { country: null });
});

test('GEO_LANGUAGE_ENABLED: only an explicit "false" disables it', () => {
  assert.equal(isGeoLanguageEnabled(undefined), true);
  assert.equal(isGeoLanguageEnabled(''), true);
  assert.equal(isGeoLanguageEnabled('true'), true);
  assert.equal(isGeoLanguageEnabled('FALSE'), false);
  assert.equal(isGeoLanguageEnabled(' false '), false);
});

test('is never cached and is readable by the native apps', () => {
  const res = handleGeoCountry(get(), ctx('SY'));
  assert.equal(res.headers.get('cache-control'), 'private, no-store');
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  assert.match(res.headers.get('content-type'), /^application\/json/);
});

test('answers CORS preflight and rejects other methods', () => {
  const preflight = handleGeoCountry(new Request('https://hudhudnest.com/geo', { method: 'OPTIONS' }), ctx('SY'));
  assert.equal(preflight.status, 204);

  const post = handleGeoCountry(new Request('https://hudhudnest.com/geo', { method: 'POST' }), ctx('SY'));
  assert.equal(post.status, 405);
});

test('the response never contains an IP address', async () => {
  const res = handleGeoCountry(get(), { ip: '203.0.113.9', geo: { country: { code: 'AT' } } });
  assert.equal((await res.text()).includes('203.0.113.9'), false);
});
