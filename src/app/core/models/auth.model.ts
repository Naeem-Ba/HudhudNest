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

export interface SendOtpRequest {
  phoneNumber?: string;
  email?: string;
  purpose?: string;
  firstName?: string;
  lastName?: string;
}

export interface SendOtpResponse {
  message?: string;
  expiresAt?: string;
  expiresInSeconds?: number;
}

export interface VerifyOtpRequest {
  phoneNumber?: string;
  email?: string;
  code: string;
  purpose?: string;
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