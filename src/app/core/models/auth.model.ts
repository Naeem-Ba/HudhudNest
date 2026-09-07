export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  // اختيارية إضافياً فقط — انظر docs/privacy/privacy-gaps.md (P1) في مستودع الـ backend.
  // تُرسَل فقط عندما يضع المستخدم فعلاً علامة على مربّع الموافقة غير المحدَّد مسبقاً.
  privacyPolicyAccepted?: boolean;
  privacyPolicyVersion?: string;
  consentSource?: string;
}

export interface RegisterResponse {
  message: string;
  userId: string;
}

export interface AuthTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  email: string;
  token: string;
  newPassword: string;
  confirmPassword: string;
}

export interface GoogleLoginRequest {
  idToken: string;
}

export interface AppleLoginRequest {
  identityToken: string;
  authorizationCode?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  /** Raw (unhashed) nonce passed to AppleID.auth.init — see B-16 in RELEASE-BLOCKERS-AR.md. */
  nonce?: string | null;
}

export enum OtpPurpose {
  PhoneRegistration = 'PhoneRegistration',
  /** @deprecated لم يعد يُستخدم — الدخول أصبح برقم الهاتف + كلمة السر عبر PhoneLoginRequest بدل OTP في كل مرة. */
  PhoneLogin = 'PhoneLogin',
  AddPhoneToAccount = 'AddPhoneToAccount',
  ChangePhone = 'ChangePhone'
}

/**
 * ملاحظة توحيد (تم دمج تصريحين مكرَّرين بنفس الاسم كانا يسبّبان
 * TS2687/TS2717 عند البناء). phoneNumber/code إلزاميان لأن تدفق
 * الهاتف في LoginComponent يرسلهما دائماً؛ email/firstName/lastName
 * اختياريان للحفاظ على أي استخدام آخر (OTP عبر البريد أو تسجيل
 * مستخدم جديد) كان يعتمد على الشكل العام الأقدم.
 */
export interface SendOtpRequest {
  phoneNumber: string;
  email?: string;
  purpose?: OtpPurpose;
  firstName?: string;
  lastName?: string;
}

export interface SendOtpResponse {
  message: string;
  expiresAt?: string;
  expiresInSeconds: number;
}

/**
 * password أصبح مطلوبًا فعليًا (على مستوى منطق العميل) عندما
 * purpose = PhoneRegistration، لأن /auth/phone/verify أصبح ينشئ
 * الحساب مباشرة بكلمة سر في نفس الطلب بدل تدفّق OTP-only السابق.
 * يبقى اختياريًا في التوقيع لأن AddPhoneToAccount/ChangePhone (خارج
 * نطاق هذا التغيير) لا يحتاجان كلمة سر.
 */
export interface VerifyOtpRequest {
  phoneNumber: string;
  email?: string;
  code: string;
  password?: string;
  purpose?: OtpPurpose;
  firstName?: string;
  lastName?: string;
}

export interface VerifyOtpResponse {
  message?: string;
  verified?: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
}

/** تسجيل الدخول برقم الهاتف + كلمة السر (بدون OTP) — راجع PhoneAuthApiService. */
export interface PhoneLoginRequest {
  phoneNumber: string;
  password: string;
}

/**
 * التدفق الموازي الكامل عبر PhonePasswordAuthController (api/auth/phone/...).
 * الاستجابة الموحّدة لكل الـ 10 نقاط نهاية هي PhoneWorkflowResult من الباك،
 * لذلك نُعرِّف نوعًا واحدًا يغطيها جميعًا بدل نوع لكل استدعاء.
 */
export enum PhoneVerificationState {
  NotConfigured = 'NotConfigured',
  Verified = 'Verified',
  DueSoon = 'DueSoon',
  GracePeriod = 'GracePeriod',
  Restricted = 'Restricted'
}

export interface PhoneWorkflowResponse {
  succeeded: boolean;
  errorCode?: string | null;
  message?: string | null;
  challengeId?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  accessTokenExpiresAtUtc?: string | null;
  /** يُستخدم فقط في password-reset/verify → يُمرَّر إلى password-reset/confirm. */
  confirmationToken?: string | null;
  verificationState?: PhoneVerificationState | null;
  dueAtUtc?: string | null;
  graceEndsAtUtc?: string | null;
}

