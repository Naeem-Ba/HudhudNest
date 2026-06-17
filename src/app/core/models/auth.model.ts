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
    phoneNumber: asString(raw['phoneNumber']) ?? asString(raw['PhoneNumber']) ?? asString(raw['phone']) ?? asString(raw['Phone']),
    roles: asStringArray(raw['roles'] ?? raw['Roles'] ?? raw['role'] ?? raw['Role'])
  };
}
