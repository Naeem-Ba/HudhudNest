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

export interface SendOtpRequest {
  phoneNumber: string;
}

export interface SendOtpResponse {
  success?: boolean;
  message?: string;
  expiresInSeconds?: number;
}

export interface VerifyOtpRequest {
  phoneNumber: string;
  code: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  email: string;
  token: string;
  newPassword: string;
}