/** تحويل دفاعي يقرأ PascalCase وcamelCase معًا (PhoneWorkflowResult من الباك). */
export function normalizePhoneWorkflowResult(response: unknown): PhoneWorkflowResponse {
  const value = (response ?? {}) as Record<string, unknown>;
  const read = (camel: string, pascal: string): unknown => value[camel] ?? value[pascal];

  return {
    succeeded: Boolean(read('succeeded', 'Succeeded')),
    errorCode: (read('errorCode', 'ErrorCode') as string) ?? null,
    message: (read('message', 'Message') as string) ?? null,
    challengeId: (read('challengeId', 'ChallengeId') as string) ?? null,
    accessToken: (read('accessToken', 'AccessToken') as string) ?? null,
    refreshToken: (read('refreshToken', 'RefreshToken') as string) ?? null,
    accessTokenExpiresAtUtc: (read('accessTokenExpiresAtUtc', 'AccessTokenExpiresAtUtc') as string) ?? null,
    confirmationToken: (read('confirmationToken', 'ConfirmationToken') as string) ?? null,
    verificationState: (read('verificationState', 'VerificationState') as PhoneVerificationState) ?? null,
    dueAtUtc: (read('dueAtUtc', 'DueAtUtc') as string) ?? null,
    graceEndsAtUtc: (read('graceEndsAtUtc', 'GraceEndsAtUtc') as string) ?? null
  };
}

/** أكواد الأخطاء الموثّقة في phone-password-authentication-and-reverification.md */
export const PHONE_WORKFLOW_ERROR_CODES = {
  PHONE_ALREADY_REGISTERED: 'PHONE_ALREADY_REGISTERED',
  PHONE_AUTH_FAILED: 'PHONE_AUTH_FAILED',
  PHONE_NUMBER_INVALID: 'PHONE_NUMBER_INVALID',
  PHONE_NUMBER_ALREADY_IN_USE: 'PHONE_NUMBER_ALREADY_IN_USE',
  OTP_INVALID: 'OTP_INVALID',
  PASSWORD_POLICY_FAILED: 'PASSWORD_POLICY_FAILED',
  USER_CREATE_FAILED: 'USER_CREATE_FAILED',
  ROLE_ASSIGNMENT_FAILED: 'ROLE_ASSIGNMENT_FAILED',
  PHONE_REVERIFICATION_REQUIRED: 'PHONE_REVERIFICATION_REQUIRED',
  PHONE_REVERIFICATION_NOT_CONFIGURED: 'PHONE_REVERIFICATION_NOT_CONFIGURED',
  RECENT_AUTHENTICATION_REQUIRED: 'RECENT_AUTHENTICATION_REQUIRED',
  PASSWORD_RESET_INVALID: 'PASSWORD_RESET_INVALID'
} as const;

/**
 * أكواد أخطاء /auth/login — مطابقة حرفياً لـ LoginErrorCodes في الباك
 * (PropertyApi.Application/Auth/Models/LoginResponseDto.cs). أي تعديل هنا
 * يجب أن يقابله تعديل هناك، ويحرسه LoginResponseContractTests.
 */
export const LOGIN_ERROR_CODES = {
  INVALID_REQUEST: 'INVALID_REQUEST',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  RATE_LIMITED: 'RATE_LIMITED',
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  PASSWORD_CHANGE_REQUIRED: 'PASSWORD_CHANGE_REQUIRED',
  SERVER_ERROR: 'SERVER_ERROR'
} as const;

export type LoginErrorCode = (typeof LOGIN_ERROR_CODES)[keyof typeof LOGIN_ERROR_CODES];

/**
 * جسم استجابة /auth/login عند الفشل (401 / 423 / 429 / 403 / 500).
 * مسار النجاح يبقى AuthTokenResponse عبر normalizeAuthTokenResponse، لأن
 * حقول التوكن ما زالت في جذر نفس الجسم.
 */
export interface LoginFailure {
  /** رمز HTTP الفعلي من الشبكة — هو المرجع، وليس statusCode داخل الجسم. */
  status: number;
  errorCode: LoginErrorCode | null;
  /** نص من الخادم بالإنجليزية — للتشخيص فقط. لا تعرضه للمستخدم؛ استخدم مفاتيح i18n. */
  serverMessage: string | null;
  failedAttemptCount: number | null;
  remainingAttemptsBeforeLockout: number | null;
  isAccountLocked: boolean;
  /**
   * لحظة فك القفل بصيغة ISO. مُفضَّلة على lockoutMinutesRemaining لأن الأخيرة
   * تُحسب لحظة التسلسل وتصبح قديمة فوراً.
   */
  lockoutEndTimeUtc: string | null;
  passwordResetUrl: string | null;
}

