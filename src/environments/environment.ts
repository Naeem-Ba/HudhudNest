import {
  AppEnvironment,
  createAppEnvironment,
  readApiUrlFromProcessEnv,
  readBaseUrlFromProcessEnv,
  readProcessEnv,
  readSignalRUrlFromProcessEnv,
  readSiteUrlFromProcessEnv
} from './environment.model';

const apiBaseUrl = readApiUrlFromProcessEnv() || 'https://localhost:50250/api';

export const environment: AppEnvironment = createAppEnvironment({
  production: false,
  environmentName: 'local',
  apiBaseUrl,
  baseUrl: readBaseUrlFromProcessEnv(),
  signalRUrl: readSignalRUrlFromProcessEnv(),
  // لا نطاق عام لبيئة التطوير المحلية — يتُرك فارغًا عمدًا فيتراجع
  // PropertyShareUrlService إلى window.location.origin وقت التنفيذ بدل
  // نطاق ثابت خاطئ هنا (راجع تعليق siteUrl في environment.model.ts).
  siteUrl: readSiteUrlFromProcessEnv() ?? '',
  googleClientId: readProcessEnv('GOOGLE_CLIENT_ID') ?? '',
  appleClientId: readProcessEnv('APPLE_CLIENT_ID') ?? '',
  appleRedirectUri: readProcessEnv('APPLE_REDIRECT_URI') ?? ''
});
