// Generates the public /download page and its QR code, before `ng build` copies `public/` into the bundle:
//
//   public/download/index.html   (served at https://<host>/download through the rule in public/_redirects)
//   public/download/qr.svg       (the same QR code as a standalone, printable file)
//   public/_redirects            (only the marked generated:download-android block: where /download/android goes)
//
// Input: deep-links.config.json (host, android.package, stores.*, downloads.*) and, when it exists,
// downloads/android-release.json (the approved direct-download APK). Rules and the reasons for them are in
// tools/lib/download-page.mjs, tools/lib/android-release.mjs and docs/DEEP-LINKS.md. The page and QR are git-ignored
// (derived data); the _redirects block is committed and tools/lib/download-page.test.mjs fails if it drifts.
//
// Unlike generate-deep-links.mjs, a malformed value in either file FAILS the build: both are committed, so a
// typo in a store id or a manifest is a mistake to catch now, not something to quietly skip.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { selectOfferedRelease } from './lib/android-release.mjs';
import { applyRedirectsBlock, buildDownloadPage } from './lib/download-page.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'download');
const redirectsFile = join(root, 'public', '_redirects');
const manifestFile = join(root, 'downloads', 'android-release.json');
const config = JSON.parse(readFileSync(join(root, 'deep-links.config.json'), 'utf8'));

const gradle = readFileSync(join(root, 'android', 'app', 'build.gradle'), 'utf8');
const sourceVersionCode = Number(/^\s*versionCode\s+(\d+)/m.exec(gradle)?.[1]);

const manifest = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8')) : null;
const release = selectOfferedRelease(manifest, config, { maxVersionCode: Number.isInteger(sourceVersionCode) ? sourceVersionCode : undefined });

// Same switch as tools/generate-robots.mjs: only a real Production deploy is indexable.
const indexable = (process.env.CONTEXT ?? '').trim() === 'production';

const { html, qrSvg, url, stores } = buildDownloadPage(config, { release, indexable });

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'index.html'), html);
writeFileSync(join(outDir, 'qr.svg'), qrSvg);
writeFileSync(redirectsFile, applyRedirectsBlock(readFileSync(redirectsFile, 'utf8'), release));

const state = store => (store.published ? 'published' : 'not available yet');
console.log(`[generate-download-page] wrote public/download/index.html and qr.svg for ${url} (${indexable ? 'indexable' : 'noindex'})`);
console.log(`[generate-download-page] Google Play: ${state(stores.android)}; App Store: ${state(stores.ios)}; direct APK: ${release ? `${release.versionName} (${release.versionCode})` : 'none'}`);
