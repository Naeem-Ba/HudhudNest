import { Injectable } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { BackendApiService } from './backend-api.service';
import { TokenStorageService } from './token-storage.service';
import {
  AuthTokenResponse,
  ForgotPasswordRequest,
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

  refreshToken(): Observable<AuthTokenResponse> {
    const refreshToken = this.tokenStorage.getRefreshToken();

    return this.api.post<unknown>('/auth/refresh', { refreshToken }).pipe(
      map(response => normalizeAuthTokenResponse(response)),
      tap(response => this.tokenStorage.storeTokens(response))
    );
  }

  forgotPassword(request: ForgotPasswordRequest): Observable<unknown> {
    return this.api.post('/auth/forgot-password', request);
  }

  resetPassword(request: ResetPasswordRequest): Observable<unknown> {
    return this.api.post('/auth/reset-password', request);
  }

  logoutLocal(): void {
    this.tokenStorage.clear();
  }
}
