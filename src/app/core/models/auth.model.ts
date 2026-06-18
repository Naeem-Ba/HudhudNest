// src/app/core/models/auth.model.ts
//
// ❌ المشاكل:
//   1. SendOtpRequest: كانت تفتقد حقل Purpose
//      API spec: { PhoneNumber, Purpose: "PhoneRegistration" | "PhoneLogin" | ... }
//   2. VerifyOtpRequest: كانت تفتقد Purpose, FirstName, LastName
//      API spec: { PhoneNumber, Code, Purpose, FirstName, LastName }
//   3. SendOtpResponse: كانت تحتوي { success, message } لكن الـ API يرجع { Message, ExpiresInSeconds }
//   4. ResetPasswordRequest: كانت تفتقد ConfirmPassword
//      API spec: { Email, Token, NewPassword, ConfirmPassword }
//
// ✅ الإصلاح: مطابقة كاملة مع مواصفات الـ API (قسم 2.7 و 2.6).

export interface User {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  phoneNumber?: string;
  profileImageUrl?: string;
  preferredLanguage?: string;
  preferredCurrency?: string;
  countryCode?: string;
  emailConfirmed?: boolean;
  roles?: string[];
}

export interface RegisterRequest {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phoneNumber?: string;
  countryCode?: string;
  preferredLanguage?: string;
}

export interface RegisterResponse {
  message?: string;
  userId?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthTokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  expiresIn?: number;
  userId?: string;
  email?: string;
  phoneNumber?: string;
  roles?: string[];
}

// ✅ Purpose values من الـ API spec (قسم 2.7)
export type OtpPurpose =
  | 'PhoneRegistration'
  | 'PhoneLogin'
  | 'AddPhoneToAccount'
  | 'ChangePhone';

// ✅ إصلاح: أضفنا Purpose
export interface SendOtpRequest {
  phoneNumber: string;
  purpose?: OtpPurpose;
}

// ✅ إصلاح: مطابقة الاستجابة الفعلية من الـ API
// API يرجع: { Message: "...", ExpiresInSeconds: 300 }
// (أو code: "RATE_LIMITED" في حالة الخطأ)
export interface SendOtpResponse {
  message?: string;
  Message?: string;                // PascalCase من الـ Backend
  expiresInSeconds?: number;
  ExpiresInSeconds?: number;       // PascalCase من الـ Backend
  code?: string;                   // في حالة الخطأ: "RATE_LIMITED"
  Code?: string;
}

// ✅ إصلاح: أضفنا purpose, firstName, lastName — مطلوبة لـ Registration flow
export interface VerifyOtpRequest {
  phoneNumber: string;
  code: string;
  purpose?: OtpPurpose;
  firstName?: string;              // مطلوب عند تسجيل مستخدم جديد
  lastName?: string;               // مطلوب عند تسجيل مستخدم جديد
}

// ✅ استجابة التحقق من OTP (قسم 2.7 من المواصفات)
export interface VerifyOtpResponse {
  IsNewUser?: boolean;
  isNewUser?: boolean;
  AccessToken?: string;
  accessToken?: string;
  RefreshToken?: string;
  refreshToken?: string;
  ExpiresAt?: string;
  expiresAt?: string;
  User?: {
    Id?: string;
    id?: string;
    PhoneNumber?: string;
    phoneNumber?: string;
    Email?: string | null;
    email?: string | null;
    DisplayName?: string;
    displayName?: string;
    HasEmail?: boolean;
    hasEmail?: boolean;
    HasPassword?: boolean;
    hasPassword?: boolean;
    EmailVerified?: boolean;
    emailVerified?: boolean;
  };
}

export interface ForgotPasswordRequest {
  email: string;
}

// ✅ إصلاح: أضفنا confirmPassword — مطلوب من الـ API
export interface ResetPasswordRequest {
  email: string;
  token: string;
  newPassword: string;
  confirmPassword: string;         // ✅ مطلوب في API spec
}

// ──────────────────────────────────────────────────────────────────────────────
// Normalization helpers
// ──────────────────────────────────────────────────────────────────────────────

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    return [value];
  }
  return undefined;
}

// يقرأ AccessToken/accessToken/token/Token من أي شكل استجابة
export function normalizeAuthTokenResponse(response: unknown): AuthTokenResponse {
  const raw = (response ?? {}) as Record<string, unknown>;
  const accessToken =
    asString(raw['accessToken']) ??
    asString(raw['AccessToken']) ??
    asString(raw['token']) ??
    asString(raw['Token']) ??
    '';

  return {
    accessToken,
    refreshToken: asString(raw['refreshToken']) ?? asString(raw['RefreshToken']),
    expiresAt: asString(raw['expiresAt']) ?? asString(raw['ExpiresAt']),
    expiresIn: asNumber(raw['expiresIn'] ?? raw['ExpiresIn']),
    userId: asString(raw['userId']) ?? asString(raw['UserId']),
    email: asString(raw['email']) ?? asString(raw['Email']),
    phoneNumber:
      asString(raw['phoneNumber']) ?? asString(raw['PhoneNumber']) ??
      asString(raw['phone']) ?? asString(raw['Phone']),
    roles: asStringArray(raw['roles'] ?? raw['Roles'] ?? raw['role'] ?? raw['Role'])
  };
}