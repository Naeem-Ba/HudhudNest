// The single trusted description of the Android APK that the public /download page offers for direct download.
// Pure functions only (no network, no process spawning): tools/android-release.mjs does the I/O and
// tools/lib/android-release.test.mjs pins the rules below.
//
// Why a committed file and not a runtime lookup: the page is static and is built together with the website. The file
// downloads/android-release.json is the approval gate. A release is not offered until a person has reviewed the
// numbers in a pull request and set "approved": true, and every number in it comes from the real APK
// (tools/android-release.mjs describe), never from a hand-typed value.
//
// Rules enforced here, on purpose:
//   * The download address is fully determined by the config and the version: <allowed prefix>v<versionName>/
//     HudhudNest-<versionName>.apk. A manifest cannot point anywhere else, so a mistaken or malicious edit of the
//     file cannot send visitors to another host.
//   * The package name must be the app's, and the signing certificate must be one of the configured fingerprints.
//   * A manifest that exists but is malformed FAILS the build (fail closed); a missing file or "approved": false
//     simply means "no direct download is offered".

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

export const MANIFEST_SCHEMA_VERSION = 1;
export const MAX_APK_BYTES = 150 * 1024 * 1024;

const PACKAGE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/i;
const VERSION_NAME = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const COMMIT = /^[0-9a-f]{40}$/;

const ANDROID_VERSIONS = {
  21: '5.0', 22: '5.1', 23: '6.0', 24: '7.0', 25: '7.1', 26: '8.0', 27: '8.1', 28: '9', 29: '10', 30: '11',
  31: '12', 32: '12L', 33: '13', 34: '14', 35: '15', 36: '16'
};

/** "7.0" for API 24; "API 99" for a level this table does not know yet (never a guessed marketing name). */
export function androidVersionLabel(sdk) {
  return ANDROID_VERSIONS[sdk] ?? `API ${sdk}`;
}

/** "AB12..." (hex, any case, optional colons) -> "AB:12:..." upper case, the form used in deep-links.config.json. */
export function toColonFingerprint(hex) {
  const clean = String(hex).replace(/[^0-9a-f]/gi, '').toUpperCase();
  return clean.match(/.{2}/g)?.join(':') ?? '';
}

export function bytesToHuman(bytes) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Streams the file so a large APK is never held in memory. */
export function sha256OfFile(path) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    let size = 0;
    createReadStream(path)
      .on('data', chunk => {
        size += chunk.length;
        hash.update(chunk);
      })
      .on('error', reject)
      .on('end', () => resolve({ sha256: hash.digest('hex'), sizeBytes: size }));
  });
}

/**
 * Reads `apksigner verify --verbose --print-certs <apk>` output. Throws unless the APK verifies and carries exactly
 * one signer, whose SHA-256 is returned in the colon form.
 */
