import { FormControl } from '@angular/forms';

import { normalizeOtpCode, otpCodeValidator } from './otp-code';

describe('otp code (P26-D03)', () => {
  it('turns Arabic-Indic and Persian digits into ASCII', () => {
    expect(normalizeOtpCode('٤٥٦٧٨٩')).toBe('456789');
    expect(normalizeOtpCode('۱۲۳۴۵۶')).toBe('123456');
  });

  it('drops the spaces, dashes and bidi marks a pasted or RTL-typed code carries', () => {
    expect(normalizeOtpCode(' 123 456 ')).toBe('123456');
    expect(normalizeOtpCode('123-456')).toBe('123456');
    expect(normalizeOtpCode('‏123456‎')).toBe('123456');
  });

  it('handles empty values', () => {
    expect(normalizeOtpCode(null)).toBe('');
    expect(normalizeOtpCode(undefined)).toBe('');
  });

  it('validates the normalized code: six digits in any script pass, everything else is a pattern error', () => {
    const check = (value: string | null) => otpCodeValidator(new FormControl(value));

    expect(check('456789')).toBeNull();
    expect(check('٤٥٦٧٨٩')).toBeNull();
    expect(check('456 789')).toBeNull();
    expect(check('')).toBeNull(); // `required` owns emptiness
    expect(check('45678')).toEqual({ pattern: true });
    expect(check('4567890')).toEqual({ pattern: true });
    expect(check('abcdef')).toEqual({ pattern: true });
  });
});
