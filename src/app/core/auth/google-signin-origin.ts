/**
 * Google Identity Services only works from an origin listed under the OAuth client's
 * "Authorized JavaScript origins", and Google Cloud Console accepts exact origins only --
 * no wildcards. Every Netlify Deploy Preview gets its own hostname
 * (deploy-preview-<PR>--<site>.netlify.app), so none of them can ever be registered, and
 * clicking Google there ends in Google's raw "Error 400: origin_mismatch" page.
 *
 * Treating those hosts as "Google unavailable" gives the user the existing disabled-button
 * state instead. Stable origins (production, the staging branch deploy, localhost) are
 * unaffected and must be registered in the Google Cloud Console by the project owner.
 */
const NETLIFY_DEPLOY_PREVIEW_HOST = /^deploy-preview-\d+--[a-z0-9-]+\.netlify\.app$/i;

export function isGoogleSignInUnsupportedOrigin(hostname: string | null | undefined): boolean {
  return NETLIFY_DEPLOY_PREVIEW_HOST.test((hostname ?? '').trim());
}
