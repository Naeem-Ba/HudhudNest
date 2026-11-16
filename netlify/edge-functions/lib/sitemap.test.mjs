// Run with: node --test netlify/edge-functions/lib/sitemap.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PRODUCTION_SITE_URL,
  isProductionSiteUrl,
  escapeXml,
  toLastmod,
  buildStaticUrlEntries,
  buildPropertyUrlEntries,
  buildShortStayUrlEntries,
  buildInvestmentUrlEntries,
  buildOfficeUrlEntries,
  MAX_SITEMAP_URLS,
  buildSitemapXml,
  buildEmptySitemapXml,
  fetchAllPublishedProperties
} from './sitemap.mjs';

test('isProductionSiteUrl matches only the real production origin', () => {
  assert.equal(isProductionSiteUrl(PRODUCTION_SITE_URL), true);
  assert.equal(isProductionSiteUrl(`${PRODUCTION_SITE_URL}/`), true);
  assert.equal(isProductionSiteUrl('https://staging--hudhudnest.netlify.app'), false);
  assert.equal(isProductionSiteUrl('https://deploy-preview-42--hudhudnest.netlify.app'), false);
  assert.equal(isProductionSiteUrl(''), false);
  assert.equal(isProductionSiteUrl(undefined), false);
});

test('escapeXml escapes all five XML-significant characters', () => {
  assert.equal(escapeXml(`a & b < c > d " e ' f`), 'a &amp; b &lt; c &gt; d &quot; e &apos; f');
});

test('toLastmod returns a date-only ISO string for a valid date', () => {
  assert.equal(toLastmod('2026-09-18T12:34:56Z'), '2026-09-18');
});

test('toLastmod returns null for missing or unparseable input', () => {
  assert.equal(toLastmod(null), null);
  assert.equal(toLastmod(undefined), null);
  assert.equal(toLastmod('not-a-date'), null);
});

test('buildStaticUrlEntries lists every public page, once, and no private route', () => {
  const entries = buildStaticUrlEntries('https://hudhudnest.com');
  const locs = entries.map(e => e.loc);
  for (const path of ['/', '/properties', '/short-stay', '/investments', '/services', '/offices', '/map', '/price-estimate',
    '/valuation', '/expats', '/pricing', '/kontakt', '/privacy-policy', '/terms-of-service', '/impressum', '/download']) {
    assert.ok(locs.includes(`https://hudhudnest.com${path}`), `missing ${path}`);
  }
  assert.equal(new Set(locs).size, locs.length, 'duplicate static entries');
  assert.ok(!locs.some(l => /\/(admin|dashboard|login|my-|account|messages)/.test(l)), 'private route leaked');
});

test('buildShortStayUrlEntries skips hidden, unpublished and id-less listings', () => {
  const entries = buildShortStayUrlEntries('https://hudhudnest.com', [
    { id: 's1', updatedAt: '2026-02-03T00:00:00Z', isPublished: true },
    { id: 's2', isPublished: false },
    { id: 's3', isTakenDown: true },
    { id: 's4' },
    null,
    {}
  ]);
  assert.deepEqual(entries.map(e => e.loc), [
    'https://hudhudnest.com/short-stay/s1',
    'https://hudhudnest.com/short-stay/s4'
  ]);
  assert.equal(entries[0].lastmod, '2026-02-03');
});

test('buildInvestmentUrlEntries builds one /investments/:id entry per project', () => {
  const entries = buildInvestmentUrlEntries('https://hudhudnest.com', [{ id: 'i1' }, { id: '' }, { id: 'i2' }]);
  assert.deepEqual(entries.map(e => e.loc), [
    'https://hudhudnest.com/investments/i1',
    'https://hudhudnest.com/investments/i2'
  ]);
});

test('buildSitemapXml never exceeds the 50000-URL protocol cap', () => {
  const entries = Array.from({ length: MAX_SITEMAP_URLS + 25 }, (_, i) => ({ loc: `https://hudhudnest.com/properties/${i}` }));
  const xml = buildSitemapXml(entries);
  assert.equal((xml.match(/<url>/g) || []).length, MAX_SITEMAP_URLS);
});

