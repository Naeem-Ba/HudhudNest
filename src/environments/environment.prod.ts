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

// هدهد نيست (HudhudNest) — النطاق العام الحقيقي أصبح hudhudnest.com (2026-09-23: DNS/SSL/
// Netlify Primary domain/Render Frontend__BaseUrl مؤكَّدة حيّة). realestateworld.world بقي
// alias يعمل عمداً في Netlify وضمن allowNavigation في capacitor.config.ts، لدعم أي نسخة
// تطبيق مثبَّتة لم تُحدَّث بعد. هذا هو النطاق الذي تُبنى عليه روابط المشاركة العامة
// (canonical) — راجع PropertyShareUrlService.
const siteUrl = readSiteUrlFromProcessEnv() || 'https://hudhudnest.com';

// ⚠️ لم يُحدَّث بعد عمداً: Sign in with Apple لا يزال يستخدم realestateworld.world لأن الـ
// Services ID في Apple Developer لم يُسجَّل بعد لنطاق hudhudnest.com (الحساب غير مُفعَّل
// هناك حتى 2026-09-23) — تغيير هذا القبل تسجيل النطاق في لوحة Apple يكسر تسجيل الدخول عبر
// Apple فوراً. يجب أن يطابق نطاق appleRedirectUri أحد الأنماط المدرجة ضمن
// server.allowNavigation في capacitor.config.ts (كلا النطاقين مدرجان الآن). حدّث هذا السطر
// إلى hudhudnest.com فور تأكيد تسجيل Domains/Return URLs في Apple Developer.
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
