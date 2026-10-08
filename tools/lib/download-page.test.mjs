// Run with: node --test tools/lib/download-page.test.mjs
//
// Pins the rules of the public /download page: it never takes a destination from the request, it says "coming
// soon" and never redirects while a store is unpublished, its QR code encodes exactly the public address, and it
// stays out of the app's own deep-link paths (or the installed app would open this page instead of the store).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import qrcode from 'qrcode-generator';

import { buildDownloadPage, buildQrSvg, downloadPageUrl, resolveStores } from './download-page.mjs';
import { describeAndroidData, parseAndroidManifestDeepLinks } from './deep-links.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = relative => readFileSync(join(root, relative), 'utf8');
const config = JSON.parse(read('deep-links.config.json'));

const withStores = stores => ({ ...config, stores });
const PLAY = `https://play.google.com/store/apps/details?id=${config.android.package}`;

/** Rebuilds the dark/light module grid from the SVG path the page ships, independent of the encoder. */
function modulesFromSvg(svg) {
  const size = Number(svg.match(/viewBox="0 0 (\d+) \1"/)[1]);
  const grid = Array.from({ length: size }, () => Array(size).fill(false));
  const d = svg.match(/ d="([^"]+)"/)[1];
  for (const [, x, y, w] of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\3z/g)) {
    for (let i = 0; i < Number(w); i++) {
      grid[Number(y)][Number(x) + i] = true;
    }
  }
  return grid;
}

// ---- the committed config ---------------------------------------------------------------------------------

test('both stores start unpublished, so the page promises nothing yet', () => {
  const stores = resolveStores(config);
  assert.equal(stores.android.published, false);
  assert.equal(stores.ios.published, false);
});

test('the page URL comes from the config host and nothing else', () => {
  assert.equal(downloadPageUrl(config), 'https://hudhudnest.com/download');
  assert.equal(downloadPageUrl({ host: 'example.org' }), 'https://example.org/download');
  for (const host of ['', 'a b.com', 'evil.com/x', 'evil.com?x=1', 'nodot', 'a.com#h', undefined]) {
    assert.throws(() => downloadPageUrl({ host }), /Invalid host/, JSON.stringify(host));
  }
});

// ---- unpublished: nothing to redirect to ------------------------------------------------------------------

test('unpublished: no store address and no redirect code anywhere in the page', () => {
  const { html } = buildDownloadPage(config);
  assert.doesNotMatch(html, /location\.replace|location\.assign|location\.href|window\.open/);
  assert.doesNotMatch(html, /play\.google\.com|apps\.apple\.com/);
  assert.doesNotMatch(html, /navigator\.userAgent/);
});

test('unpublished: the store buttons are inert (aria-disabled, no href) and say coming soon in every language', () => {
  const { html } = buildDownloadPage(config);
  const inert = html.match(/<span class="btn is-off" aria-disabled="true">[^<]+<small>[^<]+<\/small><\/span>/g) ?? [];
  assert.equal(inert.length, 6, 'two stores x three languages');
  assert.match(html, /<small>قريبًا<\/small>/);
  assert.match(html, /<small>Coming soon<\/small>/);
  assert.match(html, /<small>Demnächst<\/small>/);
  assert.doesNotMatch(html, /<a class="btn"/);
});

// ---- published: addresses are derived and strictly validated ----------------------------------------------

test('published: Google Play address is derived from android.package only', () => {
  const stores = resolveStores(withStores({ android: { published: true } }));
  assert.equal(stores.android.url, PLAY);
  assert.equal(stores.ios.url, '');
});

test('published: App Store address is derived from the numeric id only', () => {
  const stores = resolveStores(withStores({ ios: { published: true, appStoreId: '1234567890' } }));
  assert.equal(stores.ios.url, 'https://apps.apple.com/app/id1234567890');
});

test('published: a store marked published with no usable id fails the build with a clear message', () => {
  assert.throws(() => resolveStores(withStores({ ios: { published: true, appStoreId: '' } })), /appStoreId is empty/);
  assert.throws(() => resolveStores(withStores({ ios: { published: true } })), /appStoreId is empty/);
});

