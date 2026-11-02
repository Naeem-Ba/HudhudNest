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

// ── /landing: marketing-offer previews ────────────────────────────────────────────────────

const FB_UA = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uiuc.php)';
const LIVE_OFFER = {
  id: 'o1',
  name: 'أول 100 مكتب عقاري',
  description: 'خصم للمكاتب المنضمة مبكرًا',
  discountType: 'Percentage',
  discountValue: 25,
  endsAtUtc: '2026-12-31T00:00:00Z',
  maxRedemptions: 100,
  redeemedCount: 3,
  terms: null,
  targetPlanTier: null
};

test('/landing: a social crawler gets og tags built from the live offer', async () => {
  const context = makeNextContext();
  const request = new Request('https://hudhudnest.com/landing?utm_source=facebook', { headers: { 'user-agent': FB_UA } });

  const response = await withNetlifyEnvStub({ API_URL: 'https://api.example.test/api' }, () =>
    withFetchStub(async url => {
      assert.equal(url, 'https://api.example.test/api/offers/active');
      return new Response(JSON.stringify(LIVE_OFFER), { status: 200, headers: { 'content-type': 'application/json' } });
    }, () => handler(request, context)));

  assert.equal(context.wasCalled, false);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<meta property="og:title" content="أول 100 مكتب عقاري \| هدهد نيست">/);
  assert.match(html, /<meta property="og:description" content="خصم 25% — خصم للمكاتب المنضمة مبكرًا">/);
  assert.match(html, /<meta property="og:url" content="https:\/\/hudhudnest\.com\/landing">/);
  assert.match(html, /<meta property="og:image" content="https:\/\/hudhudnest\.com\/images\/og-default\.png">/);
  assert.match(html, /<meta property="og:type" content="website">/);
  // Public offer fields only: no id, counters or status leak into the document.
  assert.doesNotMatch(html, /o1|redeemed|maxRedemptions|Active/);
});

test('/landing: markup in an offer name or description is escaped, never injected', async () => {
  const context = makeNextContext();
  const request = new Request('https://hudhudnest.com/landing', { headers: { 'user-agent': FB_UA } });
  const hostile = { ...LIVE_OFFER, name: 'عرض "><script>alert(1)</script>', description: '<img src=x onerror=alert(1)>' };

  const response = await withNetlifyEnvStub({ API_URL: 'https://api.example.test/api' }, () =>
    withFetchStub(async () => new Response(JSON.stringify(hostile), { status: 200 }), () => handler(request, context)));

  const html = await response.text();
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /<img/i);
});

test('/landing: no live offer (204), backend error or timeout -> normal SPA', async () => {
  for (const respond of [
    async () => new Response(null, { status: 204 }),
    async () => new Response('boom', { status: 500 }),
    async () => { throw new Error('network down'); }
  ]) {
    const context = makeNextContext();
    const request = new Request('https://hudhudnest.com/landing', { headers: { 'user-agent': FB_UA } });

    await withNetlifyEnvStub({ API_URL: 'https://api.example.test/api' }, () =>
      withFetchStub(respond, () => handler(request, context)));

    assert.equal(context.wasCalled, true);
  }
});

test('/landing: real visitors and search engines never trigger a backend call', async () => {
  for (const ua of ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0', GOOGLEBOT_UA]) {
    const context = makeNextContext();
    const request = new Request('https://hudhudnest.com/landing', { headers: { 'user-agent': ua } });
    let fetched = false;

    await withNetlifyEnvStub({ API_URL: 'https://api.example.test/api' }, () =>
      withFetchStub(async () => { fetched = true; return new Response('{}'); }, () => handler(request, context)));

    assert.equal(fetched, false);
    assert.equal(context.wasCalled, true);
  }
});

test('the edge function is mounted on /landing as well as /properties/*', async () => {
  const { config } = await import('../social-crawler-meta.mjs');
  assert.deepEqual(config.path, ['/properties/*', '/landing']);
});

test('a crawler on a link with ?lang=de gets the German preview, with the canonical URL untouched', async () => {
  const request = new Request('https://hudhudnest.com/properties/p1?utm_source=whatsapp&lang=de', {
    headers: { 'user-agent': 'WhatsApp/2.23.20.0' }
  });
  const property = { title: 'Wohnung in Damaskus', rooms: 2, city: 'Damaskus' };

  const response = await withNetlifyEnvStub({}, () =>
    withFetchStub(async () => new Response(JSON.stringify(property), { status: 200 }), () => handler(request, makeNextContext()))
  );
  const html = await response.text();

  assert.match(html, /<html lang="de" dir="ltr">/);
  assert.match(html, /og:locale" content="de_DE"/);
  assert.match(html, /2 Zimmer/);
  assert.match(html, /rel="canonical" href="https:\/\/hudhudnest.com\/properties\/p1"/);
});

test('a crawler on a link without ?lang= still gets the Arabic preview', async () => {
  const request = new Request('https://hudhudnest.com/properties/p1', { headers: { 'user-agent': 'WhatsApp/2.23.20.0' } });

  const response = await withNetlifyEnvStub({}, () =>
    withFetchStub(async () => new Response(JSON.stringify({ title: 'شقة', rooms: 2 }), { status: 200 }), () => handler(request, makeNextContext()))
  );

  assert.match(await response.text(), /<html lang="ar" dir="rtl">/);
});
