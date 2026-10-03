// Decides the UI language for a visitor who has never chosen one.
//
// Rules, in order (the product owner's rules, kept in one pure function so they are testable):
//   1. A language the user picked, or one detected on an earlier visit, is handled by LanguageService
//      and never reaches this function.
//   2. The device language wins whenever it is Arabic, English or German - wherever the visitor is.
//   3. Otherwise (the device speaks something the app is not translated into) the country decides:
//        Arab League country            -> Arabic
//        German-speaking country        -> German
//        anywhere else                  -> English
//   4. Otherwise (no usable country: offline, VPN, geo disabled, endpoint unreachable) -> Arabic, the
//      app's long-standing default.
//
// Because rule 2 settles most visitors on their own, the country lookup (GeoCountryService, an IP lookup
// at the Netlify edge, no location-permission prompt) is only made when the device language is
// unsupported - see needsCountryLookup().

export type SupportedLanguage = 'ar' | 'en' | 'de';

const SUPPORTED: readonly SupportedLanguage[] = ['ar', 'en', 'de'];

/** The 22 Arab League members (plus Western Sahara, which geo databases report separately as EH). */
export const ARAB_COUNTRY_CODES: ReadonlySet<string> = new Set([
  'AE', 'BH', 'DJ', 'DZ', 'EG', 'EH', 'IQ', 'JO', 'KM', 'KW', 'LB',
  'LY', 'MA', 'MR', 'OM', 'PS', 'QA', 'SA', 'SD', 'SO', 'SY', 'TN', 'YE'
]);

/** Countries where German is the main language of everyday life: Germany, Austria, Switzerland, Liechtenstein. */
export const GERMAN_SPEAKING_COUNTRY_CODES: ReadonlySet<string> = new Set(['DE', 'AT', 'CH', 'LI']);

export interface FirstVisitInput {
  /** ISO 3166-1 alpha-2 code, or null when unknown. */
  readonly country: string | null;
  /** Browser/device language tags in preference order, e.g. ["ar-SY", "en-US"]. */
  readonly deviceLanguages: readonly string[];
}

/** "ar-SY" -> "ar"; anything unsupported (including "") -> null. */
export function toSupportedLanguage(tag: string | null | undefined): SupportedLanguage | null {
  const primary = (tag ?? '').trim().toLowerCase().split(/[-_]/, 1)[0];
  return SUPPORTED.find(language => language === primary) ?? null;
}

/** The first of the device's preferred languages that the app is translated into. */
export function pickDeviceLanguage(deviceLanguages: readonly string[]): SupportedLanguage | null {
  for (const tag of deviceLanguages) {
    const language = toSupportedLanguage(tag);
    if (language) {
      return language;
    }
  }

  return null;
}

/** True when the device language alone cannot decide, i.e. the country is worth asking for. */
export function needsCountryLookup(deviceLanguages: readonly string[]): boolean {
  return pickDeviceLanguage(deviceLanguages) === null;
}

export function resolveFirstVisitLanguage({ country, deviceLanguages }: FirstVisitInput): SupportedLanguage {
  const device = pickDeviceLanguage(deviceLanguages);

  if (device) {
    return device;
  }

  const code = country?.trim().toUpperCase() ?? '';

  if (/^[A-Z]{2}$/.test(code)) {
    if (ARAB_COUNTRY_CODES.has(code)) {
      return 'ar';
    }

    if (GERMAN_SPEAKING_COUNTRY_CODES.has(code)) {
      return 'de';
    }

    return 'en';
  }

  return 'ar';
}
