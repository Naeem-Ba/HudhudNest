// Run with: node --test tools/lib/deep-links.test.mjs
//
// Two kinds of test: the pure builders for the .well-known files, and "drift guards" that read the
// hand-maintained native files (AndroidManifest, iOS entitlements/project, Netlify headers, the Angular
// allow-list) and fail if they stop matching deep-links.config.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildAppleSiteAssociation,
  buildAssetLinks,
  describeAndroidData,
  expectedAndroidDataElements,
  normalizeFingerprint,
  parseAndroidManifestDeepLinks,
  resolveAndroidFingerprints,
  resolveAppleTeamId
} from './deep-links.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = relative => readFileSync(join(root, relative), 'utf8');
const config = JSON.parse(read('deep-links.config.json'));

const FP_A = config.android.sha256CertFingerprints[0];
const FP_B = 'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99';

// ---- builders --------------------------------------------------------------------------------------------

test('normalizeFingerprint accepts keytool and Play Console spellings', () => {
  assert.equal(normalizeFingerprint(FP_A.toLowerCase()), FP_A);
  assert.equal(normalizeFingerprint(FP_A.replace(/:/g, '')), FP_A);
  assert.equal(normalizeFingerprint(FP_A.replace(/:/g, ' ')), FP_A);
  assert.equal(normalizeFingerprint('7D:30'), null);
  assert.equal(normalizeFingerprint(''), null);
  assert.equal(normalizeFingerprint(undefined), null);
});

test('assetlinks.json targets the Android package with the configured certificate', () => {
  const [entry] = buildAssetLinks(config, {});
  assert.deepEqual(entry.relation, ['delegate_permission/common.handle_all_urls']);
  assert.equal(entry.target.namespace, 'android_app');
  assert.equal(entry.target.package_name, 'com.realestate.app');
  assert.deepEqual(entry.target.sha256_cert_fingerprints, [FP_A]);
});

test('extra fingerprints (Play App Signing) are merged, normalised and de-duplicated', () => {
  const env = { ANDROID_SHA256_CERT_FINGERPRINTS: `${FP_B.toLowerCase()}, ${FP_A} ${FP_B}` };
  assert.deepEqual(resolveAndroidFingerprints(config, env), [FP_A, FP_B]);
});

test('an invalid fingerprint fails loudly instead of publishing a file Android would silently reject', () => {
  assert.throws(() => resolveAndroidFingerprints(config, { ANDROID_SHA256_CERT_FINGERPRINTS: 'not-a-fingerprint' }), /Invalid Android SHA-256/);
});

test('no fingerprint at all means no assetlinks.json', () => {
  assert.equal(buildAssetLinks({ ...config, android: { ...config.android, sha256CertFingerprints: [] } }, {}), null);
});

test('apple-app-site-association is not produced until a Team ID exists', () => {
  assert.equal(config.ios.teamId, '', 'the repository must not carry a guessed Team ID');
  assert.equal(buildAppleSiteAssociation(config, {}), null);
});

test('apple-app-site-association lists the app ID and the allowed paths, exclusions first', () => {
  const aasa = buildAppleSiteAssociation(config, { APPLE_TEAM_ID: 'a1b2c3d4e5' });
  const [detail] = aasa.applinks.details;

  assert.deepEqual(detail.appIDs, ['A1B2C3D4E5.com.realestate.app']);

  const paths = detail.components.map(component => component['/']);
  assert.deepEqual(paths.slice(0, 2), ['/properties/edit', '/properties/edit/*']);
  assert.ok(detail.components.slice(0, 2).every(component => component.exclude === true));
  assert.ok(paths.includes('/'));
  assert.ok(paths.includes('/properties') && paths.includes('/properties/*'));
  assert.ok(paths.indexOf('/properties/edit/*') < paths.indexOf('/properties/*'), 'first match wins, so excludes must precede includes');
});

test('an invalid Team ID is rejected', () => {
  assert.throws(() => resolveAppleTeamId(config, { APPLE_TEAM_ID: 'too-short' }), /Invalid Apple Team ID/);
});

