// The language the page is showing, for the few API requests whose server-side reply is written
// in a language (today: the account-confirmation email).
//
// Why the <html lang> attribute and not LanguageService: LanguageService.use() is the only writer
// of document.documentElement.lang (index.html ships "ar"), so the attribute is the language the
// visitor is looking at, and reading it needs no injection. The API services that attach it are
// constructed in dozens of specs whose TranslateService is a one-method spy; injecting
// LanguageService there would build the real service against that spy and throw.

import { SupportedLanguage, toSupportedLanguage } from './first-visit-language';
import { numberLocaleFor } from './supported-preferences';

/** "ar" | "en" | "de" for the language on screen, or null when it cannot be told. */
export function currentUiLanguage(): SupportedLanguage | null {
  if (typeof document === 'undefined') {
    return null;
  }

  return toSupportedLanguage(document.documentElement.lang);
}

/**
 * The request body with `language` added when the page language is known. An explicit
 * `language` already on the body wins. Left out entirely when unknown, so an API that predates
 * the field sees exactly the body it always did.
 */
export function withUiLanguage<T extends object>(body: T): T & { language?: SupportedLanguage } {
  const language = currentUiLanguage();

  return language ? { language, ...body } : body;
}

/** The locale to format numbers and money with: the language on screen (Arabic when it cannot be told). */
export function uiNumberLocale(): string {
  return numberLocaleFor(currentUiLanguage());
}

/** The separator for a list of places or parts of an address: the Arabic comma only in Arabic. */
export function listSeparator(): string {
  return currentUiLanguage() === 'ar' ? '، ' : ', ';
}
