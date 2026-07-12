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

  /** Google OAuth Client ID. Empty value disables Google login button. */
  googleClientId: string;

  /** Apple Services ID / Client ID. Empty value disables Apple login button. */
  appleClientId: string;

  /** Apple redirect URI. Required for Apple Sign In popup flow. */
  appleRedirectUri: string;
}

declare const process:
  | {
      env?: Record<string, string | undefined>;
    }
  | undefined;

function clean(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function readGoogleClientIdFromProcessEnv(): string | undefined {
  return clean(typeof process !== 'undefined' ? process.env?.GOOGLE_CLIENT_ID : undefined);
}

export function readAppleClientIdFromProcessEnv(): string | undefined {
  return clean(typeof process !== 'undefined' ? process.env?.APPLE_CLIENT_ID : undefined);
}

export function readProcessEnv(key: string): string | undefined {
  if (typeof process === 'undefined') {
    return undefined;
  }

  return clean(process.env?.[key]);
}

export function readApiUrlFromProcessEnv(): string | undefined {
  return readProcessEnv('API_URL');
}

export function readBaseUrlFromProcessEnv(): string | undefined {
  return readProcessEnv('BASE_URL') ?? readProcessEnv('API_ORIGIN');
}

export function readSignalRUrlFromProcessEnv(): string | undefined {
  return readProcessEnv('SIGNALR_URL') ?? readProcessEnv('NOTIFICATION_HUB_URL');
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
  googleClientId?: string;
  appleClientId?: string;
  appleRedirectUri?: string;
}): AppEnvironment {
  const apiBaseUrl = normalizeApiBaseUrl(config.apiBaseUrl);
  const baseUrl = withoutTrailingSlash(config.baseUrl ?? backendOriginFromApiBaseUrl(apiBaseUrl));
  const signalRUrl = withoutTrailingSlash(config.signalRUrl ?? `${baseUrl}/notificationHub`);

  return {
    production: config.production,
    environmentName: config.environmentName,
    baseUrl,
    apiBaseUrl,
    apiUrl: apiBaseUrl,
    signalRUrl,
    googleClientId: config.googleClientId ?? '',
    appleClientId: config.appleClientId ?? '',
    appleRedirectUri: config.appleRedirectUri ?? ''
  };
}
