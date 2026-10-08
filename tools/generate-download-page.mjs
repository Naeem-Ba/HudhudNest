// Generates the public /download page and its QR code, before `ng build` copies `public/` into the bundle:
//
//   public/download/index.html   (served at https://<host>/download through the rule in public/_redirects)
//   public/download/qr.svg       (the same QR code as a standalone, printable file)
//
// Input: deep-links.config.json only (host, android.package, stores.*). Rules and the reasons for them are in
// tools/lib/download-page.mjs and docs/DEEP-LINKS.md. Output is git-ignored; it is derived data.
//
// Unlike generate-deep-links.mjs, a malformed value in the config FAILS the build: the file is committed, so a
// typo in a store id is a mistake to catch now, not something to quietly skip.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildDownloadPage } from './lib/download-page.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'download');
const config = JSON.parse(readFileSync(join(root, 'deep-links.config.json'), 'utf8'));

const { html, qrSvg, url, stores } = buildDownloadPage(config);

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'index.html'), html);
writeFileSync(join(outDir, 'qr.svg'), qrSvg);

const state = store => (store.published ? 'published' : 'coming soon');
console.log(`[generate-download-page] wrote public/download/index.html and qr.svg for ${url}`);
console.log(`[generate-download-page] Google Play: ${state(stores.android)}; App Store: ${state(stores.ios)}`);
