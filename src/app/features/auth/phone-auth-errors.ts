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
  OTP_INVALID: 'AUTH.ERRORS.OTP_INVALID',
  PASSWORD_POLICY_FAILED: 'AUTH.ERRORS.PASSWORD_POLICY_FAILED',
  USER_CREATE_FAILED: 'AUTH.ERRORS.PHONE_AUTH_FAILED',
  ROLE_ASSIGNMENT_FAILED: 'AUTH.ERRORS.PHONE_AUTH_FAILED',
  PHONE_REVERIFICATION_REQUIRED: 'AUTH.ERRORS.PHONE_REVERIFICATION_REQUIRED',
  PHONE_REVERIFICATION_NOT_CONFIGURED: 'AUTH.ERRORS.PHONE_REVERIFICATION_NOT_CONFIGURED',
  RECENT_AUTHENTICATION_REQUIRED: 'AUTH.ERRORS.RECENT_AUTHENTICATION_REQUIRED',
  PASSWORD_RESET_INVALID: 'AUTH.ERRORS.PASSWORD_RESET_INVALID',
  RATE_LIMITED: 'AUTH.ERRORS.OTP_RATE_LIMITED'
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
