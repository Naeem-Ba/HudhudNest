// Asks a deployed site which build it is, and fails when it is the wrong one.
//
//   node tools/check-live-environment.mjs [url] [--expect production|staging]
//
// Defaults: https://hudhudnest.com, production. Zero dependencies, so it also runs on a laptop
// (`node tools/check-live-environment.mjs` in PowerShell) right after clicking "Publish deploy" in Netlify.
// Exit codes: 0 the site is what it should be, 1 it is not (or serves no marker), 2 it could not be reached.

import { pathToFileURL } from 'node:url';

import { BUILD_INFO_FILE, ENVIRONMENT_NAMES, parseBuildInfo, validateBuildInfo } from './lib/build-info.mjs';

const ATTEMPTS = 3;
const RETRY_DELAY_MS = 5_000;
const TIMEOUT_MS = 20_000;

/**
 * @param {string} siteUrl
 * @param {{ fetchImpl?: typeof fetch, attempts?: number, retryDelayMs?: number, now?: () => number }} [options]
 * @returns {Promise<object | null>} the marker, or null when the site answered but served none
 */
export async function fetchLiveBuildInfo(siteUrl, options = {}) {
  const { fetchImpl = fetch, attempts = ATTEMPTS, retryDelayMs = RETRY_DELAY_MS, now = Date.now } = options;
  // A missing file falls through to the SPA's index.html (200), so a parse failure means "no marker", not an error.
  const url = `${siteUrl.replace(/\/+$/, '')}/${BUILD_INFO_FILE}?cb=${now()}`;

  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        headers: { 'cache-control': 'no-cache' },
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      if (response.status >= 500) {
        throw new Error(`${url} answered ${response.status}`);
      }
      return response.ok ? parseBuildInfo(await response.text()) : null;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
  throw new Error(`could not reach ${url}: ${lastError?.message ?? lastError}`);
}

export async function main(argv, log = console) {
  const args = argv.slice(2);
  const expectIndex = args.indexOf('--expect');
  const expectValueIndex = expectIndex >= 0 ? expectIndex + 1 : -1;
  const expectedEnvironment = expectIndex >= 0 ? args[expectValueIndex] : 'production';
  const siteUrl = args.find((arg, index) => !arg.startsWith('--') && index !== expectValueIndex) ?? 'https://hudhudnest.com';

  if (!ENVIRONMENT_NAMES.includes(expectedEnvironment)) {
    log.error(`--expect must be one of: ${ENVIRONMENT_NAMES.join(', ')}`);
    return 2;
  }

  let info;
  try {
    info = await fetchLiveBuildInfo(siteUrl);
  } catch (error) {
    log.error(`[live-env] UNKNOWN: ${error.message}`);
    return 2;
  }

  const problems = validateBuildInfo(info, { expectedEnvironment });
  if (problems.length > 0) {
    log.error(`[live-env] FAIL ${siteUrl} (expected ${expectedEnvironment})`);
    for (const problem of problems) log.error(`  - ${problem}`);
    return 1;
  }

  log.log(
    `[live-env] OK ${siteUrl} is a ${info.environment} build` +
      ` (context ${info.netlifyContext ?? '-'}, commit ${(info.commit ?? '-').slice(0, 7)}, built ${info.builtAt})`
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv);
}
