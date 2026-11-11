// Decides the UI language for a visitor who has never chosen one.
//
// Rules, in order (the product owner's rules, kept in one pure function so they are testable):
//   1. A language the user picked, or one detected on an earlier visit, is handled by LanguageService
//      and never reaches this function.
//   2. Country known:
//        Arab League country            -> Arabic
//        German-speaking country        -> German
//        anywhere else                  -> the device language when it is Arabic, English, German or Turkish,
//                                          otherwise English
//   3. Country unknown (offline, VPN, geo disabled, endpoint unreachable):
//        the device language when it is Arabic, English, German or Turkish, otherwise Arabic (the app's
//        long-standing default).
//
// Turkish has no country rule on purpose: many Arabic-speaking residents of Turkey would be switched to a
// language they did not pick. A Turkish device language is honoured everywhere the rules above fall
// through to the device language.
//
// "Country" comes from GeoCountryService (an IP lookup at the Netlify edge); no location permission
// prompt is involved.

export type SupportedLanguage = 'ar' | 'en' | 'de' | 'tr';

const SUPPORTED: readonly SupportedLanguage[] = ['ar', 'en', 'de', 'tr'];

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

export function resolveFirstVisitLanguage({ country, deviceLanguages }: FirstVisitInput): SupportedLanguage {
  const device = pickDeviceLanguage(deviceLanguages);
  const code = country?.trim().toUpperCase() ?? '';

  if (/^[A-Z]{2}$/.test(code)) {
    if (ARAB_COUNTRY_CODES.has(code)) {
      return 'ar';
    }

    if (GERMAN_SPEAKING_COUNTRY_CODES.has(code)) {
      return 'de';
    }

    return device ?? 'en';
  }

  return device ?? 'ar';
}
