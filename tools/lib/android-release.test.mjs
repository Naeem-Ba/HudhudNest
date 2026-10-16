// Run with: node --test tools/lib/android-release.test.mjs
//
// Pins the rules for the direct-download APK: the only address a manifest may carry, the checks on what the real
// tools report (apksigner, aapt2), and that the committed config and manifest (if any) satisfy them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  androidVersionLabel,
  buildManifest,
  bytesToHuman,
  expectedApkUrl,
  parseApkSignerOutput,
  parseBadging,
  resolveAllowedPrefix,
  selectOfferedRelease,
  sha256OfFile,
  toColonFingerprint,
  validateManifest
} from './android-release.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = relative => readFileSync(join(root, relative), 'utf8');
const config = JSON.parse(read('deep-links.config.json'));
const PREFIX = resolveAllowedPrefix(config);
const CERT = config.android.sha256CertFingerprints[0];

const APKSIGNER = `Verifies
Verified using v1 scheme (JAR signing): false
Verified using v2 scheme (APK Signature Scheme v2): true
Verified using v3 scheme (APK Signature Scheme v3): true
Verified using v3.1 scheme (APK Signature Scheme v3.1): false
Verified using v4 scheme (APK Signature Scheme v4): false
Verified for SourceStamp: false
Number of signers: 1
Signer #1 certificate DN: CN=HudhudNest, O=HudhudNest, C=DE
Signer #1 certificate SHA-256 digest: ${CERT.replace(/:/g, '').toLowerCase()}
Signer #1 certificate SHA-1 digest: 6614ac708c6b07aadfcf1ce48e8bb5e5da2ce22e
`;

const BADGING = `package: name='com.hudhudnest.app' versionCode='3' versionName='1.1.0' platformBuildVersionName='16' platformBuildVersionCode='36' compileSdkVersion='36' compileSdkVersionCodename='16'
sdkVersion:'24'
targetSdkVersion:'36'
uses-permission: name='android.permission.INTERNET'
application-label:'HudhudNest'
`;

const good = () => ({
  schemaVersion: 1,
  approved: true,
  packageName: 'com.hudhudnest.app',
  versionName: '1.1.0',
  versionCode: 3,
  minSdk: 24,
  targetSdk: 36,
  sizeBytes: 8_900_000,
  sha256: '0123456789abcdef'.repeat(4),
  signingCertSha256: CERT,
  releasedAt: '2026-11-03',
  commit: 'a1'.repeat(20),
  url: `${PREFIX}v1.1.0/HudhudNest-1.1.0.apk`
});

// ---- what the tools report -----------------------------------------------------------------------------------

test('apksigner: a verified single-signer APK yields its certificate SHA-256 in colon form', () => {
  assert.equal(parseApkSignerOutput(APKSIGNER), CERT);
});

