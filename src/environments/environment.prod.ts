import {
  AppEnvironment,
  createAppEnvironment,
  readAdsFromProcessEnv,
  readApiUrlFromProcessEnv,
  readAppUrlFromProcessEnv,
  readListingsLiveFromProcessEnv,
  readSupabaseFromProcessEnv,
  readBaseUrlFromProcessEnv,
  readProcessEnv,
  readSignalRUrlFromProcessEnv,
  readSiteUrlFromProcessEnv
} from './environment.model';

const apiBaseUrl = readApiUrlFromProcessEnv() || 'https://api.hudhudnest.com/api';

// هدهد نيست / HudhudNest — النطاق العام الحقيقي (raiseNavigation في
// capacitor.config.ts يستخدم نفس النطاق). هذا هو النطاق الذي تُبنى عليه روابط
// المشاركة العامة (canonical) — راجع PropertyShareUrlService.
const siteUrl = readSiteUrlFromProcessEnv() || 'https://hudhudnest.com';

// يجب أن يطابق نطاق appleRedirectUri أحد الأنماط المدرجة ضمن
// server.allowNavigation في capacitor.config.ts، وإلا فسيرفض الغلاف
// الأصلي (Android/iOS WebView) التنقل إلى صفحة الرجوع بعد مصادقة Apple.
// النطاق الحالي المدرج هناك هو hudhudnest.com (وليس أي نطاق نتليفاي
// سابق)، لذلك هو الافتراضي الصحيح هنا.
const appleRedirectUri =
  readProcessEnv('APPLE_REDIRECT_URI') || 'https://hudhudnest.com/auth/apple/callback';

export const environment: AppEnvironment = createAppEnvironment({
  production: true,
  environmentName: 'production',
  apiBaseUrl,
  baseUrl: readBaseUrlFromProcessEnv(),
  signalRUrl: readSignalRUrlFromProcessEnv(),
  siteUrl,
  appUrl: readAppUrlFromProcessEnv(),
  listingsLive: readListingsLiveFromProcessEnv(),
  supabase: readSupabaseFromProcessEnv(),
  googleClientId: readProcessEnv('GOOGLE_CLIENT_ID') ?? '',
  appleClientId: readProcessEnv('APPLE_CLIENT_ID') ?? '',
  appleRedirectUri,
  ads: readAdsFromProcessEnv(),
});
