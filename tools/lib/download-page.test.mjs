// Run with: node --test tools/lib/download-page.test.mjs
//
// Pins the rules of the public /download page: it never navigates by itself and never takes a destination from the
// request, it shows no store button while a store is unpublished, the direct APK is offered only from an approved
// manifest and always through the one fixed address, its QR code encodes exactly the public address, and it stays
// out of the app's own deep-link paths (or the installed app would open this page instead of the store).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import qrcode from 'qrcode-generator';

import {
  REDIRECT_BEGIN,
  REDIRECT_END,
  applyRedirectsBlock,
  buildDownloadPage,
  buildQrSvg,
  downloadPageUrl,
  renderRedirectsBlock,
  resolveStores
} from './download-page.mjs';
import { expectedApkUrl, resolveAllowedPrefix, selectOfferedRelease } from './android-release.mjs';
import { describeAndroidData, parseAndroidManifestDeepLinks } from './deep-links.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = relative => readFileSync(join(root, relative), 'utf8');
const config = JSON.parse(read('deep-links.config.json'));

const withStores = stores => ({ ...config, stores });
const PLAY = `https://play.google.com/store/apps/details?id=${config.android.package}`;

/** A valid, approved release as the page builder receives it from tools/lib/android-release.mjs. */
const RELEASE = Object.freeze({
  schemaVersion: 1,
  approved: true,
  packageName: config.android.package,
  versionName: '1.2.0',
  versionCode: 7,
  minSdk: 24,
  targetSdk: 36,
  sizeBytes: 9_123_456,
  sha256: 'a'.repeat(63) + 'b',
  signingCertSha256: config.android.sha256CertFingerprints[0],
  releasedAt: '2026-11-03',
  commit: 'c'.repeat(40),
  url: expectedApkUrl(resolveAllowedPrefix(config), '1.2.0')
});
const pageWith = (release, extra = {}) => buildDownloadPage(config, { release, ...extra });
/** The markup only: the stylesheet and script legitimately mention class names and APIs the tests look for. */
const bodyOf = html => html.replace(/<style>[\s\S]*?<\/style>/, '').replace(/<script>[\s\S]*?<\/script>/, '');

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

// ---- unpublished: nothing to link to ----------------------------------------------------------------------

test('unpublished: no store address and no button anywhere in the page', () => {
  const { html } = buildDownloadPage(config);
  assert.doesNotMatch(html, /play\.google\.com|apps\.apple\.com/);
  assert.doesNotMatch(html, /<a class="btn"/);
  assert.doesNotMatch(html, /aria-disabled|disabled/);
});

test('unpublished: each store card says it is not available yet, in every language', () => {
  const { html } = buildDownloadPage(config);
  assert.equal((html.match(/<span class="tag">/g) ?? []).length, 6, 'two stores x three languages');
  assert.match(html, /<span class="tag">غير متاح بعد<\/span> التطبيق غير منشور على Google Play بعد\./);
  assert.match(html, /<span class="tag">Not available yet<\/span> The app is not published on Google Play yet\./);
  assert.match(html, /<span class="tag">Noch nicht verfügbar<\/span> Die App ist noch nicht im App Store veröffentlicht\./);
});

