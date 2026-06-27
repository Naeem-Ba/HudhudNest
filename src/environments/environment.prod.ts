import {
  AppEnvironment,
  createAppEnvironment,
  readApiUrlFromProcessEnv,
  readBaseUrlFromProcessEnv,
  readProcessEnv,
  readSignalRUrlFromProcessEnv
} from './environment.model';

const apiBaseUrl = readApiUrlFromProcessEnv() || 'https://wohnungen-api.onrender.com/api';

export const environment: AppEnvironment = createAppEnvironment({
  production: true,
  environmentName: 'production',
  apiBaseUrl,
  baseUrl: readBaseUrlFromProcessEnv(),
  signalRUrl: readSignalRUrlFromProcessEnv(),
  googleClientId: readProcessEnv('GOOGLE_CLIENT_ID') ?? '',
  appleClientId: readProcessEnv('APPLE_CLIENT_ID') ?? '',
  appleRedirectUri: readProcessEnv('APPLE_REDIRECT_URI') ?? ''
});
