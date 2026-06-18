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

export function readProcessEnv(key: string): string | undefined {
  if (typeof process === 'undefined') {
    return undefined;
  }

  return clean(process.env?.[key]);
}

export function readApiUrlFromProcessEnv(): string | undefined {
  if (typeof process === 'undefined') {
    return undefined;
  }

  return clean(process.env ? process.env['API_URL'] : undefined);
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
    signalRUrl
  };
}
