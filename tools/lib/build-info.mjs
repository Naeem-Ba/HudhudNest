// Build identity marker for the deployed site.
//
// Incidents (2026-09-30 and 2026-10-05): a Staging build ended up live on hudhudnest.com. The first time
// through a Netlify env var, the second time through a manual "Publish deploy" of a Staging deploy. In both
// cases nothing noticed except a person looking at the page. deploy-context-guard.mjs only protects the BUILD;
// it cannot see which already-built deploy is published.
//
// So every build writes build-info.json next to index.html, and tools/check-live-environment.mjs compares
// what the live site says about itself with what it should be. The environment name is NOT typed into the npm
// scripts: it is read from the very environment file that the Angular build configuration swaps in
// (angular.json fileReplacements -> environment.<x>.ts -> environmentName), so the label cannot drift from the
// bundle's own environmentName unless someone changes the build configuration itself.
//
// Nothing secret goes in the file: the API host is already visible in the bundle and the commit is public.

export const BUILD_INFO_FILE = 'build-info.json';
export const BUILD_INFO_SCHEMA = 1;
export const ENVIRONMENT_NAMES = ['production', 'staging'];

// `staging-api.hudhudnest.com` must not be mistaken for `api.hudhudnest.com`.
const PRODUCTION_API_HOSTS = /(?:^|\/\/)(?:wohnungen-api\.onrender\.com|api\.hudhudnest\.com)(?![\w.-])/i;

/**
 * @param {object} angularJson parsed angular.json
 * @param {string} configuration the build configuration passed to `ng build --configuration`
 * @param {(path: string) => string} readFile reads a repo-relative path
 * @returns {string} the environmentName of the environment file that configuration swaps in
 */
export function resolveEnvironmentName(angularJson, configuration, readFile) {
  const projects = Object.values(angularJson.projects ?? {});
  const build = projects.map((project) => project.architect?.build).find((target) => target?.configurations);
  const replacements = build?.configurations?.[configuration]?.fileReplacements;
  if (!Array.isArray(replacements) || replacements.length === 0) {
    throw new Error(`angular.json has no build configuration "${configuration}" with fileReplacements.`);
  }

  const file = replacements[0].with;
  const match = /environmentName\s*:\s*['"]([a-z]+)['"]/.exec(readFile(file));
  if (!match) {
    throw new Error(`${file} has no literal environmentName.`);
  }
  return match[1];
}

/**
 * @param {{ environment: string, env: Record<string, string | undefined>, now?: Date }} input
 * @returns {object} the content of build-info.json
 */
export function createBuildInfo({ environment, env, now = new Date() }) {
  const pick = (...keys) => keys.map((key) => (env[key] ?? '').trim()).find((value) => value !== '') ?? null;
  return {
    schema: BUILD_INFO_SCHEMA,
    environment,
    apiUrl: pick('API_URL'),
    netlifyContext: pick('CONTEXT'),
    branch: pick('BRANCH', 'GITHUB_REF_NAME'),
    commit: pick('COMMIT_REF', 'GITHUB_SHA'),
    builtAt: now.toISOString()
  };
}

/** @returns {object | null} the parsed marker, or null when the text is not a build-info document */
export function parseBuildInfo(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed !== null && typeof parsed === 'object' && parsed.schema === BUILD_INFO_SCHEMA ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * @param {object | null} info the marker the live site served, or null when it served none
 * @param {{ expectedEnvironment: string, expectedCommit?: string | null }} expected
 * @returns {string[]} human-readable problems; empty when the live site is what it should be
 */
export function validateBuildInfo(info, { expectedEnvironment, expectedCommit = null }) {
  if (!info) {
    return [
      `The site did not serve a ${BUILD_INFO_FILE} marker (it may predate this check, or the deploy is not the build that was meant to be live).`
    ];
  }

  const problems = [];
  if (info.environment !== expectedEnvironment) {
    problems.push(`The live site is a "${info.environment}" build but "${expectedEnvironment}" was expected.`);
  }

  if (expectedCommit) {
    const wanted = String(expectedCommit).trim().toLowerCase();
    const built = String(info.commit ?? '').trim().toLowerCase();
    // A short sha (7+ characters) is accepted, as `git log --oneline` prints it.
    const same = wanted.length >= 7 && built.length >= 7 && (built.startsWith(wanted) || wanted.startsWith(built));
    if (!same) {
      problems.push(`The live build is from commit ${built ? built.slice(0, 7) : '(unknown)'}, but ${wanted.slice(0, 7)} was expected.`);
    }
  }

  const apiUrl = info.apiUrl ?? '';
  if (expectedEnvironment === 'production') {
    if (/staging/i.test(apiUrl)) {
      problems.push(`The live build was made with API_URL="${apiUrl}", which points at Staging.`);
    }
    if (info.netlifyContext && info.netlifyContext !== 'production') {
      problems.push(
        `The live build came from the Netlify context "${info.netlifyContext}"` +
          `${info.branch ? ` (branch ${info.branch})` : ''}, not from a production deploy.`
      );
    }
  } else if (PRODUCTION_API_HOSTS.test(apiUrl)) {
    problems.push(`The live ${expectedEnvironment} build was made with API_URL="${apiUrl}", which is the Production API.`);
  }

  return problems;
}