// ---- drift guards ----------------------------------------------------------------------------------------

test('AndroidManifest has a verified, browsable intent-filter listing exactly the configured paths', () => {
  const parsed = parseAndroidManifestDeepLinks(read('android/app/src/main/AndroidManifest.xml'));

  assert.ok(parsed, 'no VIEW intent-filter found');
  assert.equal(parsed.autoVerify, true, 'android:autoVerify="true" is what makes Android verify assetlinks.json');
  assert.equal(parsed.browsable, true);
  assert.equal(parsed.defaultCategory, true);
  assert.deepEqual(describeAndroidData(parsed.data), expectedAndroidDataElements(config));
});

test('the Android package matches the Gradle applicationId and the Capacitor appId', () => {
  assert.match(read('android/app/build.gradle'), new RegExp(`applicationId "${config.android.package.replace(/\./g, '\\.')}"`));
  assert.match(read('capacitor.config.ts'), new RegExp(`appId: '${config.android.package.replace(/\./g, '\\.')}'`));
});

test('iOS entitlements declare applinks for the host and the Xcode project uses them in both configurations', () => {
  const entitlements = read('ios/App/App/App.entitlements');
  assert.match(entitlements, /com\.apple\.developer\.associated-domains/);
  assert.ok(entitlements.includes(`<string>applinks:${config.host}</string>`));

  const project = read('ios/App/App.xcodeproj/project.pbxproj');
  assert.equal((project.match(/CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements;/g) ?? []).length, 2, 'Debug and Release');
  assert.match(project, /App\.entitlements \*\/ = \{isa = PBXFileReference;/);
  assert.equal((project.match(new RegExp(`PRODUCT_BUNDLE_IDENTIFIER = ${config.ios.bundleId.replace(/\./g, '\\.')};`, 'g')) ?? []).length, 2);
});

test('Netlify serves both .well-known files as application/json', () => {
  const toml = read('netlify.toml');
  for (const file of ['/.well-known/assetlinks.json', '/.well-known/apple-app-site-association']) {
    const block = toml.split('[[headers]]').find(section => section.includes(`for = "${file}"`));
    assert.ok(block, `${file} has no [[headers]] block`);
    assert.match(block, /Content-Type = "application\/json"/);
  }
});

test('the generated files are git-ignored and chained into every build script', () => {
  assert.match(read('.gitignore'), /^\/public\/\.well-known\/$/m);

  const scripts = JSON.parse(read('package.json')).scripts;
  for (const name of ['start', 'start:local', 'start:staging', 'build', 'build:staging', 'build:prod', 'build:ci', 'watch']) {
    assert.match(scripts[name], /generate:deep-links/, name);
  }
});

test('the Angular allow-list (deep-link-routes.ts) equals deep-links.config.json', () => {
  const source = read('src/app/core/deep-links/deep-link-routes.ts');
  const listOf = name => {
    const match = source.match(new RegExp(`${name}: readonly string\\[\\] = \\[([\\s\\S]*?)\\];`));
    assert.ok(match, `${name} not found`);
    return [...match[1].matchAll(/'([^']+)'/g)].map(item => item[1]);
  };

  assert.deepEqual(listOf('DEEP_LINK_EXACT_PATHS'), config.paths.exact);
  assert.deepEqual(listOf('DEEP_LINK_PATH_PREFIXES'), config.paths.prefixes);
  assert.deepEqual(listOf('DEEP_LINK_EXCLUDED_PREFIXES'), config.paths.excludePrefixes);
  assert.ok(listOf('DEEP_LINK_HOSTS').includes(config.host));
});

test('no sensitive area is deep-linkable', () => {
  const linkable = [...config.paths.exact, ...config.paths.prefixes];
  for (const forbidden of ['/auth', '/admin', '/checkout', '/profile', '/property-form', '/my-listings', '/messages', '/favorites']) {
    assert.ok(!linkable.some(path => path === forbidden || forbidden.startsWith(`${path}/`)), forbidden);
  }
});
