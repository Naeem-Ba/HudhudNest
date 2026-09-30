import { FormControl } from '@angular/forms';

import { PHONE_E164_PATTERN, normalizePhoneInput, phoneNumberValidator } from './phone-number';

describe('normalizePhoneInput', () => {
  it('leaves a valid E.164 number untouched', () => {
    expect(normalizePhoneInput('+963933123456')).toBe('+963933123456');
    expect(normalizePhoneInput('+4915112345678')).toBe('+4915112345678');
  });

  it('turns a local Syrian mobile 09xxxxxxxx into +9639xxxxxxxx', () => {
    expect(normalizePhoneInput('0933123456')).toBe('+963933123456');
  });

  it('turns 00963… into +963…', () => {
    expect(normalizePhoneInput('00963933123456')).toBe('+963933123456');
    expect(normalizePhoneInput('0049 151 1234 5678')).toBe('+4915112345678');
  });

  it('drops spaces, dashes, dots, parentheses and non-breaking spaces', () => {
    expect(normalizePhoneInput(' +963 933-123.456 ')).toBe('+963933123456');
    expect(normalizePhoneInput('(0933) 123 456')).toBe('+963933123456');
  });

  it('converts Arabic-Indic and Persian digits', () => {
    expect(normalizePhoneInput('٠٩٣٣١٢٣٤٥٦')).toBe('+963933123456');
    expect(normalizePhoneInput('+۹۶۳۹۳۳۱۲۳۴۵۶')).toBe('+963933123456');
  });

  it('removes a stray trunk zero after the country code', () => {
    expect(normalizePhoneInput('+9630933123456')).toBe('+963933123456');
  });

  it('does not guess for anything else', () => {
    expect(normalizePhoneInput('933123456')).toBe('933123456'); // ambiguous: no country, no leading 0
    expect(normalizePhoneInput('01234')).toBe('01234');
    expect(normalizePhoneInput('abc')).toBe('abc');
    expect(normalizePhoneInput('')).toBe('');
    expect(normalizePhoneInput(null)).toBe('');
    expect(normalizePhoneInput(undefined)).toBe('');
  });

  it('never produces something the strict pattern accepts from garbage', () => {
    for (const bad of ['+963933; DROP TABLE', '<script>', '+96393', '+9639331234567890123']) {
      expect(PHONE_E164_PATTERN.test(normalizePhoneInput(bad))).toBeFalse();
    }
  });
});

describe('phoneNumberValidator', () => {
  const check = (value: string) => phoneNumberValidator(new FormControl(value));

  it('accepts what normalizes to E.164', () => {
    expect(check('0933123456')).toBeNull();
    expect(check('+963 933 123 456')).toBeNull();
    expect(check('٠٠٩٦٣٩٣٣١٢٣٤٥٦')).toBeNull();
  });

  it('rejects the rest with the usual pattern error', () => {
    expect(check('12345')).toEqual({ pattern: true });
    expect(check('hello')).toEqual({ pattern: true });
  });

  it('leaves emptiness to Validators.required', () => {
    expect(check('')).toBeNull();
    expect(check('   ')).toBeNull();
  });
});
