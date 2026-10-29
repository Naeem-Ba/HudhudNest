// Monetization guard (docs/MONETIZATION.md): no invented or real publisher/ad-unit ids in the repository, and the
// native app ids that must exist (an AdMob SDK crashes the app at launch without one) are Google's official
// SAMPLE ids until the owner replaces them on purpose. Real ids belong to build-time environment variables
// (ADSENSE_*, ADMOB_*), never to tracked files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const GOOGLE_SAMPLE_PUBLISHER = '3940256099942544';
const SCAN_DIRS = ['src', 'public', 'android/app/src', 'ios/App/App', 'netlify', 'tools'];
const SCAN_EXT = new Set(['.ts', '.html', '.json', '.xml', '.plist', '.mjs', '.js', '.toml', '.strings']);

function* files(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'build' || name === 'generated') continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) yield* files(full);
    else if (SCAN_EXT.has(extname(name)) && full !== fileURLToPath(import.meta.url) && !name.startsWith('env.generated')) yield full;
  }
}

test('no AdSense publisher id or non-sample AdMob id is committed', () => {
  const offenders = [];
  for (const dir of SCAN_DIRS) {
    let start;
    try { start = join(root, dir); statSync(start); } catch { continue; }
    for (const file of files(start)) {
      const text = readFileSync(file, 'utf8');
      // Specs use obviously fake ids on purpose (ca-pub-1234567890123456, ca-app-pub-1111222233334444/...).
      if (/\.spec\.ts$/.test(file)) continue;
      for (const m of text.matchAll(/ca-pub-\d{10,}|ca-app-pub-\d{16}[~/]\d{10}/g)) {
        if (!m[0].includes(GOOGLE_SAMPLE_PUBLISHER)) offenders.push(`${file.replace(root, '')}: ${m[0]}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test('native app ids are Google sample ids (replace deliberately, see docs/MONETIZATION.md)', () => {
  const strings = readFileSync(join(root, 'android/app/src/main/res/values/strings.xml'), 'utf8');
  assert.match(strings, /name="admob_app_id">ca-app-pub-3940256099942544~3347511713</);
  const plist = readFileSync(join(root, 'ios/App/App/Info.plist'), 'utf8');
  assert.match(plist, /<key>GADApplicationIdentifier<\/key>\s*<string>ca-app-pub-3940256099942544~1458002511<\/string>/);
  const manifest = readFileSync(join(root, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
  assert.match(manifest, /com\.google\.android\.gms\.ads\.APPLICATION_ID/);
});

test('ads stay off by default in every environment file and the generated env', () => {
  const gen = readFileSync(join(root, 'tools/generate-env.mjs'), 'utf8');
  assert.match(gen, /ADS_ENABLED: readEnv\('ADS_ENABLED'\)/);
  const model = readFileSync(join(root, 'src/environments/environment.model.ts'), 'utf8');
  assert.match(model, /=== 'true'/, 'flags must switch on only for the exact string "true"');
  for (const f of ['environment.ts', 'environment.prod.ts', 'environment.staging.ts']) {
    const text = readFileSync(join(root, 'src/environments', f), 'utf8');
    assert.match(text, /ads: readAdsFromProcessEnv\(\)/, `${f} must take ad settings from build env only`);
  }
});
