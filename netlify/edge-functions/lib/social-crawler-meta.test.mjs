// Run with: node --test netlify/edge-functions/lib/social-crawler-meta.test.mjs
//
// Lives in lib/ (not alongside social-crawler-meta.mjs) so Netlify's directory-based edge
// function auto-discovery — which only scans the top level of netlify/edge-functions/, not
// subdirectories — never picks this up as a deployable function. It was previously a sibling
// of social-crawler-meta.mjs and got auto-bundled as one, failing every build with "Default
// export ... must be a function" since a test file has no such export.
//
// This exercises the actual edge function entrypoint (not just the pure lib) under plain
// Node, by stubbing the one Netlify/Deno-specific global it uses (`Netlify.env.get`) — every
// other API it touches (Request/Response/URL/fetch) is standard Fetch API, available natively
// in Node 18+, so this is genuinely running the same code Netlify would run, not a rewrite of
// it. What this CANNOT verify is Netlify's own edge runtime behavior itself (routing via the
// `config.path` glob, `context.next()`'s real pass-through semantics, Deno-specific behavior)
// — see the "VERIFICATION NOTE" in social-crawler-meta.mjs for what still needs a real
// `netlify dev` / deploy-preview check.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../social-crawler-meta.mjs';

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

function makeNextContext() {
  let called = false;
  return {
    next: () => {
      called = true;
      return new Response('spa-passthrough', { status: 200 });
    },
    get wasCalled() { return called; }
  };
}

test('passes through (context.next) for a normal browser User-Agent', async () => {
  const context = makeNextContext();
  const request = new Request('https://hudhudnest.com/properties/p1', {
    headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0' }
  });

  const response = await handler(request, context);

  assert.equal(context.wasCalled, true);
  assert.equal(await response.text(), 'spa-passthrough');
});

test('passes through for a crawler UA on a non-property route', async () => {
  const context = makeNextContext();
  const request = new Request('https://hudhudnest.com/favorites', {
    headers: { 'user-agent': 'facebookexternalhit/1.1' }
  });

  await handler(request, context);

  assert.equal(context.wasCalled, true);
});

const GOOGLEBOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

test('passes the SPA through with 200 for Googlebot on a real property -- it renders the SPA itself', async () => {
  const context = makeNextContext();
  const request = new Request('https://hudhudnest.com/properties/p1', { headers: { 'user-agent': GOOGLEBOT_UA } });

  const response = await withNetlifyEnvStub({ API_URL: 'https://api.example.test/api' }, () =>
    withFetchStub(async url => {
      assert.equal(url, 'https://api.example.test/api/properties/p1');
      return new Response('{}', { status: 200 });
    }, () => handler(request, context))
  );

  assert.equal(context.wasCalled, true);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'spa-passthrough');
});

test('gives Googlebot a real 404 status, keeping the SPA body, when the backend says the property is gone', async () => {
  const context = makeNextContext();
  const request = new Request('https://hudhudnest.com/properties/gone', { headers: { 'user-agent': GOOGLEBOT_UA } });

  const response = await withNetlifyEnvStub({}, () =>
    withFetchStub(async () => new Response('', { status: 404 }), () => handler(request, context))
  );

  assert.equal(response.status, 404);
  assert.equal(await response.text(), 'spa-passthrough');
});

test('fails open (SPA with 200) for Googlebot when the backend errors, 5xxs or times out', async () => {
  for (const impl of [
    async () => { throw new Error('network down'); },
    async () => new Response('', { status: 500 }),
    async () => { throw new DOMException('timed out', 'TimeoutError'); }
  ]) {
    const context = makeNextContext();
    const request = new Request('https://hudhudnest.com/properties/p1', { headers: { 'user-agent': GOOGLEBOT_UA } });

    const response = await withNetlifyEnvStub({}, () => withFetchStub(impl, () => handler(request, context)));

    assert.equal(response.status, 200);
  }
});

test('does not call the backend for a normal browser (no extra round-trip for real visitors)', async () => {
  const context = makeNextContext();
  const request = new Request('https://hudhudnest.com/properties/p1', {
    headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0' }
  });

  await withFetchStub(async () => {
    throw new Error('must not call the backend for a human visitor');
  }, () => handler(request, context));

  assert.equal(context.wasCalled, true);
});

test('canonical/og:url use the production origin when a crawler arrives via an alias host', async () => {
  for (const host of ['https://realestateworld.world', 'https://hudhudnest.netlify.app']) {
    const context = makeNextContext();
    const request = new Request(`${host}/properties/p1/`, { headers: { 'user-agent': 'facebookexternalhit/1.1' } });

    const response = await withNetlifyEnvStub({}, () =>
      withFetchStub(async () => new Response(JSON.stringify({ title: 'شقة' }), { status: 200 }), () =>
        handler(request, context)
      )
    );

    const html = await response.text();
    assert.match(html, /rel="canonical" href="https:\/\/hudhudnest\.com\/properties\/p1"/);
    assert.match(html, /property="og:url" content="https:\/\/hudhudnest\.com\/properties\/p1"/);
  }
});

test('a staging/preview host keeps its own origin as canonical so previews unfurl correctly there', async () => {
  const context = makeNextContext();
  const request = new Request('https://staging--hudhudnest.netlify.app/properties/p1', {
    headers: { 'user-agent': 'facebookexternalhit/1.1' }
  });

  const response = await withNetlifyEnvStub({}, () =>
    withFetchStub(async () => new Response(JSON.stringify({ title: 'شقة' }), { status: 200 }), () =>
      handler(request, context)
    )
  );

  assert.match(await response.text(), /rel="canonical" href="https:\/\/staging--hudhudnest\.netlify\.app\/properties\/p1"/);
});

test('returns pre-rendered HTML with correct tags for a crawler UA on a real property', async () => {
  const context = makeNextContext();
  const request = new Request('https://hudhudnest.com/properties/p1', {
    headers: { 'user-agent': 'facebookexternalhit/1.1' }
  });

  const response = await withNetlifyEnvStub({ API_URL: 'https://api.example.test/api' }, () =>
    withFetchStub(async url => {
      assert.equal(url, 'https://api.example.test/api/properties/p1');
      return new Response(
        JSON.stringify({ title: 'شقة للبيع في طرطوس', city: 'طرطوس', area: 120, rooms: 3, purchasePrice: 75000 }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }, () => handler(request, context))
  );

  assert.equal(context.wasCalled, false);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');

  const html = await response.text();
  assert.match(html, /شقة للبيع في طرطوس/);
  assert.match(html, /property="og:url" content="https:\/\/hudhudnest.com\/properties\/p1"/);
});

test('returns a 404, non-leaking document when the backend 404s (unpublished/deleted/expired)', async () => {
  const context = makeNextContext();
  const request = new Request('https://hudhudnest.com/properties/missing', {
    headers: { 'user-agent': 'Twitterbot/1.0' }
  });

  const response = await withNetlifyEnvStub({}, () =>
    withFetchStub(async () => new Response('', { status: 404 }), () => handler(request, context))
  );

  assert.equal(response.status, 404);
  const html = await response.text();
  assert.ok(!html.includes('og:title'));
});

test('falls back to the SPA (context.next) if the backend call throws', async () => {
  const context = makeNextContext();
  const request = new Request('https://hudhudnest.com/properties/p1', {
    headers: { 'user-agent': 'facebookexternalhit/1.1' }
  });

  await withNetlifyEnvStub({}, () =>
    withFetchStub(async () => { throw new Error('network down'); }, () => handler(request, context))
  );

  assert.equal(context.wasCalled, true);
});
