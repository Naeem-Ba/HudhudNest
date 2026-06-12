import { Injectable } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { BackendApiService } from './backend-api.service';
import { TokenStorageService } from './token-storage.service';
import {
  AuthTokenResponse,
  ForgotPasswordRequest,
  LoginRequest,
  RegisterRequest,
  RegisterResponse,
  ResetPasswordRequest
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
    return this.api
      .post<AuthTokenResponse>('/auth/login', request)
      .pipe(tap(response => this.tokenStorage.storeTokens(response)));
  }

  refreshToken(): Observable<AuthTokenResponse> {
    const refreshToken = this.tokenStorage.getRefreshToken();

    return this.api
      .post<AuthTokenResponse>('/auth/refresh', { refreshToken })
      .pipe(tap(response => this.tokenStorage.storeTokens(response)));
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
