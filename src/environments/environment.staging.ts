import {
  AppEnvironment,
  createAppEnvironment,
  readApiUrlFromProcessEnv,
  readBaseUrlFromProcessEnv,
  readSignalRUrlFromProcessEnv,
  readSiteUrlFromProcessEnv,
  readProcessEnv
} from './environment.model';

const apiBaseUrl = readApiUrlFromProcessEnv() || 'https://wohnungen-api.onrender.com/api';

// نطاق Staging الحقيقي على Netlify (راجع render-staging-deployment / frontend-repo-location
// في الذاكرة) — روابط المشاركة على Staging يجب أن تشير هنا لا إلى نطاق الإنتاج.
const siteUrl = readSiteUrlFromProcessEnv() || 'https://staging--bizorealestateworld.netlify.app';

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
  siteUrl,
  googleClientId: readProcessEnv('GOOGLE_CLIENT_ID') ?? '',
  appleClientId: readProcessEnv('APPLE_CLIENT_ID') ?? '',
  appleRedirectUri
});
