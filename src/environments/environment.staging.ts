import {
  AppEnvironment,
  createAppEnvironment,
  readAdsFromProcessEnv,
  readApiUrlFromProcessEnv,
  readBaseUrlFromProcessEnv,
  readSignalRUrlFromProcessEnv,
  readSiteUrlFromProcessEnv,
  readProcessEnv
} from './environment.model';

// Security audit finding (2026-09-18): this used to fall back to the PRODUCTION backend
// (`api.hudhudnest.com`, the same default environment.prod.ts uses) whenever API_URL
// wasn't injected at build time. That's not a harmless config gap -- a Staging bundle silently
// talking to the real Production API means any write a tester performs (bookings, listing
// edits, account changes) lands in real user data with no visual difference from a correctly
// isolated Staging session. This already happened once (see frontend-repo-location memory,
// 2026-09-04 incident) via a different root cause (Netlify building the wrong bundle
// entirely); this fallback was the same risk lying dormant for the *correct* bundle too, if
// API_URL is ever unset (a Netlify env var deleted/misconfigured, a local `build:staging` run,
// a new CI path). Failing loudly here -- the Staging bundle refuses to boot at all without a
// real, explicit API_URL -- is strictly safer: a broken Staging site is obvious to the first
// tester who opens it, while a working one quietly writing to Production could go unnoticed
// for a long time.
const apiBaseUrl = readApiUrlFromProcessEnv();

if (!apiBaseUrl) {
  throw new Error(
    'environment.staging.ts: API_URL was not provided at build time. Staging must never ' +
      "silently fall back to Production's backend -- set the API_URL env var (Netlify: " +
      "per-branch override on the 'staging' branch; local: see package.json's " +
      'build:staging/start:staging scripts) before building.'
  );
}

// نطاق Staging الحقيقي على Netlify (راجع render-staging-deployment / frontend-repo-location
// في الذاكرة) — روابط المشاركة على Staging يجب أن تشير هنا لا إلى نطاق الإنتاج.
const siteUrl = readSiteUrlFromProcessEnv() || 'https://staging--hudhudnest.netlify.app';

// راجع التعليق المطابق في environment.prod.ts: يجب أن يطابق النطاق هنا
// أحد الأنماط ضمن server.allowNavigation في capacitor.config.ts.
const appleRedirectUri =
  readProcessEnv('APPLE_REDIRECT_URI') || 'https://hudhudnest.com/auth/apple/callback';

export const environment: AppEnvironment = createAppEnvironment({
  production: true,
  environmentName: 'staging',
  apiBaseUrl,
  baseUrl: readBaseUrlFromProcessEnv(),
  signalRUrl: readSignalRUrlFromProcessEnv(),
  siteUrl,
  googleClientId: readProcessEnv('GOOGLE_CLIENT_ID') ?? '',
  appleClientId: readProcessEnv('APPLE_CLIENT_ID') ?? '',
  appleRedirectUri,
  ads: readAdsFromProcessEnv()
});
