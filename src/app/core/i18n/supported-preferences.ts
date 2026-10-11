// The languages and display currencies an account can choose. Mirrors the API's
// SupportedPreferences (HudhudNestApi.Domain/Users/Constants/SupportedPreferences.cs): the
// server rejects any other code, so offering one here would only produce a failed save.

export type CurrencyCode = 'EUR' | 'USD' | 'SYP' | 'TRY' | 'AED' | 'SAR';

export const SUPPORTED_CURRENCIES: readonly CurrencyCode[] = ['EUR', 'USD', 'SYP', 'TRY', 'AED', 'SAR'];

export function toSupportedCurrency(code: string | null | undefined): CurrencyCode | null {
  const upper = (code ?? '').trim().toUpperCase();
  return SUPPORTED_CURRENCIES.find(currency => currency === upper) ?? null;
}

/**
 * The BCP-47 locale used to format numbers and money for a UI language. Money is always
 * formatted with the language the screen is in, never with a hard-coded one, so a German
 * reader sees "1.234 €" and an Arabic reader the Arabic form of the same amount.
 */
export function numberLocaleFor(language: string | null | undefined): string {
  switch ((language ?? '').toLowerCase()) {
    case 'de':
      return 'de-DE';
    case 'en':
      return 'en-US';
    default:
      return 'ar';
  }
}
