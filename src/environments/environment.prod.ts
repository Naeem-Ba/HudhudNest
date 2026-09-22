import {
  AppEnvironment,
  createAppEnvironment,
  readApiUrlFromProcessEnv,
  readBaseUrlFromProcessEnv,
  readProcessEnv,
  readSignalRUrlFromProcessEnv,
  readSiteUrlFromProcessEnv
} from './environment.model';

const apiBaseUrl = readApiUrlFromProcessEnv() || 'https://wohnungen-api.onrender.com/api';

// هدهد نيست (HudhudNest) — النطاق العام الحقيقي لا يزال realestateworld.world حتى إشعار
// آخر (لم يُعَد تسجيله بعد إعادة التسمية)؛ raiseNavigation في
// capacitor.config.ts يستخدم نفس النطاق). هذا هو النطاق الذي تُبنى عليه روابط
// المشاركة العامة (canonical) — راجع PropertyShareUrlService.
const siteUrl = readSiteUrlFromProcessEnv() || 'https://realestateworld.world';

// يجب أن يطابق نطاق appleRedirectUri أحد الأنماط المدرجة ضمن
// server.allowNavigation في capacitor.config.ts، وإلا فسيرفض الغلاف
// الأصلي (Android/iOS WebView) التنقل إلى صفحة الرجوع بعد مصادقة Apple.
// النطاق الحالي المدرج هناك هو realestateworld.world (وليس أي نطاق نتليفاي
// سابق)، لذلك هو الافتراضي الصحيح هنا.
const appleRedirectUri =
  readProcessEnv('APPLE_REDIRECT_URI') || 'https://realestateworld.world/auth/apple/callback';

export const environment: AppEnvironment = createAppEnvironment({
  production: true,
  environmentName: 'production',
  apiBaseUrl,
  baseUrl: readBaseUrlFromProcessEnv(),
  signalRUrl: readSignalRUrlFromProcessEnv(),
  siteUrl,
  googleClientId: readProcessEnv('GOOGLE_CLIENT_ID') ?? '',
  appleClientId: readProcessEnv('APPLE_CLIENT_ID') ?? '',
  appleRedirectUri,
});
