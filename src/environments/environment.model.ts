export type AppEnvironmentName = 'local' | 'staging' | 'production';

export interface AppEnvironment {
  production: boolean;
  environmentName: AppEnvironmentName;

  /** Backend origin without /api. Used for static files and absolute media URLs. */
  baseUrl: string;

  /** REST API base URL. Primary value used by Angular API services. */
  apiBaseUrl: string;

  /** Backward-compatible alias for older services. Keep equal to apiBaseUrl. */
  apiUrl: string;

  /** SignalR notification hub URL. */
  signalRUrl: string;

  /**
   * Public, canonical origin of THIS Angular app (no trailing slash), used to build shareable
   * property links (Social Sharing & Distribution feature — see PropertyShareUrlService).
   * Deliberately separate from baseUrl/apiBaseUrl above, which point at the .NET backend, a
   * different origin entirely in staging/production (see frontend-repo-location memory).
   * Never falls back to a hardcoded default here: local dev has no public origin to point a
   * shared link at, so PropertyShareUrlService falls back to window.location.origin itself
   * (reflecting whatever the developer is actually running on) rather than this being empty
   * silently becoming "https://hudhudnest.com" in a context where that would be wrong.
   */
  siteUrl: string;

  /** Google OAuth Client ID. Empty value disables Google login button. */
  googleClientId: string;

  /** Apple Services ID / Client ID. Empty value disables Apple login button. */
  appleClientId: string;

  /** Apple redirect URI. Required for Apple Sign In popup flow. */
  appleRedirectUri: string;

  /**
   * Origin of the platform (the app itself) that the marketing pages link to ("Zur Plattform", "Immobilie
   * inserieren"). No trailing slash. Defaults to siteUrl; empty in local dev, where the pages fall back to a
   * relative link on the current origin.
   */
  appUrl: string;

  /**
   * Whether property listings exist yet. While false the marketing pages show no search, no listing grid and
   * never link to a (empty) search result: the primary call to action is "list your property" and the
   * secondary one opens the waitlist. Only the exact build variable LISTINGS_LIVE=true switches it on.
   */
  listingsLive: boolean;

  /**
   * Supabase project used ONLY for the public waitlist (table waitlist_signups, INSERT-only for the anon role).
   * The anon key is public by design; the service_role key must never appear in this app. Empty = the waitlist
   * form reports that signing up is not available, instead of pretending to save.
   */
  supabase: SupabaseEnvironment;

  /** Monetization switches and public ad identifiers. Everything is off/empty unless set at build time. */
  ads: AdsEnvironment;
}

export interface SupabaseEnvironment {
  url: string;
  anonKey: string;
}

/**
 * Raw ad settings baked in at build time (see docs/MONETIZATION.md). Flags are independent layers: `enabled`
 * is the master switch, the three platform flags select where ads may run. Ids are never defaulted or invented;
 * empty means "no ad is requested for that slot". Publisher/ad-unit ids are public by design (they appear in
 * every page that shows an ad), so keeping them in the client is correct; nothing here is a secret.
 */
export interface AdsEnvironment {
  enabled: boolean;
  webEnabled: boolean;
  androidEnabled: boolean;
  iosEnabled: boolean;
  /** AdSense publisher id ("ca-pub-" followed by digits). */
  adsensePublisherId: string;
  /** AdSense ad unit (slot) ids, numeric strings. */
  adsenseSlotSearch: string;
  adsenseSlotDetail: string;
  /** AdMob banner ad unit ids, "ca-app-pub-xxx/yyy". Empty in dev falls back to Google's test units. */
  admobBannerAndroid: string;
  admobBannerIos: string;
}

// BUG-20: `process` does not exist in the browser bundle produced by
// @angular/build:application — there is no --define/env-injection wiring in
// this project's angular.json, so reading `process.env.X` here always
// evaluated to undefined in every real deployment. Fixed by reading from
// env.generated.ts instead, which tools/generate-env.mjs writes with real,
// literal values BEFORE `ng build` runs (see package.json build:* scripts).
// That file is git-ignored and regenerated on every build; a fresh checkout
// with no env vars set produces empty strings here, same as before.
import { generatedEnv } from './env.generated';

