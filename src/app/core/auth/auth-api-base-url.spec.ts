// =====================================================================
// ✅ Unit Tests – auth-api-base-url.spec.ts
// Production incident (2026-09): Safari drops refresh_token/CSRF cookies outright as
// third-party cookies (no CHIPS/Partitioned exception, unlike Chrome/Edge). This resolver is
// what routes /auth/* and /security/csrf-token through a same-origin Netlify-proxied path on
// the deployed web app, while staying absolute for local dev (already same-site) and the
// native Capacitor app (bundled locally, no Netlify proxy in front of it).
// =====================================================================
import { Capacitor } from '@capacitor/core';

import { resolveAuthApiBaseUrl } from './auth-api-base-url';
import { ADS_DISABLED, AppEnvironment } from '../../../environments/environment.model';

function fakeEnv(overrides: Partial<AppEnvironment>): AppEnvironment {
  return {
    production: false,
    environmentName: 'production',
    baseUrl: 'https://wohnungen-api.onrender.com',
    apiBaseUrl: 'https://wohnungen-api.onrender.com/api',
    apiUrl: 'https://wohnungen-api.onrender.com/api',
    signalRUrl: 'https://wohnungen-api.onrender.com/notificationHub',
    siteUrl: 'https://hudhudnest.com',
    googleClientId: '',
    appleClientId: '',
    appleRedirectUri: '',
    ads: ADS_DISABLED,
    ...overrides
  };
}

describe('resolveAuthApiBaseUrl', () => {
  it('✅ محلياً (local): يبقى العنوان الكامل المطلق دائماً — لا فرق بين المضيفين هناك أصلاً', () => {
    spyOn(Capacitor, 'isNativePlatform').and.returnValue(false);
    const env = fakeEnv({ environmentName: 'local', apiBaseUrl: 'https://localhost:7136/api' });

    expect(resolveAuthApiBaseUrl(env)).toBe('https://localhost:7136/api');
  });

  it('✅ على الويب المنشور (production) وبمتصفح عادي: يعيد مساراً نسبياً same-origin', () => {
    spyOn(Capacitor, 'isNativePlatform').and.returnValue(false);
    const env = fakeEnv({ environmentName: 'production' });

    expect(resolveAuthApiBaseUrl(env)).toBe('/api');
  });

  // ✅ إصلاح حادثة 2026-09-18: netlify.toml's [[redirects]] الحالية بلا context محدَّد (بعد
  // تصحيح خطأ context="..." غير الصالح الذي كان يُعطِّلها بالكامل) — تشير فقط إلى الخلفية
  // الحقيقية (production). توجيه استدعاءات staging عبر مسار نسبي هنا سيرسلها خطأً إلى
  // خلفية production بدل خلفية staging الخاصة بها. لذا تبقى staging على الاتصال المباشر
  // المطلق كما كانت — غير مُصلَحة لـSafari هناك تحديداً، لكن غير معطوبة.
  it('✅ staging تبقى على العنوان الكامل المطلق (غير same-origin) — توجيهات Netlify الحالية للـproduction فقط', () => {
    spyOn(Capacitor, 'isNativePlatform').and.returnValue(false);
    const env = fakeEnv({ environmentName: 'staging', apiBaseUrl: 'https://propertyapi-staging-api.onrender.com/api' });

    expect(resolveAuthApiBaseUrl(env)).toBe('https://propertyapi-staging-api.onrender.com/api');
  });

  it('✅ داخل تطبيق Capacitor الأصلي (حتى وإن كان environmentName=production): يبقى العنوان الكامل المطلق — لا Netlify أمامه ليُوسِّط الطلب', () => {
    spyOn(Capacitor, 'isNativePlatform').and.returnValue(true);
    const env = fakeEnv({ environmentName: 'production' });

    expect(resolveAuthApiBaseUrl(env)).toBe('https://wohnungen-api.onrender.com/api');
  });
});
