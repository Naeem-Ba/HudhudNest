export type AppEnvironmentName = 'local' | 'staging' | 'production';

export interface AppEnvironment {
  production: boolean;
  environmentName: AppEnvironmentName;

  /** Backend origin without /api. Used for static files and absolute media URLs. */
  baseUrl: string;

  /** REST API base URL. Every Angular API service must build URLs from this value. */
  apiUrl: string;

  /** SignalR notification hub URL. */
  signalRUrl: string;
}
