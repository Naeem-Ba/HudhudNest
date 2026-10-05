// Writes build-info.json into the built site. Run right after `ng build --configuration <name>`:
//
//   node tools/stamp-build-info.mjs <configuration> [--out <dir>]
//
// <configuration> must be the same name that was passed to `ng build` (production when it was omitted,
// that is the default in angular.json). See tools/lib/build-info.mjs for why the environment is read from
// the environment file instead of being typed here.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BUILD_INFO_FILE, createBuildInfo, resolveEnvironmentName } from './lib/build-info.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const configuration = args.find((arg) => !arg.startsWith('--'));
const outIndex = args.indexOf('--out');
const outDir = outIndex >= 0 ? args[outIndex + 1] : join(root, 'dist', 'HudhudNest', 'browser');

if (!configuration || (outIndex >= 0 && !outDir)) {
  console.error('usage: node tools/stamp-build-info.mjs <configuration> [--out <dir>]');
  process.exit(2);
}

try {
  const readRepoFile = (path) => readFileSync(join(root, path), 'utf8');
  const environment = resolveEnvironmentName(JSON.parse(readRepoFile('angular.json')), configuration, readRepoFile);
  const info = createBuildInfo({ environment, env: process.env });

  // `ng build` creates the output folder; creating it here would hide a build that produced nothing.
  if (outIndex < 0 && !existsSync(outDir)) {
    throw new Error(`${outDir} does not exist; run ng build first.`);
  }
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, BUILD_INFO_FILE), `${JSON.stringify(info, null, 2)}\n`);
  console.log(`[build-info] ${BUILD_INFO_FILE}: environment=${info.environment} context=${info.netlifyContext ?? '-'} commit=${(info.commit ?? '-').slice(0, 7)}`);
} catch (error) {
  console.error(`[build-info] ${error.message}`);
  process.exit(1);
}
