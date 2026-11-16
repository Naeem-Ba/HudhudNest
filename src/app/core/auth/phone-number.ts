import { AbstractControl, ValidationErrors } from '@angular/forms';

/** E.164, the only format the API accepts (`E164PhoneNumberNormalizer`). */
export const PHONE_E164_PATTERN = /^\+[1-9]\d{7,14}$/;

const ARABIC_INDIC_ZERO = 0x0660;
const EXTENDED_ARABIC_INDIC_ZERO = 0x06f0;

/** Arabic-Indic (٠-٩) and Persian (۰-۹) digits to ASCII; everything else untouched. */
export function toAsciiDigits(raw: string | null | undefined): string {
  return String(raw ?? '')
    .replace(/[٠-٩]/g, ch => String(ch.charCodeAt(0) - ARABIC_INDIC_ZERO))
    .replace(/[۰-۹]/g, ch => String(ch.charCodeAt(0) - EXTENDED_ARABIC_INDIC_ZERO));
}

/**
 * Turns what a person actually types into the strict E.164 the API requires, without guessing
 * beyond the common Syrian habits:
 *  - Arabic-Indic / Persian digits become ASCII digits,
 *  - spaces, dashes, dots and parentheses are dropped,
 *  - `00963…` becomes `+963…`,
 *  - a local mobile `09xxxxxxxx` becomes `+9639xxxxxxxx`,
 *  - a stray trunk zero after the country code (`+9630 9…`) is removed.
 * Anything else is returned cleaned but otherwise untouched, so the E.164 check (here and on the
 * server) still decides. The server contract stays strict; this only removes typing friction.
 */
export function normalizePhoneInput(raw: string | null | undefined): string {
  let value = String(raw ?? '')
    .replace(/[٠-٩]/g, ch => String(ch.charCodeAt(0) - ARABIC_INDIC_ZERO))
    .replace(/[۰-۹]/g, ch => String(ch.charCodeAt(0) - EXTENDED_ARABIC_INDIC_ZERO))
    .replace(/[\s \-.()]/g, '');

  if (value.startsWith('00')) {
    value = `+${value.slice(2)}`;
  }

  if (/^09\d{8}$/.test(value)) {
    return `+963${value.slice(1)}`;
  }

  if (/^\+9630\d{9}$/.test(value)) {
    return `+963${value.slice(5)}`;
  }

  return value;
}

/** Form validator: valid when the *normalized* input is E.164. Reports the usual `pattern` error. */
export function phoneNumberValidator(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? '');
  if (value.trim() === '') {
    return null; // `required` reports emptiness
  }
  return PHONE_E164_PATTERN.test(normalizePhoneInput(value)) ? null : { pattern: true };
}