test('apksigner: unverified, unsigned, multi-signer or digest-less output is rejected', () => {
  assert.throws(() => parseApkSignerOutput(APKSIGNER.replace(/Verified using v2 scheme \(APK Signature Scheme v2\): true/, 'Verified using v2 scheme (APK Signature Scheme v2): false').replace(/v3 scheme \(APK Signature Scheme v3\): true/, 'v3 scheme (APK Signature Scheme v3): false')), /verified v2 or v3/);
  assert.throws(() => parseApkSignerOutput(APKSIGNER.replace('Number of signers: 1', 'Number of signers: 2')), /exactly one signer/);
  assert.throws(() => parseApkSignerOutput(APKSIGNER.replace(/Signer #1 certificate SHA-256 digest: .*\n/, '')), /no "Signer #1/);
  assert.throws(() => parseApkSignerOutput(''), /verified/);
});

test('aapt2 badging: package, versions and SDK levels are read as numbers', () => {
  assert.deepEqual(parseBadging(BADGING), {
    packageName: 'com.hudhudnest.app',
    versionCode: 3,
    versionName: '1.1.0',
    minSdk: 24,
    targetSdk: 36
  });
  assert.throws(() => parseBadging('nothing useful'), /no "package:"/);
  assert.throws(() => parseBadging(BADGING.replace(/sdkVersion:'24'\n/, '')), /min\/target SDK/);
  // aapt2 in current build-tools names the minimum level minSdkVersion (found by the first real CI run).
  assert.equal(parseBadging(BADGING.replace("\nsdkVersion:'24'", "\nminSdkVersion:'24'")).minSdk, 24);
});

test('sha256OfFile hashes the real bytes and reports the size', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'apk-'));
  const file = join(dir, 'x.apk');
  writeFileSync(file, 'abc');
  const { sha256, sizeBytes } = await sha256OfFile(file);
  assert.equal(sha256, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(sizeBytes, 3);
});

test('small helpers: fingerprints, sizes, Android names', () => {
  assert.equal(toColonFingerprint('ab12CD'), 'AB:12:CD');
  assert.equal(bytesToHuman(8_900_000), '8.5 MB');
  assert.equal(bytesToHuman(2048), '2 KB');
  assert.equal(androidVersionLabel(24), '7.0');
  assert.equal(androidVersionLabel(36), '16');
  assert.equal(androidVersionLabel(99), 'API 99', 'an unknown level is never given an invented name');
});

// ---- the allowed address ---------------------------------------------------------------------------------------

test('the committed config allows exactly the public releases repository', () => {
  assert.equal(PREFIX, 'https://github.com/Naeem-Ba/HudhudNest-Releases/releases/download/');
  assert.equal(expectedApkUrl(PREFIX, '1.1.0'), 'https://github.com/Naeem-Ba/HudhudNest-Releases/releases/download/v1.1.0/HudhudNest-1.1.0.apk');
});

test('a prefix on another host, over http, with credentials, a query or the wrong path is refused', () => {
  const withPrefix = urlPrefix => ({ downloads: { android: { urlPrefix } } });
  for (const bad of [
    'http://github.com/o/r/releases/download/',
    'https://evil.example/o/r/releases/download/',
    'https://github.com.evil.example/o/r/releases/download/',
    'https://user:pw@github.com/o/r/releases/download/',
    'https://github.com/o/r/releases/download/?x=1',
    'https://github.com/o/r/releases/download/#x',
    'https://github.com/o/r/releases/',
    'https://github.com:8443/o/r/releases/download/',
    'https://GITHUB.com/o/r/releases/download/',
    'not a url'
  ]) {
    assert.throws(() => resolveAllowedPrefix(withPrefix(bad)), /urlPrefix/, bad);
  }
  assert.equal(resolveAllowedPrefix({}), '', 'no downloads block = no download address allowed');
});

// ---- the manifest ----------------------------------------------------------------------------------------------

test('a correct manifest passes and comes back frozen', () => {
  const manifest = validateManifest(good(), config, { maxVersionCode: 3 });
  assert.equal(manifest.versionName, '1.1.0');
  assert.ok(Object.isFrozen(manifest));
});

test('every field is checked, and the error lists all problems at once', () => {
  const bad = {
    ...good(),
    schemaVersion: 2,
    approved: 'yes',
    packageName: 'com.other.app',
    versionName: '1.1',
    versionCode: 0,
    minSdk: 5,
    sizeBytes: 10,
    sha256: 'ABC',
    signingCertSha256: 'AA:BB',
    releasedAt: '2026-13-40',
    commit: 'abc'
  };
  assert.throws(() => validateManifest(bad, config), error => {
    for (const part of ['schemaVersion', 'approved', 'packageName', 'versionName', 'versionCode', 'minSdk', 'sizeBytes', 'sha256', 'signingCertSha256', 'releasedAt', 'commit']) {
      assert.match(error.message, new RegExp(part), part);
    }
    return true;
  });
});

test('the url must be exactly the allowed prefix + v<version>/HudhudNest-<version>.apk', () => {
  for (const url of [
    'https://evil.example/HudhudNest-1.1.0.apk',
    `${PREFIX}v1.1.0/other.apk`,
    `${PREFIX}v1.1.1/HudhudNest-1.1.1.apk`,
    `${PREFIX}v1.1.0/HudhudNest-1.1.0.apk?download=1`,
    `${PREFIX}../HudhudNest-1.1.0.apk`,
    'http://github.com/Naeem-Ba/HudhudNest-Releases/releases/download/v1.1.0/HudhudNest-1.1.0.apk',
    ''
  ]) {
    assert.throws(() => validateManifest({ ...good(), url }, config), /url must be exactly/, url);
  }
});

test('the signing certificate must be one the config lists', () => {
  const other = 'AA:'.repeat(31) + 'AA';
  assert.throws(() => validateManifest({ ...good(), signingCertSha256: other }, config), /signingCertSha256/);
  for (const fingerprint of config.android.sha256CertFingerprints) {
    assert.doesNotThrow(() => validateManifest({ ...good(), signingCertSha256: fingerprint }, config));
  }
});

test('a manifest newer than the source, or too large, is refused', () => {
  assert.throws(() => validateManifest(good(), config, { maxVersionCode: 2 }), /newer than the source/);
  assert.throws(() => validateManifest({ ...good(), sizeBytes: 200 * 1024 * 1024 }, config), /sizeBytes/);
});

test('without a downloads block in the config no manifest can pass', () => {
  const { downloads, ...withoutDownloads } = config;
  assert.ok(downloads);
  assert.throws(() => validateManifest(good(), withoutDownloads), /urlPrefix is missing/);
});

test('selectOfferedRelease: nothing, a draft, or an approved release', () => {
  assert.equal(selectOfferedRelease(undefined, config), null);
  assert.equal(selectOfferedRelease(null, config), null);
  assert.equal(selectOfferedRelease({ ...good(), approved: false }, config), null);
  assert.equal(selectOfferedRelease(good(), config).approved, true);
  assert.throws(() => selectOfferedRelease({ ...good(), approved: false, sha256: 'x' }, config), /sha256/, 'a draft is still validated');
});

test('buildManifest produces a draft that already passes validation, with numbers taken from the tools', () => {
  const draft = buildManifest({
    config,
    badging: parseBadging(BADGING),
    signingCertSha256: parseApkSignerOutput(APKSIGNER),
    sha256: 'f'.repeat(64),
    sizeBytes: 8_900_000,
    commit: 'b'.repeat(40),
    releasedAt: '2026-11-03'
  });
  assert.equal(draft.approved, false, 'a draft is never approved by the tool');
  assert.equal(draft.url, `${PREFIX}v1.1.0/HudhudNest-1.1.0.apk`);
  assert.doesNotThrow(() => validateManifest(draft, config, { maxVersionCode: 3 }));
});

// ---- the committed files ---------------------------------------------------------------------------------------

test('downloads/android-release.json, if committed, is valid (and the tool is wired into the tool tests)', () => {
  const file = join(root, 'downloads', 'android-release.json');
  if (existsSync(file)) {
    const gradle = read('android/app/build.gradle');
    const maxVersionCode = Number(/^\s*versionCode\s+(\d+)/m.exec(gradle)[1]);
    assert.doesNotThrow(() => validateManifest(JSON.parse(readFileSync(file, 'utf8')), config, { maxVersionCode }));
  }
  assert.match(JSON.parse(read('package.json')).scripts['test:tools'], /android-release\.test\.mjs/);
});
