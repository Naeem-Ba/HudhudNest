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
import { AppEnvironment } from '../../../environments/environment.model';

function fakeEnv(overrides: Partial<AppEnvironment>): AppEnvironment {
  return {
    production: false,
    environmentName: 'production',
    baseUrl: 'https://wohnungen-api.onrender.com',
    apiBaseUrl: 'https://wohnungen-api.onrender.com/api',
    apiUrl: 'https://wohnungen-api.onrender.com/api',
    signalRUrl: 'https://wohnungen-api.onrender.com/notificationHub',
    siteUrl: 'https://realestateworld.world',
    googleClientId: '',
    appleClientId: '',
    appleRedirectUri: '',
    ...overrides
  };
}

describe('resolveAuthApiBaseUrl', () => {
  it('✅ محلياً (local): يبقى العنوان الكامل المطلق دائماً — لا فرق بين المضيفين هناك أصلاً', () => {
    spyOn(Capacitor, 'isNativePlatform').and.returnValue(false);
    const env = fakeEnv({ environmentName: 'local', apiBaseUrl: 'https://localhost:7136/api' });

    expect(resolveAuthApiBaseUrl(env)).toBe('https://localhost:7136/api');
  });

  it('✅ على الويب المنشور (staging/production) وبمتصفح عادي: يعيد مساراً نسبياً same-origin', () => {
    spyOn(Capacitor, 'isNativePlatform').and.returnValue(false);
    const env = fakeEnv({ environmentName: 'production' });

    expect(resolveAuthApiBaseUrl(env)).toBe('/api');
  });

  it('✅ staging أيضاً same-origin — نفس منطق production بالضبط', () => {
    spyOn(Capacitor, 'isNativePlatform').and.returnValue(false);
    const env = fakeEnv({ environmentName: 'staging', apiBaseUrl: 'https://propertyapi-staging-api.onrender.com/api' });

    expect(resolveAuthApiBaseUrl(env)).toBe('/api');
  });

  it('✅ داخل تطبيق Capacitor الأصلي (حتى وإن كان environmentName=production): يبقى العنوان الكامل المطلق — لا Netlify أمامه ليُوسِّط الطلب', () => {
    spyOn(Capacitor, 'isNativePlatform').and.returnValue(true);
    const env = fakeEnv({ environmentName: 'production' });

    expect(resolveAuthApiBaseUrl(env)).toBe('https://wohnungen-api.onrender.com/api');
  });
});
