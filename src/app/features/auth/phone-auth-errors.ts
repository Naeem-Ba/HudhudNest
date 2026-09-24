import { TranslateService } from '@ngx-translate/core';

export { PHONE_E164_PATTERN } from '../../core/auth/phone-number';

/**
 * تعيين أكواد الأخطاء الموثّقة في
 * docs/phone-password-authentication-and-reverification.md (قسم "Error codes")
 * إلى مفاتيح ترجمة AUTH.ERRORS.*
 */
const ERROR_CODE_TO_KEY: Record<string, string> = {
  PHONE_ALREADY_REGISTERED: 'AUTH.ERRORS.PHONE_ALREADY_REGISTERED',
  PHONE_AUTH_FAILED: 'AUTH.ERRORS.PHONE_AUTH_FAILED',
  ACCOUNT_UNAVAILABLE: 'AUTH.ERRORS.ACCOUNT_UNAVAILABLE',
  PHONE_NUMBER_INVALID: 'AUTH.ERRORS.PHONE_INVALID',
  PHONE_COUNTRY_NOT_SUPPORTED: 'AUTH.ERRORS.PHONE_COUNTRY_NOT_SUPPORTED',
  PHONE_NUMBER_ALREADY_IN_USE: 'AUTH.ERRORS.PHONE_ALREADY_REGISTERED',
  PASSWORD_POLICY_FAILED: 'AUTH.ERRORS.PASSWORD_POLICY_FAILED',
  USER_CREATE_FAILED: 'AUTH.ERRORS.PHONE_AUTH_FAILED',
  ROLE_ASSIGNMENT_FAILED: 'AUTH.ERRORS.PHONE_AUTH_FAILED',
  PHONE_REVERIFICATION_REQUIRED: 'AUTH.ERRORS.PHONE_REVERIFICATION_REQUIRED',
  PHONE_REVERIFICATION_NOT_CONFIGURED: 'AUTH.ERRORS.PHONE_REVERIFICATION_NOT_CONFIGURED',
  RECENT_AUTHENTICATION_REQUIRED: 'AUTH.ERRORS.RECENT_AUTHENTICATION_REQUIRED',
  RATE_LIMITED: 'AUTH.ERRORS.OTP_RATE_LIMITED',
  // The SMS provider refused or did not answer in time (send-otp); fell back to a generic message before.
  SMS_FAILED: 'AUTH.ERRORS.OTP_SMS_FAILED',

  // Verify-time OTP outcomes (registration / reverification / phone-number-change) — the
  // backend used to collapse wrong/expired/already-used/too-many-attempts into one generic
  // OTP_INVALID (PhoneAuthenticationWorkflow.ValidateAndReserveAsync). It now reports the
  // real reason; NotFound and the rare concurrent-reservation race stay generic OTP_INVALID
  // on purpose (see the backend's own comment) since those aren't a legitimate user's error.
  OTP_INVALID: 'AUTH.ERRORS.OTP_INVALID',
  OTP_WRONG: 'AUTH.ERRORS.OTP_WRONG',
  OTP_EXPIRED: 'AUTH.ERRORS.OTP_EXPIRED',
  OTP_ALREADY_USED: 'AUTH.ERRORS.OTP_ALREADY_USED',
  OTP_RATE_LIMITED: 'AUTH.ERRORS.OTP_TOO_MANY_ATTEMPTS',

  // Same distinction for password-reset/verify. PASSWORD_RESET_INVALID keeps its original
  // meaning (wrong code / not found) for backward compatibility — the other three are new,
  // additive codes.
  PASSWORD_RESET_INVALID: 'AUTH.ERRORS.PASSWORD_RESET_INVALID',
  PASSWORD_RESET_EXPIRED: 'AUTH.ERRORS.PASSWORD_RESET_EXPIRED',
  PASSWORD_RESET_ALREADY_USED: 'AUTH.ERRORS.PASSWORD_RESET_ALREADY_USED',
  PASSWORD_RESET_RATE_LIMITED: 'AUTH.ERRORS.OTP_TOO_MANY_ATTEMPTS'
};

/**
 * يحوّل كود خطأ (من الاستجابة الموحّدة PhoneWorkflowResult أو من HTTP error)
 * إلى رسالة مترجَمة جاهزة للعرض في toast/alert. يسقط إلى رسالة الباك
 * الحرة إن وُجدت، ثم إلى fallbackKey.
 */
export function getPhoneWorkflowErrorMessage(
  translate: TranslateService,
  errorCode: string | null | undefined,
  fallbackKey: string,
  httpError?: unknown
): string {
  const key = errorCode ? ERROR_CODE_TO_KEY[errorCode] : undefined;
  if (key) {
    return translate.instant(key);
  }

  const response = httpError as { error?: { message?: string; Message?: string } } | undefined;
  const backendMessage = response?.error?.message ?? response?.error?.Message;

  return backendMessage || translate.instant(fallbackKey);
}

/**
 * Message for a failed phone + password login. Lockout and unknown numbers must stay
 * indistinguishable from a wrong password (all arrive as a 400 PHONE_AUTH_FAILED), but a rate
 * limit, a network failure, a server error or a blocked account are different situations the
 * person can act on, so they no longer read as "incorrect credentials".
 */
export function getPhoneLoginErrorMessage(translate: TranslateService, error: unknown): string {
  const response = error as { status?: number; error?: { code?: string; Code?: string } } | undefined;
  const status = response?.status;
  const code = response?.error?.code ?? response?.error?.Code;

  if (status === 0) {
    return translate.instant('AUTH.ERRORS.NETWORK_ERROR');
  }
  if (status === 429) {
    return translate.instant('AUTH.ERRORS.RATE_LIMITED');
  }
  if (typeof status === 'number' && status >= 500) {
    return translate.instant('AUTH.ERRORS.SERVER_ERROR');
  }
  if (code === 'ACCOUNT_UNAVAILABLE') {
    return translate.instant('AUTH.ERRORS.ACCOUNT_UNAVAILABLE');
  }
  if (status === 403) {
    return translate.instant('API_ERRORS.FORBIDDEN');
  }
  return translate.instant('AUTH.ERRORS.PHONE_INVALID_CREDENTIALS');
}
