// Release build step (codemagic.yaml, workflow ios-release): writes GoogleService-Info.plist from the
// GOOGLE_SERVICE_INFO_PLIST_BASE64 secret, checks that it belongs to this app, and adds it to the Xcode
// project. Fails closed: a store build without it would install fine and never receive a push.
//
// Usage: GOOGLE_SERVICE_INFO_PLIST_BASE64=... node tools/add-ios-firebase-config.mjs
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { addFirebasePlistToProject, validateFirebasePlist, FIREBASE_PLIST_FILE } from './lib/ios-firebase-config.mjs';

const root = process.cwd();
const links = JSON.parse(fs.readFileSync(path.join(root, 'deep-links.config.json'), 'utf8'));
const bundleId = links.ios?.bundleId;

const encoded = (process.env.GOOGLE_SERVICE_INFO_PLIST_BASE64 ?? '').trim();
if (!encoded) {
  console.error(
    'GOOGLE_SERVICE_INFO_PLIST_BASE64 is not set. Add the iOS app (bundle id ' + bundleId + ') in the Firebase console, ' +
      'download GoogleService-Info.plist, and store its Base64 in the frontend_env group (docs/IOS_RELEASE.md). ' +
      'Without it the app builds but never receives a push.'
  );
  process.exit(1);
}

const text = Buffer.from(encoded, 'base64').toString('utf8');
const problems = validateFirebasePlist(text, bundleId);
if (problems.length) {
  console.error('GOOGLE_SERVICE_INFO_PLIST_BASE64 is not usable:\n- ' + problems.join('\n- '));
  process.exit(1);
}

const plistPath = path.join(root, 'ios', 'App', 'App', FIREBASE_PLIST_FILE);
fs.writeFileSync(plistPath, text);

const pbxPath = path.join(root, 'ios', 'App', 'App.xcodeproj', 'project.pbxproj');
fs.writeFileSync(pbxPath, addFirebasePlistToProject(fs.readFileSync(pbxPath, 'utf8')));
console.log(`${FIREBASE_PLIST_FILE} written and added to the App target (bundle ${bundleId}).`);
