import { TranslateService } from '@ngx-translate/core';

import { getPhoneLoginErrorMessage, getPhoneWorkflowErrorMessage } from './phone-auth-errors';

describe('phone-auth-errors', () => {
  // instant() returns the key itself, which is enough to tell messages apart.
  const translate = { instant: (key: string) => key } as unknown as TranslateService;

  describe('getPhoneLoginErrorMessage', () => {
    it('keeps wrong password / unknown number / locked account on one phone-specific message', () => {
      expect(getPhoneLoginErrorMessage(translate, { status: 400, error: { code: 'PHONE_AUTH_FAILED' } }))
        .toBe('AUTH.ERRORS.PHONE_INVALID_CREDENTIALS');
    });

    it('does not present a rate limit, a network failure or a server error as bad credentials', () => {
      expect(getPhoneLoginErrorMessage(translate, { status: 429 })).toBe('AUTH.ERRORS.RATE_LIMITED');
      expect(getPhoneLoginErrorMessage(translate, { status: 0 })).toBe('AUTH.ERRORS.NETWORK_ERROR');
      expect(getPhoneLoginErrorMessage(translate, { status: 503 })).toBe('AUTH.ERRORS.SERVER_ERROR');
    });

    it('reports a blocked account and a forbidden request distinctly', () => {
      expect(getPhoneLoginErrorMessage(translate, { status: 400, error: { code: 'ACCOUNT_UNAVAILABLE' } }))
        .toBe('AUTH.ERRORS.ACCOUNT_UNAVAILABLE');
      expect(getPhoneLoginErrorMessage(translate, { status: 403, error: { code: 'CSRF_VALIDATION_FAILED' } }))
        .toBe('API_ERRORS.FORBIDDEN');
    });

    it('falls back to the phone-specific credentials message for anything else', () => {
      expect(getPhoneLoginErrorMessage(translate, undefined)).toBe('AUTH.ERRORS.PHONE_INVALID_CREDENTIALS');
      expect(getPhoneLoginErrorMessage(translate, { status: 401 })).toBe('AUTH.ERRORS.PHONE_INVALID_CREDENTIALS');
    });
  });

  describe('getPhoneWorkflowErrorMessage', () => {
    it('maps the password-rule and account codes to their translation keys', () => {
      expect(getPhoneWorkflowErrorMessage(translate, 'PASSWORD_POLICY_FAILED', 'FALLBACK')).toBe('AUTH.ERRORS.PASSWORD_POLICY_FAILED');
      expect(getPhoneWorkflowErrorMessage(translate, 'ACCOUNT_UNAVAILABLE', 'FALLBACK')).toBe('AUTH.ERRORS.ACCOUNT_UNAVAILABLE');
      expect(getPhoneWorkflowErrorMessage(translate, 'OTP_WRONG', 'FALLBACK')).toBe('AUTH.ERRORS.OTP_WRONG');
    });

    it('falls back to the server message, then to the fallback key', () => {
      expect(getPhoneWorkflowErrorMessage(translate, 'UNKNOWN', 'FALLBACK', { error: { message: 'server says' } })).toBe('server says');
      expect(getPhoneWorkflowErrorMessage(translate, undefined, 'FALLBACK')).toBe('FALLBACK');
    });
  });
});
