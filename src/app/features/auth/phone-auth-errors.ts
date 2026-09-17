import { TranslateService } from '@ngx-translate/core';

/** نفس النمط المستخدم في LoginComponent للتحقق من رقم الهاتف بصيغة E.164. */
export const PHONE_E164_PATTERN = /^\+[1-9]\d{7,14}$/;

/**
 * تعيين أكواد الأخطاء الموثّقة في
 * docs/phone-password-authentication-and-reverification.md (قسم "Error codes")
 * إلى مفاتيح ترجمة AUTH.ERRORS.*
 */
const ERROR_CODE_TO_KEY: Record<string, string> = {
  PHONE_ALREADY_REGISTERED: 'AUTH.ERRORS.PHONE_ALREADY_REGISTERED',
  PHONE_AUTH_FAILED: 'AUTH.ERRORS.PHONE_AUTH_FAILED',
  PHONE_NUMBER_INVALID: 'AUTH.ERRORS.PHONE_INVALID',
  PHONE_NUMBER_ALREADY_IN_USE: 'AUTH.ERRORS.PHONE_ALREADY_REGISTERED',
  PASSWORD_POLICY_FAILED: 'AUTH.ERRORS.PASSWORD_POLICY_FAILED',
  USER_CREATE_FAILED: 'AUTH.ERRORS.PHONE_AUTH_FAILED',
  ROLE_ASSIGNMENT_FAILED: 'AUTH.ERRORS.PHONE_AUTH_FAILED',
  PHONE_REVERIFICATION_REQUIRED: 'AUTH.ERRORS.PHONE_REVERIFICATION_REQUIRED',
  PHONE_REVERIFICATION_NOT_CONFIGURED: 'AUTH.ERRORS.PHONE_REVERIFICATION_NOT_CONFIGURED',
  RECENT_AUTHENTICATION_REQUIRED: 'AUTH.ERRORS.RECENT_AUTHENTICATION_REQUIRED',
  RATE_LIMITED: 'AUTH.ERRORS.OTP_RATE_LIMITED',

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
  if (errorCode && ERROR_CODE_TO_KEY[errorCode]) {
    return translate.instant(ERROR_CODE_TO_KEY[errorCode]);
  }

  const response = httpError as { error?: { message?: string; Message?: string } } | undefined;
  const backendMessage = response?.error?.message ?? response?.error?.Message;

  return backendMessage || translate.instant(fallbackKey);
}