/** الدقائق المتبقية حتى فك القفل، محسوبة من الطابع الزمني المطلق. */
export function lockoutMinutesRemaining(failure: LoginFailure, now: Date = new Date()): number {
  if (!failure.lockoutEndTimeUtc) {
    return 0;
  }

  const unlockAt = new Date(failure.lockoutEndTimeUtc).getTime();
  if (Number.isNaN(unlockAt)) {
    return 0;
  }

  return Math.max(0, Math.ceil((unlockAt - now.getTime()) / 60_000));
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * يقرأ خطأ HttpClient ويستخرج عقد الفشل. دفاعي عمداً: أي حقل مفقود يصبح null
 * بدل أن يرمي، حتى يبقى تسجيل الدخول قابلاً للاستخدام لو تغيّر الجسم أو جاء
 * الخطأ من طبقة شبكة (بدون جسم أصلاً).
 */
export function parseLoginFailure(error: unknown): LoginFailure {
  const httpError = (error ?? {}) as { status?: unknown; error?: unknown };
  const status = readNumber(httpError.status) ?? 0;
  const body = (httpError.error ?? {}) as Record<string, unknown>;

  const errorCode = typeof body['errorCode'] === 'string' ? body['errorCode'] : null;

  return {
    status,
    errorCode: (errorCode as LoginErrorCode | null) ?? inferErrorCodeFromStatus(status),
    serverMessage: typeof body['message'] === 'string' ? body['message'] : null,
    failedAttemptCount: readNumber(body['failedAttemptCount']),
    remainingAttemptsBeforeLockout: readNumber(body['remainingAttemptsBeforeLockout']),
    isAccountLocked: body['isAccountLocked'] === true || status === 423,
    lockoutEndTimeUtc:
      typeof body['lockoutEndTimeUtc'] === 'string' ? body['lockoutEndTimeUtc'] : null,
    passwordResetUrl:
      typeof body['passwordResetUrl'] === 'string' ? body['passwordResetUrl'] : null
  };
}

/** احتياط لو وصل رد بلا errorCode (وسيط، أو نسخة باك أقدم). */
function inferErrorCodeFromStatus(status: number): LoginErrorCode | null {
  switch (status) {
    case 401:
      return LOGIN_ERROR_CODES.INVALID_CREDENTIALS;
    case 423:
      return LOGIN_ERROR_CODES.ACCOUNT_LOCKED;
    case 429:
      return LOGIN_ERROR_CODES.RATE_LIMITED;
    case 500:
      return LOGIN_ERROR_CODES.SERVER_ERROR;
    default:
      return null;
  }
}

export function normalizeAuthTokenResponse(response: unknown): AuthTokenResponse {
  const value = response as Partial<AuthTokenResponse> & {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  return {
    accessToken: value.accessToken ?? value.access_token ?? '',
    refreshToken: value.refreshToken ?? value.refresh_token ?? '',
    expiresIn: value.expiresIn ?? value.expires_in ?? 0
  };
}

export interface PhoneAuthUser {
  id: string;
  phoneNumber: string;
  email: string | null;
  displayName: string | null;
  hasEmail: boolean;
  hasPassword: boolean;
  emailVerified: boolean;
}

export interface PhoneAuthResponse {
  isNewUser: boolean;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  user: PhoneAuthUser;
}

/** أكواد خطأ من PhoneAuthController — تُستخدم للتمييز البرمجي، ليس النص الحر */
export const OTP_ERROR_CODES = {
  RATE_LIMITED: 'RATE_LIMITED',
  SMS_FAILED: 'SMS_FAILED',
  OTP_STORE_FAILED: 'OTP_STORE_FAILED',
  OTP_NOT_FOUND: 'OTP_NOT_FOUND',
  OTP_INVALID: 'OTP_INVALID',
  OTP_WRONG: 'OTP_WRONG',
  OTP_ALREADY_USED: 'OTP_ALREADY_USED',
  PROFILE_NAME_REQUIRED: 'PROFILE_NAME_REQUIRED', // غير مستخدَم عمليًا بعد الآن — الاسم إلزامي دائمًا من العميل
  ROLE_ASSIGNMENT_FAILED: 'ROLE_ASSIGNMENT_FAILED',
  USER_CREATE_FAILED: 'USER_CREATE_FAILED',
  PHONE_AUTH_FAILED: 'PHONE_AUTH_FAILED',
  PHONE_ALREADY_REGISTERED: 'PHONE_ALREADY_REGISTERED' // NEW — يتطلب تعديل الباك المقترح
} as const;
