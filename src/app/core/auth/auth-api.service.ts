import { Injectable, inject } from '@angular/core';
import { catchError, finalize, map, Observable, of, tap } from 'rxjs';

import { BackendApiService } from '../api/backend-api.service';
import { withUiLanguage } from '../i18n/ui-language';
import { TokenStorageService } from '../services/token-storage.service';
import { AttributionContextService } from '../sharing/attribution-context.service';
import { ReferralCodeService } from '../sharing/referral-code.service';
import {
  AppleLoginRequest,
  AuthTokenResponse,
  ForgotPasswordRequest,
  GoogleLoginRequest,
  LoginRequest,
  RegisterRequest,
  RegisterResponse,
  ResetPasswordRequest,
  normalizeAuthTokenResponse
} from '../models/auth.model';

@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly attribution = inject(AttributionContextService);
  private readonly referralCode = inject(ReferralCodeService);

  constructor(
    private readonly api: BackendApiService,
    private readonly tokenStorage: TokenStorageService
  ) {}

  register(request: RegisterRequest): Observable<RegisterResponse> {
    return this.api.post<RegisterResponse>('/auth/register', withUiLanguage(this.withAcquisition(request)));
  }

  login(request: LoginRequest): Observable<AuthTokenResponse> {
    return this.api.post<unknown>('/auth/login', request).pipe(
      map(response => normalizeAuthTokenResponse(response)),
      tap(response => this.tokenStorage.storeTokens(response))
    );
  }

  loginWithGoogle(request: GoogleLoginRequest): Observable<AuthTokenResponse> {
    return this.api.post<unknown>('/auth/social/google', request).pipe(
      map(response => normalizeAuthTokenResponse(response)),
      tap(response => this.tokenStorage.storeTokens(response))
    );
  }

  loginWithApple(request: AppleLoginRequest): Observable<AuthTokenResponse> {
    return this.api.post<unknown>('/auth/social/apple', request).pipe(
      map(response => normalizeAuthTokenResponse(response)),
      tap(response => this.tokenStorage.storeTokens(response))
    );
  }

  /**
   * RELEASE-BLOCKERS-AR.md B-13: no body value to send any more — the refresh_token cookie
   * (see BackendApiService's withCredentials: true) carries the token invisibly to this code.
   */
  refreshToken(): Observable<AuthTokenResponse> {
    return this.api.post<unknown>('/auth/refresh', {}).pipe(
      map(response => normalizeAuthTokenResponse(response)),
      tap(response => this.tokenStorage.storeTokens(response))
    );
  }

  forgotPassword(request: ForgotPasswordRequest): Observable<unknown> {
    return this.api.post('/auth/forgot-password', withUiLanguage(request));
  }

  /**
   * B-15 (RELEASE-BLOCKERS-AR.md): resends the email-confirmation link. Anonymous,
   * rate-limited, and answers with the exact same message whether the address is unknown,
   * already confirmed, or a link was just sent — callers must show `message` verbatim and
   * never branch UI copy on the outcome, or the anti-enumeration guarantee the backend
   * built breaks on this side instead. The page language goes along, so the mail comes in it.
   */
  resendConfirmationEmail(email: string): Observable<{ message: string }> {
    return this.api.post<{ message: string }>(
      '/auth/email/resend-confirmation',
      withUiLanguage({ email: email.trim().toLowerCase() })
    );
  }

  resetPassword(request: ResetPasswordRequest): Observable<unknown> {
    return this.api.post('/auth/reset-password', request);
  }

  /**
   * RELEASE-BLOCKERS-AR.md B-13: always calls the backend now — there is no stored token
   * left to gate on client-side, and the whole point of a real logout is invalidating
   * whatever the refresh_token cookie currently holds server-side, not just clearing local
   * state. The backend clears the cookie itself once this call reaches it.
   */
  logout(): Observable<void> {
    return this.api.post<void>('/auth/logout', {}).pipe(
      catchError(() => of(void 0)),
      finalize(() => this.tokenStorage.clear()),
      map(() => void 0)
    );
  }

  /** @deprecated Use logout() so the backend refresh token is invalidated. */
  logoutLocal(): void {
    this.tokenStorage.clear();
  }

  /**
   * Growth engine P4: the first UTM touch kept by AttributionContextService (30-day window) goes with
   * the sign-up, so the API can count where new accounts come from. Nothing is added for a direct visit.
   */
  private withAcquisition(request: RegisterRequest): RegisterRequest {
    const referralCode = this.referralCode.current();
    if (referralCode) {
      request = { ...request, referralCode };
    }
    const first = this.attribution.getFirstTouchContext();
    if (!first?.source) {
      return request;
    }
    return {
      ...request,
      acquisitionSource: first.source,
      acquisitionMedium: first.medium || undefined,
      acquisitionCampaign: first.campaign || undefined
    };
  }
}
