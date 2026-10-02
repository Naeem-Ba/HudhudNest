// Run with: node --test netlify/edge-functions/lib
// Plain Node's built-in test runner — no extra dependency, and this file (like the module it
// tests) needs nothing beyond standard JS, so it runs identically to how Deno would run it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isSocialCrawlerUserAgent,
  extractPropertyIdFromPath,
  sanitizeText,
  escapeHtml,
  buildSummary,
  buildListingJsonLd,
  buildPropertyMetaHtml,
  buildNotFoundHtml
} from './social-crawler.mjs';

test('isSocialCrawlerUserAgent recognizes known crawlers (case-insensitive)', () => {
  assert.equal(isSocialCrawlerUserAgent('facebookexternalhit/1.1'), true);
  assert.equal(isSocialCrawlerUserAgent('WhatsApp/2.23.20.0'), true);
  assert.equal(isSocialCrawlerUserAgent('TelegramBot (like TwitterBot)'), true);
  assert.equal(isSocialCrawlerUserAgent('Mozilla/5.0 (compatible; Twitterbot/1.0)'), true);
  assert.equal(isSocialCrawlerUserAgent('LinkedInBot/1.0'), true);
});

test('isSocialCrawlerUserAgent rejects a normal browser UA', () => {
  assert.equal(
    isSocialCrawlerUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36'
    ),
    false
  );
});

test('isSocialCrawlerUserAgent rejects an empty/missing UA', () => {
  assert.equal(isSocialCrawlerUserAgent(''), false);
  assert.equal(isSocialCrawlerUserAgent(undefined), false);
});

test('extractPropertyIdFromPath matches /properties/{id} and /properties/{id}/', () => {
  assert.equal(extractPropertyIdFromPath('/properties/abc-123'), 'abc-123');
  assert.equal(extractPropertyIdFromPath('/properties/abc-123/'), 'abc-123');
});

test('extractPropertyIdFromPath returns null for anything else', () => {
  assert.equal(extractPropertyIdFromPath('/properties'), null);
  assert.equal(extractPropertyIdFromPath('/properties/abc/edit'), null);
  assert.equal(extractPropertyIdFromPath('/'), null);
  assert.equal(extractPropertyIdFromPath('/favorites'), null);
});

test('extractPropertyIdFromPath URL-decodes the id', () => {
  assert.equal(extractPropertyIdFromPath('/properties/abc%20def'), 'abc def');
});

test('sanitizeText strips HTML tags (content stays as inert text, matching PropertyMetaService.sanitize())', () => {
  // Strips the tag markers, not their text content — the same behavior as the Angular-side
  // sanitizer. This is still safe: once the markers are gone, "alert(1)" is plain text with no
  // surrounding <script> element, so it can never execute — it just renders as harmless text.
  assert.equal(sanitizeText('<script>alert(1)</script>شقة'), 'alert(1)شقة');
  assert.equal(sanitizeText('<b>شقة</b> رائعة'), 'شقة رائعة');
});

test('sanitizeText collapses whitespace and trims', () => {
  assert.equal(sanitizeText('  شقة   جميلة  '), 'شقة جميلة');
});

test('escapeHtml escapes the five HTML-significant characters', () => {
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
});

test('buildSummary combines area, rooms, price and city', () => {
  const summary = buildSummary({
    area: 120,
    rooms: 3,
    purchasePrice: 75000,
    currencyCode: 'USD',
    city: 'طرطوس'
  });

  assert.match(summary, /120/);
  assert.match(summary, /3 غرف/);
  assert.match(summary, /75,000/);
  assert.match(summary, /طرطوس/);
});

test('buildSummary caps length at 160 characters', () => {
  const summary = buildSummary({ city: 'مدينة-'.repeat(60) });
  assert.ok(summary.length <= 160);
});

test('buildSummary returns an empty string when there is nothing structured to show', () => {
  assert.equal(buildSummary({}), '');
});

test('buildPropertyMetaHtml includes every required tag', () => {
  const html = buildPropertyMetaHtml({
    property: {
      title: 'شقة للبيع في طرطوس',
      city: 'طرطوس',
      area: 120,
      rooms: 3,
      purchasePrice: 75000,
      currencyCode: 'USD',
      mainImageUrl: 'https://res.cloudinary.com/demo/image/upload/cover.jpg'
    },
    canonicalUrl: 'https://hudhudnest.com/properties/p1',
    fallbackImageUrl: 'https://hudhudnest.com/images/og-default.png'
  });

  assert.match(html, /<html lang="ar" dir="rtl">/);
  assert.match(html, /<title>شقة للبيع في طرطوس \| هدهد نيست<\/title>/);
  assert.match(html, /property="og:title" content="شقة للبيع في طرطوس \| هدهد نيست"/);
  assert.match(html, /property="og:description"/);
  assert.match(html, /property="og:image" content="https:\/\/res\.cloudinary\.com\/demo\/image\/upload\/cover\.jpg"/);
  assert.match(html, /property="og:url" content="https:\/\/hudhudnest.com\/properties\/p1"/);
  assert.match(html, /property="og:type" content="website"/);
  assert.match(html, /property="og:site_name" content="هدهد نيست"/);
  assert.match(html, /property="og:locale" content="ar_SY"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /name="twitter:title"/);
  assert.match(html, /name="twitter:description"/);
  assert.match(html, /name="twitter:image"/);
  assert.match(html, /<link rel="canonical" href="https:\/\/hudhudnest.com\/properties\/p1">/);
});

