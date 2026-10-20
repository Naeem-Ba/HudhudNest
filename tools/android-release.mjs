#!/usr/bin/env node
// Describes and verifies the APK that the public /download page offers for direct download.
//
//   node tools/android-release.mjs describe --apk <file> [--commit <sha>] [--released-at YYYY-MM-DD] [--out <file>]
//       Inspects the real APK (apksigner, aapt2, SHA-256) and prints a DRAFT manifest ("approved": false).
//       Used by the Android release job; also safe to run on your own machine.
//   node tools/android-release.mjs check [--file downloads/android-release.json] [--apk <file>]
//       Validates the committed manifest against deep-links.config.json (and, with --apk, against that file).
//   node tools/android-release.mjs check-remote [--file downloads/android-release.json]
//       Downloads the published URL and compares its SHA-256 and size with the manifest. Read-only (GET).
//
// Exit codes: 0 ok, 1 a check failed, 2 usage error or a required tool is missing. Rules: tools/lib/android-release.mjs.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MAX_APK_BYTES,
  buildManifest,
  parseApkSignerOutput,
  parseBadging,
  selectOfferedRelease,
  sha256OfFile,
  validateManifest
} from './lib/android-release.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(root, 'deep-links.config.json'), 'utf8'));
const DEFAULT_FILE = join(root, 'downloads', 'android-release.json');

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg.startsWith('--') || rest[i + 1] === undefined) {
      throw new Error(`Unexpected argument: ${arg}`);
    }
    options[arg.slice(2)] = rest[++i];
  }
  return { command, options };
}

function sourceVersionCode() {
  const gradle = readFileSync(join(root, 'android', 'app', 'build.gradle'), 'utf8');
  const match = /^\s*versionCode\s+(\d+)/m.exec(gradle);
  return match ? Number(match[1]) : undefined;
}

function buildTool(name) {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (!sdk || !existsSync(join(sdk, 'build-tools'))) {
    throw Object.assign(new Error(`ANDROID_HOME (Android SDK with build-tools) is required to run ${name}.`), { exitCode: 2 });
  }
  const versions = readdirSync(join(sdk, 'build-tools')).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  for (const version of versions.reverse()) {
    const candidate = join(sdk, 'build-tools', version, name);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  throw Object.assign(new Error(`${name} was not found under ${join(sdk, 'build-tools')}.`), { exitCode: 2 });
}

function loadManifest(file) {
  if (!existsSync(file)) {
    throw new Error(`${file} does not exist.`);
  }
  return JSON.parse(readFileSync(file, 'utf8'));
}

async function describe({ apk, commit, 'released-at': releasedAt, out }) {
  if (!apk) throw Object.assign(new Error('--apk <file> is required.'), { exitCode: 2 });
  if (!commit) throw Object.assign(new Error('--commit <sha> is required (the commit the APK was built from).'), { exitCode: 2 });

  const signerOutput = execFileSync(buildTool('apksigner'), ['verify', '--verbose', '--print-certs', apk], { encoding: 'utf8' });
  const badging = parseBadging(execFileSync(buildTool('aapt2'), ['dump', 'badging', apk], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
  const { sha256, sizeBytes } = await sha256OfFile(apk);

  const manifest = buildManifest({
    config,
    badging,
    signingCertSha256: parseApkSignerOutput(signerOutput),
    sha256,
    sizeBytes,
    commit,
    releasedAt: releasedAt || new Date().toISOString().slice(0, 10)
  });
  // Validates the draft with the same rules the website build applies, so a bad APK fails here, not at publish time.
  validateManifest(manifest, config, { maxVersionCode: sourceVersionCode() });

  const text = `${JSON.stringify(manifest, null, 2)}\n`;
  if (out) {
    writeFileSync(out, text);
    console.log(`[android-release] wrote ${out}`);
  } else {
    process.stdout.write(text);
  }
}

async function check({ file = DEFAULT_FILE, apk }) {
  const manifest = validateManifest(loadManifest(file), config, { maxVersionCode: sourceVersionCode() });
  if (apk) {
    const { sha256, sizeBytes } = await sha256OfFile(apk);
    const problems = [];
    if (sha256 !== manifest.sha256) problems.push(`sha256 of ${apk} is ${sha256}, the manifest says ${manifest.sha256}`);
    if (sizeBytes !== manifest.sizeBytes) problems.push(`size of ${apk} is ${sizeBytes}, the manifest says ${manifest.sizeBytes}`);
    if (problems.length) {
      throw new Error(problems.join('\n'));
    }
  }
  console.log(`[android-release] ${file}: valid, ${manifest.approved ? 'approved (offered on /download)' : 'draft (not offered)'}, ${manifest.versionName} (${manifest.versionCode})`);
}

async function checkRemote({ file = DEFAULT_FILE }) {
  const manifest = selectOfferedRelease(loadManifest(file), config, { maxVersionCode: sourceVersionCode() });
  if (!manifest) {
    console.log('[android-release] no approved release: nothing to check online.');
    return;
  }
  const response = await fetch(manifest.url, { redirect: 'follow' });
  if (!response.ok || !response.body) {
    throw new Error(`GET ${manifest.url} returned ${response.status}.`);
  }
  const hash = createHash('sha256');
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > MAX_APK_BYTES) throw new Error(`${manifest.url} is larger than ${MAX_APK_BYTES} bytes.`);
    hash.update(chunk);
  }
  const sha256 = hash.digest('hex');
  if (sha256 !== manifest.sha256 || size !== manifest.sizeBytes) {
    throw new Error(`The published file differs from the manifest: sha256 ${sha256} (${size} bytes), expected ${manifest.sha256} (${manifest.sizeBytes} bytes).`);
  }
  console.log(`[android-release] published file matches the manifest (${manifest.versionName}, sha256 ${sha256.slice(0, 12)}…).`);
}

const COMMANDS = { describe, check, 'check-remote': checkRemote };

try {
  const { command, options } = parseArgs(process.argv.slice(2));
  const run = COMMANDS[command];
  if (!run) {
    throw Object.assign(new Error('Usage: android-release.mjs describe|check|check-remote [options]'), { exitCode: 2 });
  }
  await run(options);
} catch (error) {
  console.error(`::error::${error.message}`);
  process.exit(error.exitCode ?? 1);
}
