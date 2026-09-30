// Refuses to build a bundle whose baked-in API_URL belongs to the OTHER environment.
//
// Incident (2026-09-30): a Netlify env var API_URL pointing at the Staging API was applied to the
// *Production* deploy context. The build succeeded, hudhudnest.com went live calling the Staging
// API, and every request was blocked by CORS -- a fully broken production site that no check
// noticed, because nothing compared the API host to the deploy context. Netlify keeps serving the
// previous good deploy when a build FAILS, so failing here turns that silent outage into a red
// build. Only Netlify sets CONTEXT/BRANCH, so local and CI builds are unaffected.

// Anchored so `staging-api.hudhudnest.com` (Staging) is not mistaken for `api.hudhudnest.com` (Production).
const PRODUCTION_API_HOSTS = /(?:^|\/\/)(?:wohnungen-api\.onrender\.com|api\.hudhudnest\.com)(?![\w.-])/i;

/**
 * @param {{ CONTEXT?: string, BRANCH?: string }} env  Netlify build context
 * @param {{ API_URL?: string, SITE_URL?: string }} values  values about to be baked into the bundle
 * @returns {string[]} human-readable problems; empty when the combination is safe
 */
export function checkDeployContext(env, values) {
  const context = (env.CONTEXT ?? '').trim();
  const branch = (env.BRANCH ?? '').trim();
  const apiUrl = (values.API_URL ?? '').trim();
  const siteUrl = (values.SITE_URL ?? '').trim();
  const problems = [];

  if (context === 'production') {
    if (/staging/i.test(apiUrl)) {
      problems.push(
        `Netlify CONTEXT=production but API_URL="${apiUrl}" points at Staging. ` +
          'Remove the API_URL value for the Production scope (the production default is baked into ' +
          'environment.prod.ts) or set it to the Production API.'
      );
    }
    if (/staging|netlify\.app/i.test(siteUrl)) {
      problems.push(`Netlify CONTEXT=production but SITE_URL="${siteUrl}" is not a production origin.`);
    }
  }

  const isStagingBuild = context === 'deploy-preview' || (context === 'branch-deploy' && branch === 'staging');
  if (isStagingBuild && PRODUCTION_API_HOSTS.test(apiUrl)) {
    problems.push(
      `Netlify CONTEXT=${context}${branch ? ` (branch ${branch})` : ''} but API_URL="${apiUrl}" is the ` +
        'Production API. Staging builds and PR previews must use the Staging API.'
    );
  }

  return problems;
}
