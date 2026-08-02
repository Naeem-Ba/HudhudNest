import { Injectable } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { BackendApiService } from '../api/backend-api.service';
import { TokenStorageService } from '../services/token-storage.service';
import { AuthTokenResponse, PhoneLoginRequest, normalizeAuthTokenResponse } from '../models/auth.model';

/**
 * تسجيل الدخول برقم الهاتف + كلمة السر — بدون OTP.
 * يفترض نقطة نهاية جديدة على الباك: POST /auth/phone/login
 * (راجع phone-auth-backend-design.md لتفاصيل التصميم المقترح).
 */
@Injectable({ providedIn: 'root' })
export class PhoneAuthApiService {
  constructor(
    private readonly api: BackendApiService,
    private readonly tokenStorage: TokenStorageService
  ) {}

  login(request: PhoneLoginRequest): Observable<AuthTokenResponse> {
    const payload: PhoneLoginRequest = {
      phoneNumber: request.phoneNumber.trim(),
      password: request.password
    };

    return this.api.post<unknown>('/auth/phone/login', payload).pipe(
      map(response => normalizeAuthTokenResponse(response)),
      tap(response => this.tokenStorage.storeTokens(response))
    );
  }
}
