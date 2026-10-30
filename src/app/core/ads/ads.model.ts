/**
 * Shared vocabulary of the ads layer (docs/MONETIZATION.md). Nothing in here talks to Google; it is plain types
 * and constants so the policy and the config can be unit-tested without a browser or a native runtime.
 */
export type AdPlatform = 'web' | 'android' | 'ios';

/** The only two places an ad may appear in v1. Adding a placement is a deliberate, reviewed change. */
export type AdPlacement = 'search-results' | 'property-detail';

/** Why an ad is not requested. Logged as this code only, never with user data. */
export type AdBlockReason =
  | 'master-disabled'
  | 'platform-disabled'
  | 'placement-not-allowed'
  | 'missing-ids'
  | 'offline'
  | 'consent-unknown'
  | 'consent-denied'
  | 'load-failed';

/** `reason` is set exactly when `allowed` is false. */
export interface AdDecision {
  allowed: boolean;
  reason?: AdBlockReason;
}

export type AdConsentState = 'unknown' | 'granted' | 'denied' | 'not-required';

/**
 * Google's official sample units (https://developers.google.com/admob/android/test-ads and /ios/test-ads). They
 * are public, serve test creatives only and earn nothing. They are used ONLY when the build is a local development
 * build; a production/staging build rejects them so a test unit can never ship by mistake.
 */
export const GOOGLE_TEST_ADMOB_BANNER: Record<'android' | 'ios', string> = {
  android: 'ca-app-pub-3940256099942544/6300978111',
  ios: 'ca-app-pub-3940256099942544/2934735716'
};
export const GOOGLE_TEST_PUBLISHER_FRAGMENT = '3940256099942544';

export const ADSENSE_PUBLISHER_PATTERN = /^ca-pub-\d{10,20}$/;
export const ADSENSE_SLOT_PATTERN = /^\d{6,20}$/;
export const ADMOB_UNIT_PATTERN = /^ca-app-pub-\d{16}\/\d{10}$/;

/** Ads load only on these page shapes; every other route (auth, forms, messages, payments, services, account, admin) is excluded by construction. */
export const PLACEMENT_ROUTES: Record<AdPlacement, RegExp> = {
  'search-results': /^\/properties\/?$/,
  'property-detail': /^\/properties\/(?!new$|edit$)[^/]+\/?$/
};
