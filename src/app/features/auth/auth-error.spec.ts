import { FormControl } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';

import { applyAuthFieldErrors, resolveAuthError } from './auth-error';

/** instant() returns the key, so every assertion names the sentence that would be shown. */
const translate = { instant: (key: string) => key } as unknown as TranslateService;

describe('resolveAuthError', () => {
  it('a dropped connection is a network problem, never a credentials problem', () => {
    expect(resolveAuthError(translate, { status: 0 }).kind).toBe('network');
    expect(resolveAuthError(translate, { status: 0 }).message).toBe('AUTH.ERRORS.NETWORK_ERROR');
  });

  it('a timeout is its own sentence', () => {
    const resolved = resolveAuthError(translate, { name: 'TimeoutError' });
    expect(resolved.kind).toBe('timeout');
    expect(resolved.message).toBe('AUTH.ERRORS.TIMEOUT');
  });

  it('502 / 503 / 504 are server problems, not "wrong password"', () => {
    for (const status of [500, 502, 503, 504]) {
      const resolved = resolveAuthError(translate, { status, error: { message: 'English text' } });
      expect(resolved.kind).toBe('server');
      expect(resolved.message).toBe('AUTH.ERRORS.SERVER_ERROR');
    }
  });

  it('puts the e-mail-taken code on the e-mail field', () => {
    const resolved = resolveAuthError(translate, { status: 409, error: { code: 'EMAIL_ALREADY_REGISTERED' } });
    expect(resolved.fields).toEqual([jasmine.objectContaining({ field: 'email', message: 'AUTH.ERRORS.EMAIL_ALREADY_EXISTS' })]);
    expect(resolved.message).toBeNull();
  });

  it('a bare 409 means "e-mail taken" only when the page says so', () => {
    expect(resolveAuthError(translate, { status: 409 }, { conflictMeansEmailTaken: true }).fields[0]?.field).toBe('email');
    expect(resolveAuthError(translate, { status: 409 }).fields).toEqual([]);
  });

  it('reads the 422 dictionary: each reason goes to its own field, translated by code', () => {
    const resolved = resolveAuthError(translate, {
      status: 422,
      error: {
        errors: { Password: ['English'], Email: ['English'] },
        errorCodes: { Password: ['PASSWORD_NO_SPECIAL'], Email: ['EMAIL_INVALID'] }
      }
    });

    expect(resolved.fields.map(item => item.field).sort()).toEqual(['email', 'password']);
    expect(resolved.fields.find(item => item.field === 'email')?.message).toBe('AUTH.ERRORS.INVALID_EMAIL');
  });

  it('a password reason wins over the summary code that travels with it (phone registration)', () => {
    const resolved = resolveAuthError(translate, {
      status: 400,
      error: {
        code: 'PASSWORD_POLICY_FAILED',
        errors: { Password: ['x'] },
        errorCodes: { Password: ['PASSWORD_CONTAINS_PERSONAL_INFO'] }
      }
    });

    expect(resolved.kind).toBe('validation');
    expect(resolved.fields).toEqual([jasmine.objectContaining({ field: 'password', message: 'AUTH.ERRORS.PASSWORD_PERSONAL_INFO' })]);
  });

  it('maps the password field to newPassword on a reset form', () => {
    const resolved = resolveAuthError(
      translate,
      { status: 400, error: { errors: ['x'], errorCodes: ['PASSWORD_BREACHED'] } },
      { passwordField: 'newPassword' }
    );
    expect(resolved.fields[0]?.field).toBe('newPassword');
  });

  it('an OTP code goes to the code field and carries the Retry-After of a 429', () => {
    const resolved = resolveAuthError(translate, {
      status: 429,
      error: { code: 'OTP_RATE_LIMITED' },
      headers: { get: (name: string) => (name === 'Retry-After' ? '120' : null) }
    });
    expect(resolved.kind).toBe('rate_limited');
    expect(resolved.retryAfterSeconds).toBe(120);
    expect(resolved.fields[0]?.field).toBe('code');
  });

  it('401 is "credentials", 429 without a code is "rate limited", anything else the fallback', () => {
    expect(resolveAuthError(translate, { status: 401 }).kind).toBe('credentials');
    expect(resolveAuthError(translate, { status: 429 }).message).toBe('AUTH.ERRORS.RATE_LIMITED');
    expect(resolveAuthError(translate, { status: 418 }, { fallbackKey: 'AUTH.ERRORS.REGISTER_FAILED' }).message)
      .toBe('AUTH.ERRORS.REGISTER_FAILED');
  });

  it('never shows the API\'s English text', () => {
    const resolved = resolveAuthError(translate, { status: 400, error: { message: 'Some English sentence' } });
    expect(resolved.message).not.toContain('English');
  });
});

describe('applyAuthFieldErrors', () => {
  it('sets the sentence on the control, and the next edit clears it', () => {
    const control = new FormControl('a@b.c');
    const resolved = resolveAuthError(translate, { status: 409, error: { code: 'EMAIL_ALREADY_REGISTERED' } });

    const leftovers = applyAuthFieldErrors(resolved, { email: control });

    expect(leftovers).toEqual([]);
    expect(control.errors).toEqual({ server: 'AUTH.ERRORS.EMAIL_ALREADY_EXISTS' });

    control.setValue('other@b.c');
    expect(control.errors).toBeNull();
  });

  it('returns the sentences that belong to no control on this page', () => {
    const resolved = resolveAuthError(translate, { status: 0 });
    expect(applyAuthFieldErrors(resolved, {})).toEqual(['AUTH.ERRORS.NETWORK_ERROR']);
  });
});