test('buildPropertyUrlEntries builds one /properties/:id entry per property, falling back to publishedAt', () => {
  const entries = buildPropertyUrlEntries('https://hudhudnest.com', [
    { id: 'p1', updatedAt: '2026-01-02T00:00:00Z' },
    { id: 'p2', publishedAt: '2026-03-04T00:00:00Z' },
    { id: 'p 3' }
  ]);

  assert.equal(entries[0].loc, 'https://hudhudnest.com/properties/p1');
  assert.equal(entries[0].lastmod, '2026-01-02');
  assert.equal(entries[1].loc, 'https://hudhudnest.com/properties/p2');
  assert.equal(entries[1].lastmod, '2026-03-04');
  // A GUID never needs escaping in practice, but the id is still passed through encodeURIComponent.
  assert.equal(entries[2].loc, 'https://hudhudnest.com/properties/p%203');
  assert.equal(entries[2].lastmod, null);
});

test('buildSitemapXml emits a valid urlset with lastmod only when present', () => {
  const xml = buildSitemapXml([
    { loc: 'https://hudhudnest.com/', changefreq: 'daily', priority: '1.0' },
    { loc: 'https://hudhudnest.com/properties/p1', lastmod: '2026-01-02', changefreq: 'daily', priority: '0.6' }
  ]);

  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.match(xml, /<loc>https:\/\/hudhudnest\.com\/<\/loc><changefreq>daily<\/changefreq><priority>1\.0<\/priority>/);
  assert.match(xml, /<loc>https:\/\/hudhudnest\.com\/properties\/p1<\/loc><lastmod>2026-01-02<\/lastmod>/);
  assert.match(xml, /<\/urlset>\s*$/);
});

test('buildEmptySitemapXml is a valid, empty urlset', () => {
  const xml = buildEmptySitemapXml();
  assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">\s*<\/urlset>/);
});

test('fetchAllPublishedProperties stops once totalCount is reached, not on a short-page guess', async () => {
  const calls = [];
  const properties = await fetchAllPublishedProperties(async (page, pageSize) => {
    calls.push(page);
    if (page === 1) return { items: Array.from({ length: pageSize }, (_, i) => ({ id: `p${i}` })), totalCount: 150 };
    if (page === 2) return { items: Array.from({ length: 50 }, (_, i) => ({ id: `p${100 + i}` })), totalCount: 150 };
    throw new Error('should not fetch a third page');
  }, { pageSize: 100 });

  assert.deepEqual(calls, [1, 2]);
  assert.equal(properties.length, 150);
});

test('fetchAllPublishedProperties falls back to the short-page heuristic when totalCount is absent', async () => {
  const properties = await fetchAllPublishedProperties(async page => {
    if (page === 1) return { items: [{ id: 'a' }, { id: 'b' }] };
    throw new Error('should not fetch a second page');
  }, { pageSize: 2 });

  assert.equal(properties.length, 2);
});

test('fetchAllPublishedProperties keeps already-gathered pages when a later page fails', async () => {
  const properties = await fetchAllPublishedProperties(async page => {
    if (page === 1) return { items: [{ id: 'a' }], totalCount: 999 };
    throw new Error('backend down');
  }, { pageSize: 1 });

  assert.deepEqual(properties, [{ id: 'a' }]);
});

test('fetchAllPublishedProperties never loops past maxPages even if totalCount lies', async () => {
  let calls = 0;
  const properties = await fetchAllPublishedProperties(
    async page => {
      calls++;
      return { items: [{ id: `p${page}` }], totalCount: Number.MAX_SAFE_INTEGER };
    },
    { pageSize: 1, maxPages: 3 }
  );

  assert.equal(calls, 3);
  assert.equal(properties.length, 3);
});

test('buildOfficeUrlEntries lists each directory office once, by slug, with no lastmod', () => {
  const entries = buildOfficeUrlEntries('https://hudhudnest.com', [
    { id: 'a1', slug: 'yasmin' },
    { id: 'a2', slug: '' },
    { id: 'a3' },
    null,
    { id: 'a1', slug: 'yasmin' },
    { id: 'a4', slug: 'مكتب-الشام' }
  ]);
  assert.deepEqual(entries.map(e => e.loc), [
    'https://hudhudnest.com/offices/yasmin',
    `https://hudhudnest.com/offices/${encodeURIComponent('مكتب-الشام')}`
  ]);
  assert.ok(entries.every(e => e.lastmod === null));
});
