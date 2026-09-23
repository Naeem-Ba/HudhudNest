// CLI for the native app version (see tools/lib/app-version.mjs).
//   node tools/app-version.mjs check [--strict]          report; --strict also fails on drift
//   node tools/app-version.mjs set <x.y.z> [--build N]   write both platforms (build defaults to current versionCode + 1)
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { applyVersion, evaluate, readAndroid, readIos } from './lib/app-version.mjs';

const root = process.cwd();
const gradlePath = path.join(root, 'android', 'app', 'build.gradle');
const pbxprojPath = path.join(root, 'ios', 'App', 'App.xcodeproj', 'project.pbxproj');

const [command, ...rest] = process.argv.slice(2);
const gradleText = fs.readFileSync(gradlePath, 'utf8');
const pbxprojText = fs.readFileSync(pbxprojPath, 'utf8');

function fail(message) {
  console.error(`[app-version] ERROR: ${message}`);
  process.exit(1);
}

if (command === 'check') {
  const android = readAndroid(gradleText);
  const ios = readIos(pbxprojText);
  console.log(`[app-version] Android ${android.versionName} (code ${android.versionCode}); iOS ${ios.marketing[0]} (build ${ios.build[0]})`);

  const { errors, warnings } = evaluate(android, ios);
  warnings.forEach(w => console.warn(`[app-version] WARN: ${w}`));
  errors.forEach(e => console.error(`[app-version] ERROR: ${e}`));

  const strict = rest.includes('--strict');
  if (errors.length > 0 || (strict && warnings.length > 0)) process.exit(1);
  console.log('[app-version] Checks passed.');
} else if (command === 'set') {
  const version = rest[0];
  const buildFlag = rest.indexOf('--build');
  const build = buildFlag >= 0 ? Number(rest[buildFlag + 1]) : readAndroid(gradleText).versionCode + 1;

  try {
    const next = applyVersion(gradleText, pbxprojText, version, build);
    fs.writeFileSync(gradlePath, next.gradle);
    fs.writeFileSync(pbxprojPath, next.pbxproj);
  } catch (error) {
    fail(error.message);
  }
  console.log(`[app-version] Set Android + iOS to ${version} (build ${build}).`);
} else {
  fail('Usage: app-version.mjs check [--strict] | set <x.y.z> [--build N]');
}
