// Language codes the app is translated into, and the parser for a language tag.
//
// There is no first-visit detection any more (product decision 2026-11-06): a visitor who has not picked a
// language sees Arabic, whatever the country or device says. See LanguageService / resolveInitialLanguage.

export type SupportedLanguage = 'ar' | 'en' | 'de';

const SUPPORTED: readonly SupportedLanguage[] = ['ar', 'en', 'de'];

/** "ar-SY" -> "ar"; anything unsupported (including "") -> null. */
export function toSupportedLanguage(tag: string | null | undefined): SupportedLanguage | null {
  const primary = (tag ?? '').trim().toLowerCase().split(/[-_]/, 1)[0];
  return SUPPORTED.find(language => language === primary) ?? null;
}
