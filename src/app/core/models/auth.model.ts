export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
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
