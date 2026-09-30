export type AppEnvironmentName = 'local' | 'staging' | 'production';

export interface AppEnvironment {
  production: boolean;
  environmentName: AppEnvironmentName;

  /** Backend origin without /api. Used for static files and absolute media URLs. */
  baseUrl: string;

  /** REST API base URL. Primary value used by Angular API services. */
  apiBaseUrl: string;

  /** Backward-compatible alias for older services. Keep equal to apiBaseUrl. */
  apiUrl: string;

  /** SignalR notification hub URL. */
  signalRUrl: string;

  /**
   * Public, canonical origin of THIS Angular app (no trailing slash), used to build shareable
   * property links (Social Sharing & Distribution feature — see PropertyShareUrlService).
   * Deliberately separate from baseUrl/apiBaseUrl above, which point at the .NET backend, a
   * different origin entirely in staging/production (see frontend-repo-location memory).
   * Never falls back to a hardcoded default here: local dev has no public origin to point a
   * shared link at, so PropertyShareUrlService falls back to window.location.origin itself
   * (reflecting whatever the developer is actually running on) rather than this being empty
   * silently becoming "https://hudhudnest.com" in a context where that would be wrong.
   */
  siteUrl: string;

  /** Google OAuth Client ID. Empty value disables Google login button. */
  googleClientId: string;

  /** Apple Services ID / Client ID. Empty value disables Apple login button. */
  appleClientId: string;

  /** Apple redirect URI. Required for Apple Sign In popup flow. */
  appleRedirectUri: string;
}

// BUG-20: `process` does not exist in the browser bundle produced by
// @angular/build:application — there is no --define/env-injection wiring in
// this project's angular.json, so reading `process.env.X` here always
// evaluated to undefined in every real deployment. Fixed by reading from
// env.generated.ts instead, which tools/generate-env.mjs writes with real,
// literal values BEFORE `ng build` runs (see package.json build:* scripts).
// That file is git-ignored and regenerated on every build; a fresh checkout
// with no env vars set produces empty strings here, same as before.
import { generatedEnv } from './env.generated';

function clean(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function readGoogleClientIdFromProcessEnv(): string | undefined {
  return clean(generatedEnv.GOOGLE_CLIENT_ID);
}

export function readAppleClientIdFromProcessEnv(): string | undefined {
  return clean(generatedEnv.APPLE_CLIENT_ID);
}

export function readProcessEnv(key: keyof typeof generatedEnv): string | undefined {
  return clean(generatedEnv[key]);
}

export function readApiUrlFromProcessEnv(): string | undefined {
  return readProcessEnv('API_URL');
}

export function readBaseUrlFromProcessEnv(): string | undefined {
  return readProcessEnv('BASE_URL');
}

export function readSignalRUrlFromProcessEnv(): string | undefined {
  return readProcessEnv('SIGNALR_URL');
}

export function readSiteUrlFromProcessEnv(): string | undefined {
  return readProcessEnv('SITE_URL');
}

export function withoutTrailingSlash(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

export function normalizeApiBaseUrl(value: string): string {
  const normalized = withoutTrailingSlash(value);
  return /\/api$/i.test(normalized) ? normalized : `${normalized}/api`;
}

export function backendOriginFromApiBaseUrl(apiBaseUrl: string): string {
  return normalizeApiBaseUrl(apiBaseUrl).replace(/\/api$/i, '');
}

export function createAppEnvironment(config: {
  production: boolean;
  environmentName: AppEnvironmentName;
  apiBaseUrl: string;
  baseUrl?: string;
  signalRUrl?: string;
  siteUrl?: string;
  googleClientId?: string;
  appleClientId?: string;
  appleRedirectUri?: string;
}): AppEnvironment {
  const apiBaseUrl = normalizeApiBaseUrl(config.apiBaseUrl);
  const baseUrl = withoutTrailingSlash(config.baseUrl ?? backendOriginFromApiBaseUrl(apiBaseUrl));
  const signalRUrl = withoutTrailingSlash(config.signalRUrl ?? `${baseUrl}/notificationHub`);
  const siteUrl = config.siteUrl ? withoutTrailingSlash(config.siteUrl) : '';

  return {
    production: config.production,
    environmentName: config.environmentName,
    baseUrl,
    siteUrl,
    apiBaseUrl,
    apiUrl: apiBaseUrl,
    signalRUrl,
    googleClientId: config.googleClientId ?? '',
    appleClientId: config.appleClientId ?? '',
    appleRedirectUri: config.appleRedirectUri ?? ''
  };
}