export function parseApkSignerOutput(text) {
  const out = String(text);
  const v2 = /Verified using v2 scheme \(APK Signature Scheme v2\): true/.test(out);
  const v3 = /Verified using v3 scheme \(APK Signature Scheme v3\): true/.test(out);
  if (!v2 && !v3) {
    throw new Error('apksigner did not report a verified v2 or v3 signature.');
  }
  const signers = /Number of signers: (\d+)/.exec(out);
  if (!signers || Number(signers[1]) !== 1) {
    throw new Error(`Expected exactly one signer, apksigner reported ${signers ? signers[1] : 'none'}.`);
  }
  // The label is "Signer #1 certificate ..." for v1/v2 and "Signer (minSdkVersion=..., ...) certificate ..." for v3.
  const digests = new Set([...out.matchAll(/^Signer(?: #\d+| \([^)\n]*\))? certificate SHA-256 digest: ([0-9a-fA-F]{64})\s*$/gm)].map(match => match[1].toLowerCase()));
  if (digests.size !== 1) {
    const seen = out.split(/\r?\n/).filter(line => /certificate/i.test(line) && !/DN:/.test(line)).join(' | ') || 'no certificate lines';
    throw new Error(`Expected one signing certificate SHA-256 in the apksigner output, found ${digests.size} (saw: ${seen}).`);
  }
  return toColonFingerprint([...digests][0]);
}

/** Reads `aapt2 dump badging <apk>`: package, versions and SDK levels as numbers/strings. */
export function parseBadging(text) {
  const out = String(text);
  const pkg = /package: name='([^']+)' versionCode='(\d+)' versionName='([^']*)'/.exec(out);
  if (!pkg) {
    throw new Error('aapt2 output has no "package:" line.');
  }
  // aapt prints `sdkVersion:'N'`; aapt2 (the one in current build-tools) prints `minSdkVersion:'N'`.
  const min = /^(?:minS|s)dkVersion:'(\d+)'/m.exec(out);
  const target = /^targetSdkVersion:'(\d+)'/m.exec(out);
  if (!min || !target) {
    const seen = out.split(/\r?\n/).filter(line => /sdkversion/i.test(line)).join(' | ') || 'no SDK lines';
    throw new Error(`aapt2 output has no min/target SDK version (saw: ${seen}).`);
  }
  return {
    packageName: pkg[1],
    versionCode: Number(pkg[2]),
    versionName: pkg[3],
    minSdk: Number(min[1]),
    targetSdk: Number(target[1])
  };
}

function releaseTag(versionName) {
  return `v${versionName}`;
}

export function apkFileName(versionName) {
  return `HudhudNest-${versionName}.apk`;
}

/** The only address a manifest may carry for a given version. */
export function expectedApkUrl(prefix, versionName) {
  return `${prefix}${releaseTag(versionName)}/${apkFileName(versionName)}`;
}

/** The URL prefix the config allows, validated: https, ends with "/releases/download/", no query/fragment/userinfo. */
export function resolveAllowedPrefix(config) {
  const prefix = config?.downloads?.android?.urlPrefix;
  if (prefix === undefined) {
    return '';
  }
  let url;
  try {
    url = new URL(String(prefix));
  } catch {
    throw new Error(`downloads.android.urlPrefix in deep-links.config.json is not a URL: ${JSON.stringify(prefix)}.`);
  }
  const problems = [];
  if (url.protocol !== 'https:') problems.push('must be https');
  if (url.username || url.password || url.port || url.search || url.hash) problems.push('must not carry credentials, a port, a query or a fragment');
  if (!url.pathname.endsWith('/releases/download/')) problems.push('must end with /releases/download/');
  if (url.hostname !== 'github.com') problems.push('the host must be github.com');
  if (String(prefix) !== url.href) problems.push('must be written in its normal form (lower-case host, trailing slash)');
  if (problems.length) {
    throw new Error(`downloads.android.urlPrefix in deep-links.config.json ${problems.join('; ')}: ${JSON.stringify(prefix)}.`);
  }
  return url.href;
}

/**
 * Checks a manifest against the config and returns it (frozen) or throws one error listing every problem.
 * `approved` is not a validity rule: a draft is still validated, so a typo is caught before the approval PR.
 */
export function validateManifest(manifest, config, { maxVersionCode } = {}) {
  const problems = [];
  const m = manifest && typeof manifest === 'object' ? manifest : {};
  const prefix = resolveAllowedPrefix(config);
  const fingerprints = (config?.android?.sha256CertFingerprints ?? []).map(String);

  if (m.schemaVersion !== MANIFEST_SCHEMA_VERSION) problems.push(`schemaVersion must be ${MANIFEST_SCHEMA_VERSION}`);
  if (typeof m.approved !== 'boolean') problems.push('approved must be true or false');
  if (m.packageName !== config?.android?.package || !PACKAGE.test(String(m.packageName))) {
    problems.push(`packageName must be ${config?.android?.package}`);
  }
  if (!VERSION_NAME.test(String(m.versionName))) problems.push('versionName must look like 1.2.3');
  if (!Number.isInteger(m.versionCode) || m.versionCode < 1) problems.push('versionCode must be a positive integer');
  if (maxVersionCode !== undefined && Number.isInteger(m.versionCode) && m.versionCode > maxVersionCode) {
    problems.push(`versionCode ${m.versionCode} is newer than the source (android/app/build.gradle has ${maxVersionCode})`);
  }
  if (!Number.isInteger(m.minSdk) || m.minSdk < 21 || m.minSdk > 60) problems.push('minSdk must be an integer between 21 and 60');
  if (!Number.isInteger(m.targetSdk) || m.targetSdk < (m.minSdk ?? 0)) problems.push('targetSdk must be an integer not below minSdk');
  if (!Number.isInteger(m.sizeBytes) || m.sizeBytes < 1024 || m.sizeBytes > MAX_APK_BYTES) {
    problems.push(`sizeBytes must be between 1 KB and ${MAX_APK_BYTES / (1024 * 1024)} MB`);
  }
  if (!SHA256_HEX.test(String(m.sha256))) problems.push('sha256 must be 64 lower-case hex characters');
  if (!FINGERPRINT.test(String(m.signingCertSha256)) || !fingerprints.includes(String(m.signingCertSha256))) {
    problems.push('signingCertSha256 must be one of android.sha256CertFingerprints in deep-links.config.json');
  }
  if (!DATE.test(String(m.releasedAt)) || Number.isNaN(Date.parse(`${m.releasedAt}T00:00:00Z`))) {
    problems.push('releasedAt must be a real date, YYYY-MM-DD');
  }
  if (!COMMIT.test(String(m.commit))) problems.push('commit must be the 40-character git commit the APK was built from');

  if (!prefix) {
    problems.push('downloads.android.urlPrefix is missing in deep-links.config.json, so no download address is allowed');
  } else if (VERSION_NAME.test(String(m.versionName)) && m.url !== expectedApkUrl(prefix, m.versionName)) {
    problems.push(`url must be exactly ${expectedApkUrl(prefix, m.versionName)}`);
  }

  if (problems.length) {
    throw new Error(`downloads/android-release.json is invalid:\n  - ${problems.join('\n  - ')}`);
  }
  return Object.freeze({ ...m });
}

/** A new draft manifest for an APK: every number comes from the file and from the tools that inspected it. */
export function buildManifest({ config, badging, signingCertSha256, sha256, sizeBytes, commit, releasedAt }) {
  const prefix = resolveAllowedPrefix(config);
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    approved: false,
    packageName: badging.packageName,
    versionName: badging.versionName,
    versionCode: badging.versionCode,
    minSdk: badging.minSdk,
    targetSdk: badging.targetSdk,
    sizeBytes,
    sha256,
    signingCertSha256,
    releasedAt,
    commit,
    url: VERSION_NAME.test(badging.versionName) && prefix ? expectedApkUrl(prefix, badging.versionName) : ''
  };
}

/** The offered release, or null when there is none (no file, or not approved). */
export function selectOfferedRelease(manifest, config, options) {
  if (manifest === undefined || manifest === null) {
    return null;
  }
  const valid = validateManifest(manifest, config, options);
  return valid.approved ? valid : null;
}
