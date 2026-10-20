// Decides whether a change can affect the native iOS build, so Frontend CI only spends macOS minutes on
// changes that can break it.
//
// Why: the "iOS Unsigned Simulator Build" job runs on macos-15. On a private repository a macOS minute is
// billed at $0.062 against $0.006 for Linux (about 10x), and the free quota is 2,000 minutes a month for the
// whole account. Compiling the Capacitor project proves nothing about a change that only touches Angular
// code: `npm run build:prod` (the Linux job) already type-checks and builds that, and xcodebuild just
// bundles the result.
//
// The list errs on the side of running the job. Anything we cannot classify, and every case where the
// changed files cannot be determined, counts as native.

/** Exact paths that feed the iOS project or the job that builds it. */
const NATIVE_FILES = new Set([
  'package.json', // plugin versions end up in ios/App/CapApp-SPM/Package.swift through `cap sync`
  'package-lock.json',
  'tools/setup-ios.mjs',
  'tools/fix-ios-spm-paths.mjs',
  'tools/validate-ios-config.mjs',
  // Editing the job itself must exercise it.
  '.github/workflows/frontend-ci.yml',
]);

/** Directories whose every file feeds the iOS project. */
const NATIVE_PREFIXES = ['ios/', 'resources/ios/'];

/** `capacitor.config.ts`, `.js`, `.json`: copied into ios/App/App/capacitor.config.json by `cap sync`. */
const CAPACITOR_CONFIG = /^capacitor\.config\.[^/]+$/;

export function isNativeFile(path) {
  const normalised = String(path).replace(/\\/g, '/').replace(/^\.\//, '');
  return (
    NATIVE_FILES.has(normalised) ||
    NATIVE_PREFIXES.some((prefix) => normalised.startsWith(prefix)) ||
    CAPACITOR_CONFIG.test(normalised)
  );
}

/**
 * @param {{ eventName: string, changedFiles: string[] | null }} input
 *   changedFiles is null when the list could not be determined.
 * @returns {{ native: boolean, reason: string, matched: string[] }}
 */
export function detectNative({ eventName, changedFiles }) {
  if (eventName === 'workflow_dispatch') {
    return { native: true, reason: 'manual run', matched: [] };
  }
  if (!Array.isArray(changedFiles)) {
    return { native: true, reason: 'could not determine the changed files', matched: [] };
  }
  if (changedFiles.length === 0) {
    return { native: true, reason: 'no changed files reported', matched: [] };
  }

  const matched = changedFiles.filter(isNativeFile);
  return matched.length > 0
    ? { native: true, reason: 'native files changed', matched }
    : { native: false, reason: 'no native files changed', matched: [] };
}
