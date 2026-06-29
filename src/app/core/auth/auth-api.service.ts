import { Injectable } from '@angular/core';
import { catchError, finalize, map, Observable, of, tap } from 'rxjs';

import { BackendApiService } from '../api/backend-api.service';
import { TokenStorageService } from '../services/token-storage.service';
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
  constructor(
    private readonly api: BackendApiService,
    private readonly tokenStorage: TokenStorageService
  ) {}

  register(request: RegisterRequest): Observable<RegisterResponse> {
    return this.api.post<RegisterResponse>('/auth/register', request);
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

  refreshToken(): Observable<AuthTokenResponse> {
    const refreshToken = this.tokenStorage.getRefreshToken();

    return this.api.post<unknown>('/auth/refresh', { refreshToken }).pipe(
      map(response => normalizeAuthTokenResponse(response)),
      tap(response => this.tokenStorage.storeTokens(response, this.tokenStorage.isRemembered()))
    );
  }

  forgotPassword(request: ForgotPasswordRequest): Observable<unknown> {
    return this.api.post('/auth/forgot-password', request);
  }

  resetPassword(request: ResetPasswordRequest): Observable<unknown> {
    return this.api.post('/auth/reset-password', request);
  }

  logout(): Observable<void> {
    const refreshToken = this.tokenStorage.getRefreshToken();

    if (!refreshToken) {
      this.tokenStorage.clear();
      return of(void 0);
    }

    return this.api.post<void>('/auth/logout', { refreshToken }).pipe(
      catchError(() => of(void 0)),
      finalize(() => this.tokenStorage.clear()),
      map(() => void 0)
    );
  }

  /** @deprecated Use logout() so the backend refresh token is invalidated. */
  logoutLocal(): void {
    this.tokenStorage.clear();
  }
}