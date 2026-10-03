// Run with: node --test netlify/edge-functions/lib/sitemap-handler.test.mjs
//
// Lives in lib/ rather than alongside sitemap.mjs for the same reason as
// social-crawler-meta.test.mjs: Netlify's edge-function auto-discovery only scans the top
// level of netlify/edge-functions/, so a test file in a subdirectory never gets bundled as a
// deployable function by mistake.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../sitemap.mjs';

function withFetchStub(impl, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return Promise.resolve(fn()).finally(() => {
    globalThis.fetch = original;
  });
}

function withNetlifyEnvStub(vars, fn) {
  const original = globalThis.Netlify;
  globalThis.Netlify = { env: { get: key => vars[key] } };
  return Promise.resolve(fn()).finally(() => {
    globalThis.Netlify = original;
  });
}

test('serves an empty, noindex sitemap when SITE_URL is not the production origin', async () => {
  const response = await withNetlifyEnvStub({ SITE_URL: 'https://staging--hudhudnest.netlify.app' }, () =>
    withFetchStub(async () => {
      throw new Error('must not call the backend for a non-production origin');
    }, () => handler())
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-robots-tag'), 'noindex');
  const xml = await response.text();
  assert.match(xml, /<urlset[^>]*>\s*<\/urlset>/);
});

test('serves the real sitemap when SITE_URL is unset/mis-scoped but the request hit the production host', async () => {
  const requestedUrls = [];
  const response = await withNetlifyEnvStub({}, () =>
    withFetchStub(async url => {
      requestedUrls.push(url);
      return new Response(JSON.stringify({ items: [{ id: 'p1' }], totalCount: 1 }), { status: 200 });
    }, () => handler(new Request('https://hudhudnest.com/sitemap.xml')))
  );

  assert.equal(response.headers.get('x-robots-tag'), null);
  const xml = await response.text();
  assert.match(xml, /<loc>https:\/\/hudhudnest\.com\/properties\/p1<\/loc>/);
  // properties + short-stay listings + investment projects, one page each.
  assert.equal(requestedUrls.length, 3);
});

test('stays empty+noindex for a non-production host even if SITE_URL is unset', async () => {
  const response = await withNetlifyEnvStub({}, () =>
    withFetchStub(async () => {
      throw new Error('must not call the backend for a non-production host');
    }, () => handler(new Request('https://staging--hudhudnest.netlify.app/sitemap.xml')))
  );

  assert.equal(response.headers.get('x-robots-tag'), 'noindex');
});

test('serves an empty sitemap (not a crash) when SITE_URL is unset', async () => {
  const response = await withNetlifyEnvStub({}, () => handler());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-robots-tag'), 'noindex');
});

test('serves a full sitemap with static pages and paginated properties for the production origin', async () => {
  const requestedUrls = [];
  const response = await withNetlifyEnvStub(
    { SITE_URL: 'https://hudhudnest.com', API_URL: 'https://api.example.test/api' },
    () =>
      withFetchStub(async url => {
        requestedUrls.push(url);
        if (url.includes('/short-stay/listings')) {
          return new Response(JSON.stringify({ items: [{ id: 's1' }], totalCount: 1 }), { status: 200 });
        }
        if (url.includes('/investments/projects')) {
          return new Response(JSON.stringify({ items: [{ id: 'i1' }], totalCount: 1 }), { status: 200 });
        }
        if (url.includes('page=1')) {
          return new Response(
            JSON.stringify({
              items: Array.from({ length: 100 }, (_, i) => ({ id: `p${i}`, updatedAt: '2026-01-01T00:00:00Z' })),
              totalCount: 101
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }
        return new Response(
          JSON.stringify({ items: [{ id: 'p100', updatedAt: '2026-01-02T00:00:00Z' }], totalCount: 101 }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }, () => handler())
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/xml; charset=utf-8');
  // 2 pages of properties + 1 page each of short-stay listings and investment projects.
  assert.equal(requestedUrls.length, 4);
  assert.ok(requestedUrls.includes('https://api.example.test/api/properties?page=1&pageSize=100'));
  assert.ok(requestedUrls.includes('https://api.example.test/api/properties?page=2&pageSize=100'));
  assert.ok(requestedUrls.includes('https://api.example.test/api/short-stay/listings?page=1&pageSize=100'));
  assert.ok(requestedUrls.includes('https://api.example.test/api/investments/projects?page=1&pageSize=100'));

  const xml = await response.text();
  assert.match(xml, /<loc>https:\/\/hudhudnest\.com\/short-stay\/s1<\/loc>/);
  assert.match(xml, /<loc>https:\/\/hudhudnest\.com\/investments\/i1<\/loc>/);
  assert.match(xml, /<loc>https:\/\/hudhudnest\.com\/pricing<\/loc>/);
  assert.match(xml, /<loc>https:\/\/hudhudnest\.com\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/hudhudnest\.com\/properties<\/loc>/);
  assert.match(xml, /<loc>https:\/\/hudhudnest\.com\/properties\/p0<\/loc>/);
  assert.match(xml, /<loc>https:\/\/hudhudnest\.com\/properties\/p100<\/loc><lastmod>2026-01-02<\/lastmod>/);
});

test('degrades to static pages only when the backend is unreachable', async () => {
  const response = await withNetlifyEnvStub({ SITE_URL: 'https://hudhudnest.com' }, () =>
    withFetchStub(async () => {
      throw new Error('network down');
    }, () => handler())
  );

  assert.equal(response.status, 200);
  const xml = await response.text();
  assert.match(xml, /<loc>https:\/\/hudhudnest\.com\/<\/loc>/);
  assert.doesNotMatch(xml, /\/properties\/p/);
});

test('degrades to static pages only when the backend returns a non-OK status', async () => {
  const response = await withNetlifyEnvStub({ SITE_URL: 'https://hudhudnest.com' }, () =>
    withFetchStub(async () => new Response('', { status: 500 }), () => handler())
  );

  assert.equal(response.status, 200);
  const xml = await response.text();
  assert.match(xml, /<loc>https:\/\/hudhudnest\.com\/<\/loc>/);
  assert.doesNotMatch(xml, /\/properties\/p/);
});
