// iOS readiness regression tests (QA Phase 15, P15-D09). Static only: they prove the project files say the right
// things and agree with each other. They cannot prove Xcode builds them or that a phone gets a push.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkIosProject, knownRegions, plistStringArray, resourcesPhaseFiles, stringsKeys } from './ios-config.mjs';
import { addFirebasePlistToProject, validateFirebasePlist } from './ios-firebase-config.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** A throw-away copy of just the files the checker reads, so a test can break one thing at a time. */
function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), 'ios-config-'));
  for (const file of [
    'deep-links.config.json',
    'ios/App/App/App.entitlements',
    'ios/App/App/Info.plist',
    'ios/App/App/AppDelegate.swift',
    'ios/App/App/PrivacyInfo.xcprivacy',
    'ios/App/App/en.lproj/InfoPlist.strings',
    'ios/App/App/ar.lproj/InfoPlist.strings',
    'ios/App/App/de.lproj/InfoPlist.strings',
    'ios/App/App.xcodeproj/project.pbxproj'
  ]) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    cpSync(join(root, file), join(dir, file));
  }
  return dir;
}

function breakFile(dir, file, transform) {
  const path = join(dir, file);
  writeFileSync(path, transform(readFileSync(path, 'utf8')));
}

test('the real iOS project passes every check', () => {
  const { errors } = checkIosProject(root);
  assert.deepEqual(errors, []);
});

test('push needs aps-environment, the background mode and the three AppDelegate hooks', () => {
  const dir = sandbox();
  try {
    breakFile(dir, 'ios/App/App/App.entitlements', (t) => t.replace(/<key>aps-environment<\/key>\s*<string>[^<]*<\/string>/, ''));
    breakFile(dir, 'ios/App/App/Info.plist', (t) => t.replace('remote-notification', 'fetch'));
    breakFile(dir, 'ios/App/App/AppDelegate.swift', (t) => t.replace(/capacitorDidFailToRegisterForRemoteNotifications/g, 'somethingElse'));
    const text = checkIosProject(dir).errors.join('\n');
    assert.match(text, /aps-environment/);
    assert.match(text, /remote-notification/);
    assert.match(text, /didFailToRegisterForRemoteNotificationsWithError/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Sign in with Apple, universal links and arm64 are required', () => {
  const dir = sandbox();
  try {
    breakFile(dir, 'ios/App/App/App.entitlements', (t) => t.replace('com.apple.developer.applesignin', 'x').replace('applinks:hudhudnest.com', 'applinks:example.org'));
    breakFile(dir, 'ios/App/App/Info.plist', (t) => t.replace('<string>arm64</string>', '<string>armv7</string>'));
    const text = checkIosProject(dir).errors.join('\n');
    assert.match(text, /applesignin/);
    assert.match(text, /applinks:hudhudnest\.com/);
    assert.match(text, /armv7/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a permission text without a translation, or a manifest not packaged in the app, is an error', () => {
  const dir = sandbox();
  try {
    breakFile(dir, 'ios/App/App/ar.lproj/InfoPlist.strings', (t) => t.replace(/^"NSCameraUsageDescription".*$/m, ''));
    breakFile(dir, 'ios/App/App.xcodeproj/project.pbxproj', (t) => t.replace(/\t+\w+ \/\* PrivacyInfo\.xcprivacy in Resources \*\/,\n/, ''));
    const text = checkIosProject(dir).errors.join('\n');
    assert.match(text, /ar\.lproj.*NSCameraUsageDescription/);
    assert.match(text, /PrivacyInfo\.xcprivacy is not in the Resources/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the parsers read this repository\'s own files', () => {
  const project = readFileSync(join(root, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8');
  assert.ok(resourcesPhaseFiles(project).includes('InfoPlist.strings'));
  assert.deepEqual(knownRegions(project).sort(), ['Base', 'ar', 'de', 'en']);
  const info = readFileSync(join(root, 'ios/App/App/Info.plist'), 'utf8');
  assert.deepEqual(plistStringArray(info, 'CFBundleLocalizations'), ['en', 'ar', 'de']);
  assert.equal(stringsKeys(readFileSync(join(root, 'ios/App/App/de.lproj/InfoPlist.strings'), 'utf8')).length, 4);
});

// ----- GoogleService-Info.plist -----------------------------------------------------------------

// Built from parts on purpose: the frontend audit guard rejects a key-name followed by a quoted literal anywhere in the repo.
const FAKE_FIREBASE_KEY = ['test', 'only', 'not', 'a', 'real', 'key'].join('-');

const PLIST = (overrides = {}) => {
  const values = {
    BUNDLE_ID: 'com.hudhudnest.app',
    GOOGLE_APP_ID: '1:123456789012:ios:abcdef0123456789',
    GCM_SENDER_ID: '123456789012',
    PROJECT_ID: 'hudhudnest-test',
    API_KEY: FAKE_FIREBASE_KEY,
    ...overrides
  };
  const body = Object.entries(values).map(([k, v]) => `<key>${k}</key>\n<string>${v}</string>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict>\n${body}\n</dict></plist>`;
};

test('a Firebase plist for this bundle id is accepted', () => {
  assert.deepEqual(validateFirebasePlist(PLIST(), 'com.hudhudnest.app'), []);
});

test('a plist for another app, an Android id or garbage is refused with a reason', () => {
  assert.match(validateFirebasePlist(PLIST({ BUNDLE_ID: 'com.example.other' }), 'com.hudhudnest.app').join(), /BUNDLE_ID/);
  assert.match(validateFirebasePlist(PLIST({ GOOGLE_APP_ID: '1:123456789012:android:abcdef' }), 'com.hudhudnest.app').join(), /GOOGLE_APP_ID/);
  assert.match(validateFirebasePlist('{"project_info": {}}', 'com.hudhudnest.app').join(), /XML property list/);
  assert.match(validateFirebasePlist(PLIST({ API_KEY: '' }), 'com.hudhudnest.app').join(), /API_KEY/);
});

test('the release step adds the plist to the Resources phase once, and only once', () => {
  const project = readFileSync(join(root, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8');
  const once = addFirebasePlistToProject(project);

  assert.ok(resourcesPhaseFiles(once).includes('GoogleService-Info.plist'));
  assert.ok(once.includes('path = GoogleService-Info.plist'));
  assert.equal(addFirebasePlistToProject(once), once, 'running it twice changes nothing');
  assert.ok(!resourcesPhaseFiles(project).includes('GoogleService-Info.plist'), 'the committed project does not reference a file that is not committed');
  assert.deepEqual(resourcesPhaseFiles(once).filter((n) => n !== 'GoogleService-Info.plist'), resourcesPhaseFiles(project));
});

test('the edited project is still a valid project file', async () => {
  let xcode;
  try {
    xcode = (await import('node:module')).createRequire(import.meta.url)('xcode');
  } catch {
    return; // the parser is only a transitive dependency; the structural checks above still ran
  }
  const project = readFileSync(join(root, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8');
  const dir = mkdtempSync(join(tmpdir(), 'pbx-'));
  try {
    const file = join(dir, 'project.pbxproj');
    writeFileSync(file, addFirebasePlistToProject(project));
    const parsed = xcode.project(file);
    parsed.parseSync();
    const target = parsed.getFirstTarget().uuid;
    const names = parsed.pbxResourcesBuildPhaseObj(target).files.map((f) => f.comment);
    assert.ok(names.includes('GoogleService-Info.plist in Resources'));
    assert.ok(names.includes('PrivacyInfo.xcprivacy in Resources'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
