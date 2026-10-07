import { isEmailAlreadyRegistered } from './register-errors';

describe('isEmailAlreadyRegistered', () => {
  it('recognises the API 409 with its code', () => {
    expect(
      isEmailAlreadyRegistered({
        status: 409,
        error: { message: 'Email already registered.', code: 'EMAIL_ALREADY_REGISTERED' }
      })
    ).toBeTrue();
  });

  it('recognises a bare 409 (an API build that predates the code)', () => {
    expect(isEmailAlreadyRegistered({ status: 409, error: { message: 'Email already registered.' } })).toBeTrue();
    expect(isEmailAlreadyRegistered({ status: 409, error: null })).toBeTrue();
  });

  it('recognises the code even when the status was rewritten on the way', () => {
    expect(isEmailAlreadyRegistered({ status: 400, error: { code: 'EMAIL_ALREADY_REGISTERED' } })).toBeTrue();
  });

  it('is false for everything else', () => {
    expect(isEmailAlreadyRegistered({ status: 400, error: { message: 'Email must not contain whitespace.' } })).toBeFalse();
    expect(isEmailAlreadyRegistered({ status: 500, error: { code: 'OTHER' } })).toBeFalse();
    expect(isEmailAlreadyRegistered({ status: 0, error: 'timeout' })).toBeFalse();
    expect(isEmailAlreadyRegistered(null)).toBeFalse();
    expect(isEmailAlreadyRegistered(undefined)).toBeFalse();
    expect(isEmailAlreadyRegistered('boom')).toBeFalse();
  });
});
