import {
  AppEnvironment,
  createAppEnvironment,
  readApiUrlFromProcessEnv,
  readBaseUrlFromProcessEnv,
  readSignalRUrlFromProcessEnv,
  readProcessEnv
} from './environment.model';

const apiBaseUrl = readApiUrlFromProcessEnv() || 'https://wohnungen-api.onrender.com/api';

// راجع التعليق المطابق في environment.prod.ts: يجب أن يطابق النطاق هنا
// أحد الأنماط ضمن server.allowNavigation في capacitor.config.ts.
const appleRedirectUri =
  readProcessEnv('APPLE_REDIRECT_URI') || 'https://realestateworld.world/auth/apple/callback';

export const environment: AppEnvironment = createAppEnvironment({
  production: true,
  environmentName: 'staging',
  apiBaseUrl,
  baseUrl: readBaseUrlFromProcessEnv(),
  signalRUrl: readSignalRUrlFromProcessEnv(),
  googleClientId: readProcessEnv('GOOGLE_CLIENT_ID') ?? '',
  appleClientId: readProcessEnv('APPLE_CLIENT_ID') ?? '',
  appleRedirectUri
});
