// Reads and rewrites the native app version in one place so Android and iOS cannot silently
// drift apart. The backend's update check (App Update Management) compares the installed
// version numerically against `major.minor.patch` releases, so both platforms must expose a
// version in exactly that shape. Pure functions only (file contents are injected) so they are
// unit-testable with `node --test`; the CLI lives in ../app-version.mjs.

const STRICT_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const LENIENT_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\.(0|[1-9]\d*))?$/;

export function isStrictVersion(value) {
  return STRICT_VERSION.test(String(value ?? ''));
}

/** Same rule as the Angular client's normalizeAppVersion: "1.0" -> "1.0.0"; anything else that
 * is not major.minor[.patch] returns null. */
export function normalizeVersion(value) {
  const match = LENIENT_VERSION.exec(String(value ?? '').trim());
  return match ? `${match[1]}.${match[2]}.${match[3] ?? '0'}` : null;
}

export function readAndroid(gradleText) {
  const versionName = /^\s*versionName\s+"([^"]*)"/m.exec(gradleText)?.[1] ?? null;
  const versionCodeRaw = /^\s*versionCode\s+(\d+)/m.exec(gradleText)?.[1] ?? null;
  return { versionName, versionCode: versionCodeRaw === null ? null : Number(versionCodeRaw) };
}

export function readIos(pbxprojText) {
  const marketing = [...pbxprojText.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map(m => m[1].trim());
  const build = [...pbxprojText.matchAll(/CURRENT_PROJECT_VERSION = ([^;]+);/g)].map(m => m[1].trim());
  return { marketing, build };
}

/** Returns { errors, warnings }. Errors: unparseable/inconsistent values (break the update
 * check or the store upload). Warnings: valid but drifted between platforms. */
export function evaluate(android, ios) {
  const errors = [];
  const warnings = [];

  if (!android.versionName || !isStrictVersion(android.versionName)) {
    errors.push(`Android versionName "${android.versionName}" must be major.minor.patch.`);
  }
  if (!Number.isInteger(android.versionCode) || android.versionCode < 1) {
    errors.push(`Android versionCode "${android.versionCode}" must be a positive integer.`);
  }

  if (ios.marketing.length === 0) errors.push('iOS MARKETING_VERSION not found.');
  if (new Set(ios.marketing).size > 1) {
    errors.push(`iOS MARKETING_VERSION differs between build configurations: ${ios.marketing.join(', ')}.`);
  }
  for (const value of ios.marketing) {
    if (!normalizeVersion(value)) errors.push(`iOS MARKETING_VERSION "${value}" must be major.minor[.patch].`);
  }
  if (ios.build.length === 0) errors.push('iOS CURRENT_PROJECT_VERSION not found.');
  if (new Set(ios.build).size > 1) {
    errors.push(`iOS CURRENT_PROJECT_VERSION differs between build configurations: ${ios.build.join(', ')}.`);
  }
  for (const value of ios.build) {
    if (!/^[1-9]\d*$/.test(value)) errors.push(`iOS CURRENT_PROJECT_VERSION "${value}" must be a positive integer.`);
  }

  const androidNormalized = normalizeVersion(android.versionName);
  const iosNormalized = normalizeVersion(ios.marketing[0]);
  if (androidNormalized && iosNormalized && androidNormalized !== iosNormalized) {
    warnings.push(`Version drift: Android ${androidNormalized} vs iOS ${iosNormalized}.`);
  }
  if (ios.marketing.some(v => !isStrictVersion(v)) && iosNormalized) {
    warnings.push(`iOS MARKETING_VERSION is not three-segment; the client normalizes it to ${iosNormalized}.`);
  }

  return { errors, warnings };
}

/** Rewrites both native files. Returns the new texts; throws on invalid input. The build number
 * must strictly exceed the current Android versionCode (Google Play rejects non-increasing codes). */
export function applyVersion(gradleText, pbxprojText, version, build) {
  if (!isStrictVersion(version)) throw new Error(`Version "${version}" must be major.minor.patch.`);
  if (!Number.isInteger(build) || build < 1) throw new Error(`Build "${build}" must be a positive integer.`);

  const current = readAndroid(gradleText);
  if (current.versionCode !== null && build <= current.versionCode) {
    throw new Error(`Build ${build} must be greater than the current Android versionCode ${current.versionCode}.`);
  }

  const gradle = gradleText
    .replace(/^(\s*versionName\s+)"[^"]*"/m, `$1"${version}"`)
    .replace(/^(\s*versionCode\s+)\d+/m, `$1${build}`);
  const pbxproj = pbxprojText
    .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`)
    .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${build};`);

  return { gradle, pbxproj };
}

/** A release tag is `v<x.y.z>` and must name exactly the version written in the native projects, so a
 * store build can never carry a different number than the tag that was reviewed.
 * @returns {string | null} the problem, or null when the tag matches */
export function checkReleaseTag(tag, android, ios) {
  const wanted = /^v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/.exec(String(tag ?? ''))?.[1];
  if (!wanted) return `Tag "${tag}" must look like v<major>.<minor>.<patch>, for example v1.2.0.`;
  if (android.versionName !== wanted) {
    return `Tag ${tag} does not match Android versionName "${android.versionName}". Run "npm run version:set -- ${wanted}" and commit it first.`;
  }
  const iosVersions = new Set((ios.marketing ?? []).map((value) => normalizeVersion(value)));
  if (iosVersions.size !== 1 || !iosVersions.has(wanted)) {
    return `Tag ${tag} does not match iOS MARKETING_VERSION "${(ios.marketing ?? []).join(', ')}".`;
  }
  return null;
}
