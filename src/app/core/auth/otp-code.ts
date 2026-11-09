import { AbstractControl, ValidationErrors } from '@angular/forms';

import { toAsciiDigits } from './phone-number';

/**
 * The one-time code as the server wants it: six ASCII digits. People on an Arabic keyboard type
 * ٤٥٦٧٨٩ (and paste codes with spaces); the phone field already accepts that, the code field did not and
 * answered "The code has 6 digits" to six digits (QA Phase 26, P26-D03). The server contract stays strict.
 */
export function normalizeOtpCode(raw: string | null | undefined): string {
  return toAsciiDigits(raw).replace(/[\s\u200e\u200f\u202a-\u202e-]/g, '');
}

/** Form validator: valid when the *normalized* code is exactly six digits. Reports the usual `pattern` error. */
export function otpCodeValidator(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? '');
  if (value.trim() === '') {
    return null; // `required` reports emptiness
  }
  return /^\d{6}$/.test(normalizeOtpCode(value)) ? null : { pattern: true };
}