function clean(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function readGoogleClientIdFromProcessEnv(): string | undefined {
  return clean(generatedEnv.GOOGLE_CLIENT_ID);
}

export function readAppleClientIdFromProcessEnv(): string | undefined {
  return clean(generatedEnv.APPLE_CLIENT_ID);
}

export function readProcessEnv(key: keyof typeof generatedEnv): string | undefined {
  return clean(generatedEnv[key]);
}

export function readApiUrlFromProcessEnv(): string | undefined {
  return readProcessEnv('API_URL');
}

export function readBaseUrlFromProcessEnv(): string | undefined {
  return readProcessEnv('BASE_URL');
}

export function readSignalRUrlFromProcessEnv(): string | undefined {
  return readProcessEnv('SIGNALR_URL');
}

export function readAppUrlFromProcessEnv(): string | undefined {
  return readProcessEnv('APP_URL');
}

export function readSupabaseFromProcessEnv(): SupabaseEnvironment {
  return { url: readProcessEnv('SUPABASE_URL') ?? '', anonKey: readProcessEnv('SUPABASE_ANON_KEY') ?? '' };
}

export function readListingsLiveFromProcessEnv(): boolean {
  return flag('LISTINGS_LIVE');
}

export function readSiteUrlFromProcessEnv(): string | undefined {
  return readProcessEnv('SITE_URL');
}

/** Only the exact string "true" switches a flag on, so a typo or an unset variable can never enable ads. */
function flag(key: keyof typeof generatedEnv): boolean {
  return readProcessEnv(key)?.toLowerCase() === 'true';
}

export function readAdsFromProcessEnv(): AdsEnvironment {
  return {
    enabled: flag('ADS_ENABLED'),
    webEnabled: flag('WEB_ADS_ENABLED'),
    androidEnabled: flag('ANDROID_ADS_ENABLED'),
    iosEnabled: flag('IOS_ADS_ENABLED'),
    adsensePublisherId: readProcessEnv('ADSENSE_PUBLISHER_ID') ?? '',
    adsenseSlotSearch: readProcessEnv('ADSENSE_SLOT_SEARCH') ?? '',
    adsenseSlotDetail: readProcessEnv('ADSENSE_SLOT_DETAIL') ?? '',
    admobBannerAndroid: readProcessEnv('ADMOB_BANNER_ANDROID') ?? '',
    admobBannerIos: readProcessEnv('ADMOB_BANNER_IOS') ?? ''
  };
}

/**
 * Reports of unhandled app errors to our own API are on in every build except an explicit
 * CLIENT_ERROR_REPORTING_DISABLED=true. Only the exact string switches them off, so a typo keeps reporting on
 * (the reports hold no personal data) rather than silently losing crash visibility.
 */
export function readClientErrorReportingEnabled(): boolean {
  return readProcessEnv('CLIENT_ERROR_REPORTING_DISABLED')?.toLowerCase() !== 'true';
}

export const ADS_DISABLED: AdsEnvironment = {
  enabled: false,
  webEnabled: false,
  androidEnabled: false,
  iosEnabled: false,
  adsensePublisherId: '',
  adsenseSlotSearch: '',
  adsenseSlotDetail: '',
  admobBannerAndroid: '',
  admobBannerIos: ''
};

export function withoutTrailingSlash(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

export function normalizeApiBaseUrl(value: string): string {
  const normalized = withoutTrailingSlash(value);
  return /\/api$/i.test(normalized) ? normalized : `${normalized}/api`;
}

export function backendOriginFromApiBaseUrl(apiBaseUrl: string): string {
  return normalizeApiBaseUrl(apiBaseUrl).replace(/\/api$/i, '');
}

export function createAppEnvironment(config: {
  production: boolean;
  environmentName: AppEnvironmentName;
  apiBaseUrl: string;
  baseUrl?: string;
  signalRUrl?: string;
  siteUrl?: string;
  appUrl?: string;
  listingsLive?: boolean;
  supabase?: SupabaseEnvironment;
  googleClientId?: string;
  appleClientId?: string;
  appleRedirectUri?: string;
  ads?: AdsEnvironment;
}): AppEnvironment {
  const apiBaseUrl = normalizeApiBaseUrl(config.apiBaseUrl);
  const baseUrl = withoutTrailingSlash(config.baseUrl ?? backendOriginFromApiBaseUrl(apiBaseUrl));
  const signalRUrl = withoutTrailingSlash(config.signalRUrl ?? `${baseUrl}/notificationHub`);
  const siteUrl = config.siteUrl ? withoutTrailingSlash(config.siteUrl) : '';

  return {
    production: config.production,
    environmentName: config.environmentName,
    baseUrl,
    siteUrl,
    appUrl: config.appUrl ? withoutTrailingSlash(config.appUrl) : siteUrl,
    listingsLive: config.listingsLive ?? false,
    supabase: config.supabase ?? { url: '', anonKey: '' },
    apiBaseUrl,
    apiUrl: apiBaseUrl,
    signalRUrl,
    googleClientId: config.googleClientId ?? '',
    appleClientId: config.appleClientId ?? '',
    appleRedirectUri: config.appleRedirectUri ?? '',
    ads: config.ads ?? ADS_DISABLED
  };
}