test('unpublished and no release: no direct-download card, no help block, no APK wording', () => {
  const html = bodyOf(buildDownloadPage(config).html);
  assert.doesNotMatch(html, /card--direct|class="help"|\/download\/android|SHA-256|APK/);
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

test('published: each store gets a real link button in every language, and only the two derived addresses exist', () => {
  const { html } = buildDownloadPage(withStores({ android: { published: true }, ios: { published: true, appStoreId: '1234567890' } }));
  assert.equal((html.match(new RegExp(`<a class="btn" href="${PLAY.replace(/[.?]/g, '\\$&')}">`, 'g')) ?? []).length, 3);
  assert.equal((html.match(/<a class="btn" href="https:\/\/apps\.apple\.com\/app\/id1234567890">/g) ?? []).length, 3);
  assert.doesNotMatch(html, /class="tag"/);

  const addresses = new Set(html.match(/https:\/\/(?:play\.google\.com|apps\.apple\.com)[^"'\s<\\]*/g));
  assert.deepEqual([...addresses].sort(), ['https://apps.apple.com/app/id1234567890', PLAY].sort());
});

test('only a published store gets a button: Android published, iOS not', () => {
  const { html } = buildDownloadPage(withStores({ android: { published: true } }));
  assert.equal((html.match(/<a class="btn"/g) ?? []).length, 3);
  assert.doesNotMatch(html, /apps\.apple\.com/);
});

// ---- the page never navigates and never reads the request -------------------------------------------------

for (const [name, build] of [
  ['unpublished', () => buildDownloadPage(config)],
  ['published', () => buildDownloadPage(withStores({ android: { published: true }, ios: { published: true, appStoreId: '1234567890' } }), { release: RELEASE })]
]) {
  test(`${name}: the script never navigates and never reads the query string, hash, referrer or full URL`, () => {
    const { html } = build();
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    assert.doesNotMatch(script, /location|history\.|window\.open|URLSearchParams|document\.(URL|referrer)|window\.name|postMessage|fetch\(|XMLHttpRequest|sendBeacon/);
    assert.doesNotMatch(script, /\beval\(|new Function|innerHTML|document\.write/);
  });

  test(`${name}: nothing is loaded from another origin`, () => {
    const { html } = build();
    const loaded = html.match(/<(?:script|img|link|source|iframe)\b[^>]*(?:src|srcset|href)="https?:\/\/[^"]*"/g) ?? [];
    // The only absolute links are the canonical URL and the store buttons; none are loaded resources.
    assert.deepEqual(loaded.filter(tag => !/^<link rel="canonical"/.test(tag) && !/<a /.test(tag)), []);
    assert.doesNotMatch(html, /<script[^>]*\bsrc=|@import|url\(\s*["']?https?:|fonts\.googleapis|google-analytics|gtag|fbq\(/);
  });
}

test('device detection only marks the page (data-os); it never changes where a button goes', () => {
  const script = buildDownloadPage(config).html.match(/<script>([\s\S]*?)<\/script>/)[1];
  assert.match(script, /root\.setAttribute\('data-os', os\)/);
  assert.match(script, /\/Android\/i\.test\(ua\)/);
  assert.match(script, /iPhone\|iPad\|iPod/);
});

// ---- the direct APK ------------------------------------------------------------------------------------------

test('an approved release adds the direct-download card, the help block and the facts in every language', () => {
  const html = bodyOf(pageWith(RELEASE).html);
  assert.equal((html.match(/card--direct/g) ?? []).length, 3);
  assert.equal((html.match(/<details class="help">/g) ?? []).length, 3);
  assert.equal((html.match(/<a class="btn" href="\/download\/android">/g) ?? []).length, 3);
  assert.match(html, /1\.2\.0 \(7\)/);
  assert.match(html, /<bdi dir="ltr">8\.7 MB<\/bdi>/);
  assert.match(html, /Android <bdi dir="ltr">7\.0<\/bdi> or newer/);
  assert.match(html, /Android <bdi dir="ltr">7\.0<\/bdi> أو أحدث/);
  assert.match(html, /Android <bdi dir="ltr">7\.0<\/bdi> oder neuer/);
  assert.match(html, /3 November 2026/);
  assert.match(html, /3\. November 2026/);
  assert.equal((html.match(new RegExp(RELEASE.sha256, 'g')) ?? []).length, 3, 'the real SHA-256, once per language');
  assert.equal((html.match(new RegExp(RELEASE.signingCertSha256, 'g')) ?? []).length, 3);
  assert.match(html, /<code dir="ltr">HudhudNest-1\.2\.0\.apk<\/code>/);
});

test('the page links to the fixed /download/android address only; the file host appears nowhere in the page', () => {
  const { html } = pageWith(RELEASE);
  assert.doesNotMatch(html, /github\.com|githubusercontent|\.apk"/);
  assert.doesNotMatch(html, /href="[^"]*\.apk/);
});

test('without a Play listing the direct download carries the badge; with Play published Play does and the APK stays visible', () => {
  const noPlay = bodyOf(pageWith(RELEASE).html);
  assert.equal((noPlay.match(/card card--android card--direct is-rec/g) ?? []).length, 3);
  assert.doesNotMatch(noPlay, /card card--android is-rec/);

  const both = bodyOf(buildDownloadPage(withStores({ android: { published: true } }), { release: RELEASE }).html);
  assert.doesNotMatch(both, /card--direct is-rec/);
  assert.equal((both.match(/card card--android is-rec/g) ?? []).length, 3);
  assert.equal((both.match(/card--direct/g) ?? []).length, 3, 'the alternative is still shown');
});

test('iPhone: the page never claims an IPA can be installed directly', () => {
  const { html } = pageWith(RELEASE);
  assert.doesNotMatch(html, /\.ipa|TestFlight|itms-services|enterprise/i);
  assert.match(html, /There is no direct install file for iPhone/);
});

test('the warning and help tell people NOT to disable Play Protect, in every language', () => {
  const { html } = pageWith(RELEASE);
  assert.equal((html.match(/Do not turn off Google Play Protect/g) ?? []).length, 2, 'warning + help step');
  assert.equal((html.match(/لا تُعطّل Google Play Protect|لا تعطّل Google Play Protect/g) ?? []).length, 2);
  assert.equal((html.match(/Deaktivieren Sie Google Play Protect nicht/g) ?? []).length, 2);
});

test('selectOfferedRelease: no file, a draft or an approved manifest', () => {
  assert.equal(selectOfferedRelease(null, config), null);
  assert.equal(selectOfferedRelease({ ...RELEASE, approved: false }, config), null);
  assert.equal(selectOfferedRelease(RELEASE, config).versionName, '1.2.0');
  assert.throws(() => selectOfferedRelease({ ...RELEASE, url: 'https://evil.example/x.apk' }, config), /url must be exactly/);
});

// ---- the page itself ---------------------------------------------------------------------------------------

test('the page is noindex by default and indexable only when the build says Production', () => {
  assert.match(buildDownloadPage(config).html, /<meta name="robots" content="noindex,follow">/);
  assert.match(buildDownloadPage(config, { indexable: true }).html, /<meta name="robots" content="index,follow">/);
  assert.doesNotMatch(buildDownloadPage(config, { indexable: true }).html, /noindex/);
});

test('the page has a canonical, share metadata and all three languages with the right direction', () => {
  const { html } = buildDownloadPage(config);
  assert.match(html, /<link rel="canonical" href="https:\/\/hudhudnest\.com\/download">/);
  assert.match(html, /<meta property="og:url" content="https:\/\/hudhudnest\.com\/download">/);
  assert.match(html, /<meta property="og:image" content="https:\/\/hudhudnest\.com\/images\/og-default\.png">/);
  assert.match(html, /<meta property="og:title" content="تنزيل تطبيق HudhudNest">/);
  assert.match(html, /<div class="copy" data-l="ar" lang="ar" dir="rtl">/);
  assert.match(html, /<div class="copy" data-l="en" lang="en" dir="ltr">/);
  assert.match(html, /<div class="copy" data-l="de" lang="de" dir="ltr">/);
  assert.match(html, /<html lang="ar" dir="rtl">/);
});

test('every language offers the website, privacy, terms and support links', () => {
  const { html } = buildDownloadPage(config);
  for (const href of ['/', '/privacy-policy', '/terms-of-service', '/kontakt']) {
    assert.equal((html.match(new RegExp(`<a href="${href}">`, 'g')) ?? []).length, 3, href);
  }
});

test('the page is regenerated identically (no timestamps or randomness)', () => {
  assert.equal(buildDownloadPage(config).html, buildDownloadPage(config).html);
  assert.equal(pageWith(RELEASE).html, pageWith(RELEASE).html);
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

// ---- the /download/android redirect ----------------------------------------------------------------------

test('the redirect block: an approved release goes to its one address, no release goes back to the page', () => {
  assert.equal(
    renderRedirectsBlock(RELEASE),
    `${REDIRECT_BEGIN}\n/download/android   ${RELEASE.url}   302!\n${REDIRECT_END}`
  );
  assert.match(renderRedirectsBlock(null), /^\S.*\n\/download\/android {3}\/download {3}302!\n# END/);
});

test('the committed public/_redirects block matches downloads/android-release.json (run npm run generate:download)', () => {
  const file = join(root, 'downloads', 'android-release.json');
  const manifest = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  const release = selectOfferedRelease(manifest, config);
  const current = read('public/_redirects');
  assert.equal(applyRedirectsBlock(current, release), current);
});

test('the redirect block sits between /download and the SPA catch-all and is applied in place', () => {
  const text = read('public/_redirects');
  const download = text.indexOf('/download   /download/index.html   200!');
  const begin = text.indexOf(REDIRECT_BEGIN);
  const catchAll = text.indexOf('/*    /index.html   200');
  assert.ok(download !== -1 && begin > download && catchAll > begin);
  const updated = applyRedirectsBlock(text, RELEASE);
  assert.ok(updated.includes(`/download/android   ${RELEASE.url}   302!`));
  assert.equal(applyRedirectsBlock(updated, null), text);
  assert.throws(() => applyRedirectsBlock('no markers', null), /exactly one generated:download-android block/);
  assert.throws(() => applyRedirectsBlock(`${text}\n${REDIRECT_BEGIN}\n${REDIRECT_END}`, null), /exactly one/);
});

test('/download/android is not an app deep-link path either', () => {
  const claimed = [...config.paths.exact, ...config.paths.prefixes];
  assert.ok(!claimed.some(path => '/download/android'.startsWith(path) && path !== '/'));
});