test('buildPropertyMetaHtml falls back to the branded placeholder image when the property has none', () => {
  const html = buildPropertyMetaHtml({
    property: { title: 'شقة' },
    canonicalUrl: 'https://hudhudnest.com/properties/p1',
    fallbackImageUrl: 'https://hudhudnest.com/images/og-default.png'
  });

  assert.match(html, /og:image" content="https:\/\/hudhudnest.com\/images\/og-default\.png"/);
});

test('buildPropertyMetaHtml escapes a title containing HTML/quote characters', () => {
  const html = buildPropertyMetaHtml({
    property: { title: `شقة "خاصة" <script>alert(1)</script>` },
    canonicalUrl: 'https://hudhudnest.com/properties/p1',
    fallbackImageUrl: 'https://hudhudnest.com/images/og-default.png'
  });

  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(!html.includes('content="شقة "خاصة"'));
});

test('buildPropertyMetaHtml never emits an internal Angular route as the canonical/og:url value', () => {
  const html = buildPropertyMetaHtml({
    property: { title: 'شقة' },
    canonicalUrl: 'https://hudhudnest.com/properties/p1',
    fallbackImageUrl: 'https://hudhudnest.com/images/og-default.png'
  });

  assert.ok(!html.includes('og:url" content="https://hudhudnest.com/properties/p1#'));
});

test('buildListingJsonLd builds a RealEstateListing with Offer for a sale', () => {
  const json = buildListingJsonLd(
    {
      title: 'شقة للبيع في طرطوس',
      city: 'طرطوس',
      countryCode: 'SY',
      listingType: 'ForSale',
      status: 'Available',
      purchasePrice: 75000,
      currencyCode: 'USD'
    },
    'https://hudhudnest.com/properties/p1'
  );

  assert.equal(json['@context'], 'https://schema.org');
  assert.equal(json['@type'], 'RealEstateListing');
  assert.equal(json.name, 'شقة للبيع في طرطوس');
  assert.equal(json.url, 'https://hudhudnest.com/properties/p1');
  assert.equal(json.offers.price, 75000);
  assert.equal(json.offers.priceCurrency, 'USD');
  assert.equal(json.offers.businessFunction, 'http://purl.org/goodrelations/v1#Sell');
  assert.equal(json.offers.availability, 'https://schema.org/InStock');
  assert.deepEqual(json.address, { '@type': 'PostalAddress', addressLocality: 'طرطوس', addressCountry: 'SY' });
});

test('buildListingJsonLd maps rent/sold/reserved correctly and omits offers without a price', () => {
  const rent = buildListingJsonLd(
    { title: 'شقة', listingType: 'ForRent', status: 'Reserved', coldRent: 400, currencyCode: 'USD' },
    'https://hudhudnest.com/properties/p1'
  );
  assert.equal(rent.offers.businessFunction, 'http://purl.org/goodrelations/v1#LeaseOut');
  assert.equal(rent.offers.availability, 'https://schema.org/LimitedAvailability');

  const sold = buildListingJsonLd({ title: 'شقة', status: 'Sold' }, 'https://hudhudnest.com/properties/p1');
  assert.equal(sold.offers, undefined);
});

test('buildListingJsonLd never lets a sanitized field break out of the <script> tag', () => {
  const json = buildListingJsonLd(
    { title: '</script><script>alert(1)</script>شقة' },
    'https://hudhudnest.com/properties/p1'
  );
  assert.ok(!json.name.includes('<'));
});

test('buildPropertyMetaHtml embeds valid, escaped JSON-LD that JSON.parse can read back', () => {
  const html = buildPropertyMetaHtml({
    property: { title: 'شقة للبيع في طرطوس', purchasePrice: 75000, currencyCode: 'USD', listingType: 'ForSale' },
    canonicalUrl: 'https://hudhudnest.com/properties/p1',
    fallbackImageUrl: 'https://hudhudnest.com/images/og-default.png'
  });

  const match = /<script type="application\/ld\+json">(.*)<\/script>/.exec(html);
  assert.ok(match, 'expected a JSON-LD <script> tag in the output');

  const parsed = JSON.parse(match[1]);
  assert.equal(parsed['@type'], 'RealEstateListing');
  assert.equal(parsed.offers.price, 75000);
});

test('buildPropertyMetaHtml JSON-LD can never be broken out of by a literal "</script>" in the data', () => {
  const html = buildPropertyMetaHtml({
    property: { title: 'شقة', description: '</script><script>alert(1)</script>' },
    canonicalUrl: 'https://hudhudnest.com/properties/p1',
    fallbackImageUrl: 'https://hudhudnest.com/images/og-default.png'
  });

  // Exactly one <script type="application/ld+json"> tag's worth of '</script>' — the literal
  // closing tag injected via `description`, had it broken out, would add a second one.
  const scriptCloses = html.match(/<\/script>/g) ?? [];
  assert.equal(scriptCloses.length, 1);
});

test('buildNotFoundHtml never includes property-specific data and is marked noindex', () => {
  const html = buildNotFoundHtml();
  assert.match(html, /noindex/);
  assert.ok(!html.includes('og:title'));
});