test('a malformed App Store id is rejected even while unpublished', () => {
  for (const appStoreId of ['abc', '123', 'id1234567890', '1234 567890', '12345678901234', '1234567890/../x', 'https://evil.com']) {
    assert.throws(
      () => resolveStores(withStores({ ios: { published: false, appStoreId } })),
      /Invalid stores\.ios\.appStoreId/,
      appStoreId
    );
  }
});

test('published must be a real boolean, not "true", 1 or null', () => {
  for (const flag of ['true', 'yes', 1, 0, null]) {
    assert.throws(() => resolveStores(withStores({ android: { published: flag } })), /must be true or false/, String(flag));
  }
});

test('a malformed android.package is rejected once Google Play is published', () => {
  for (const pkg of ['', 'nodots', 'com..app', 'com.app/../x', 'com.app&x=1', '1com.app']) {
    assert.throws(
      () => resolveStores({ ...config, android: { ...config.android, package: pkg }, stores: { android: { published: true } } }),
      /Invalid android\.package/,
      pkg
    );
  }
});

test('published: the redirect only uses the two derived addresses, picked by platform', () => {
  const { html } = buildDownloadPage(withStores({ android: { published: true }, ios: { published: true, appStoreId: '1234567890' } }));
  assert.match(html, /<a class="btn" href="https:\/\/play\.google\.com\/store\/apps\/details\?id=com\.hudhudnest\.app">Google Play<\/a>/);
  assert.match(html, /<a class="btn" href="https:\/\/apps\.apple\.com\/app\/id1234567890">App Store<\/a>/);
  assert.match(html, /window\.location\.replace\(target\)/);
  assert.match(html, /\/Android\/i\.test\(ua\)/);

  const addresses = new Set(html.match(/https:\/\/(?:play\.google\.com|apps\.apple\.com)[^"'\s<\\]*/g));
  assert.deepEqual([...addresses].sort(), ['https://apps.apple.com/app/id1234567890', PLAY].sort());
});

test('only a published store redirects: Android published, iOS not', () => {
  const { html } = buildDownloadPage(withStores({ android: { published: true } }));
  assert.match(html, /var STORES = \{"android":"https:\/\/play\.google\.com[^"]*","ios":""\}/);
  assert.doesNotMatch(html, /apps\.apple\.com/);
});

// ---- the destination is never read from the request -------------------------------------------------------

for (const [name, stores] of [
  ['unpublished', undefined],
  ['published', { android: { published: true }, ios: { published: true, appStoreId: '1234567890' } }]
]) {
  test(`${name}: the script never reads the query string, hash, referrer or full URL`, () => {
    const { html } = buildDownloadPage(stores ? withStores(stores) : config);
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    assert.doesNotMatch(script, /location\.(search|hash|href|pathname)|URLSearchParams|document\.(URL|referrer|location)|window\.name|postMessage/);
    assert.doesNotMatch(script, /\beval\(|new Function|innerHTML|document\.write/);
  });

  test(`${name}: nothing is loaded from another origin`, () => {
    const { html } = buildDownloadPage(stores ? withStores(stores) : config);
    const loaded = html.match(/<(?:script|img|link|source|iframe)\b[^>]*(?:src|srcset|href)="https?:\/\/[^"]*"/g) ?? [];
    // The only absolute links are the canonical URL and the two store buttons; none are loaded resources.
    assert.deepEqual(loaded.filter(tag => !/^<link rel="canonical"/.test(tag) && !/<a /.test(tag)), []);
    assert.doesNotMatch(html, /<script[^>]*\bsrc=|@import|url\(\s*["']?https?:|fonts\.googleapis|google-analytics|gtag|fbq\(/);
  });
}

// ---- the page itself ---------------------------------------------------------------------------------------

test('the page is noindex, has a canonical, and carries all three languages with the right direction', () => {
  const { html } = buildDownloadPage(config);
  assert.match(html, /<meta name="robots" content="noindex,follow">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/hudhudnest\.com\/download">/);
  assert.match(html, /<div class="copy" data-l="ar" lang="ar" dir="rtl">/);
  assert.match(html, /<div class="copy" data-l="en" lang="en" dir="ltr">/);
  assert.match(html, /<div class="copy" data-l="de" lang="de" dir="ltr">/);
  assert.match(html, /<html lang="ar" dir="rtl">/);
});

test('every language offers a way into the website', () => {
  const { html } = buildDownloadPage(config);
  assert.equal((html.match(/<a class="web" href="\/">/g) ?? []).length, 3);
});

test('the page is regenerated identically (no timestamps or randomness)', () => {
  assert.equal(buildDownloadPage(config).html, buildDownloadPage(config).html);
});

// ---- the QR code ------------------------------------------------------------------------------------------

test('the QR code encodes exactly https://hudhudnest.com/download', () => {
  const { qrSvg, html } = buildDownloadPage(config);
  const expected = qrcode(0, 'Q');
  expected.addData('https://hudhudnest.com/download', 'Byte');
  expected.make();

  const grid = modulesFromSvg(qrSvg);
  const quiet = 4;
  const n = expected.getModuleCount();

  assert.equal(grid.length, n + quiet * 2);
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      assert.equal(grid[row + quiet][col + quiet], expected.isDark(row, col), `module ${row},${col}`);
    }
  }
  // Quiet zone is empty and the same SVG is what the page embeds.
  assert.ok(grid.slice(0, quiet).every(row => row.every(cell => !cell)));
  assert.ok(html.includes(qrSvg.trim()));
});

test('a different text gives a different code (the check above is not vacuous)', () => {
  assert.notEqual(buildQrSvg('https://hudhudnest.com/download'), buildQrSvg('https://hudhudnest.com/downloads'));
});

test('the QR code has the three finder patterns', () => {
  const grid = modulesFromSvg(buildQrSvg('https://hudhudnest.com/download'));
  const n = grid.length;
  const quiet = 4;
  const finder = (r, c) => {
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 7; j++) {
        const ring = Math.max(Math.abs(i - 3), Math.abs(j - 3));
        const dark = ring !== 2;
        if (grid[r + i][c + j] !== dark) return false;
      }
    }
    return true;
  };
  assert.ok(finder(quiet, quiet), 'top-left');
  assert.ok(finder(quiet, n - quiet - 7), 'top-right');
  assert.ok(finder(n - quiet - 7, quiet), 'bottom-left');
});

// ---- wiring that must not drift ---------------------------------------------------------------------------

test('/download is not an app deep-link path (the installed app must not claim it)', () => {
  const claimed = [...config.paths.exact, ...config.paths.prefixes];
  assert.ok(!claimed.some(path => path === '/download' || '/download'.startsWith(`${path}/`) || path === '/'.concat('download')));
  // "/" is claimed only as an exact path, so it does not swallow /download.
  assert.ok(config.paths.exact.includes('/'));
  assert.ok(!config.paths.prefixes.includes('/'));

  const manifest = parseAndroidManifestDeepLinks(read('android/app/src/main/AndroidManifest.xml'));
  assert.ok(!describeAndroidData(manifest.data).some(item => item.includes('/download')));
});

test('_redirects serves /download from the generated file, above the SPA catch-all', () => {
  const rules = read('public/_redirects')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));

  const download = rules.findIndex(line => /^\/download\s+\/download\/index\.html\s+200!$/.test(line));
  const catchAll = rules.findIndex(line => /^\/\*\s+\/index\.html\s+200$/.test(line));

  assert.notEqual(download, -1, 'forced rewrite for /download is missing');
  assert.notEqual(catchAll, -1);
  assert.ok(download < catchAll, '/download must come before /*');
});

test('the generated files are git-ignored and part of every build and dev-server script', () => {
  assert.match(read('.gitignore'), /^\/public\/download\/$/m);

  const scripts = JSON.parse(read('package.json')).scripts;
  for (const name of ['start', 'start:local', 'start:staging', 'build', 'build:staging', 'build:prod', 'build:ci', 'watch']) {
    const command = scripts[name];
    const generate = command.indexOf('generate:download');
    const angular = command.indexOf('ng ');
    assert.notEqual(generate, -1, `${name} does not run generate:download`);
    assert.ok(generate < angular, `${name} must generate before ng copies public/`);
  }
  assert.match(scripts['generate:download'], /generate-download-page\.mjs/);
  assert.match(scripts['test:tools'], /download-page\.test\.mjs/);
});
