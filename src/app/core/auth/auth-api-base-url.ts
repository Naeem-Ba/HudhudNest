import { Capacitor } from '@capacitor/core';
import { AppEnvironment } from '../../../environments/environment.model';

/**
 * Production incident (2026-09): refresh_token (and the CSRF cookies backing
 * CookieCsrfProtectionMiddleware) are third-party cookies whenever the deployed web app
 * (hudhudnest.com / the Netlify staging subdomain) calls the backend directly at its
 * own onrender.com origin — a different registrable domain. Chrome/Edge were fixed with the
 * Partitioned (CHIPS) cookie attribute (RefreshTokenCookie.cs), but Safari has no CHIPS
 * exception and drops third-party cookies unconditionally regardless of any cookie attribute
 * — an iPhone/Safari user hit exactly this after the CHIPS fix shipped.
 *
 * The only fix that works on every browser is to stop these specific calls from being
 * cross-site at all: route them through the SAME origin the page was loaded from, and let
 * netlify.toml's redirects proxy that relative path to the real backend server-side. The
 * browser then sees a same-origin response and stores/sends the cookie normally — no
 * SameSite/Partitioned/ITP exception needed, because it is no longer a third-party cookie.
 *
 * This must NOT apply to:
 * - Local dev (`environmentName === 'local'`): frontend and backend already share the
 *   `localhost` host (only the port differs, which SameSite policy ignores), so there is no
 *   cross-site problem to fix, and there is no dev-server proxy for a relative `/api/auth/...`
 *   path to resolve against.
 * - The native Capacitor app (`Capacitor.isNativePlatform()`): it bundles this exact same
 *   production build locally and runs it from a `capacitor://`/`https://localhost` WebView
 *   origin, not from hudhudnest.com — there is no Netlify in front of it to proxy a
 *   relative path, so this must keep calling the real backend directly, exactly as before.
 * - Staging (`environmentName === 'staging'`), for now: netlify.toml's own doc comment
 *   explains why — its [[redirects]] rules are currently unscoped (a `context` field on an
 *   individual rule is not valid Netlify syntax, which is exactly the bug this file's own
 *   incident history records) and only point at the production backend. Routing staging's
 *   calls through a relative path here would send them to production's backend instead of
 *   staging's own. Staging keeps calling its own backend directly — unfixed for Safari there
 *   specifically, but not broken — until context-scoped redirects are verified and added.
 */
export function resolveAuthApiBaseUrl(env: AppEnvironment): string {
  if (env.environmentName !== 'production' || Capacitor.isNativePlatform()) {
    return env.apiBaseUrl;
  }

  return '/api';
}
