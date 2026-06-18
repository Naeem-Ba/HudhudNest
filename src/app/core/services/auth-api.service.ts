// src/app/core/services/auth-api.service.ts
//
// ❌ المشكلة:
//   logoutLocal() كانت تمسح التوكنات محلياً فقط ولا ترسل طلب للـ Backend.
//   النتيجة: الـ refreshToken لا يُبطَل من جهة الـ Backend.
//   المخاطر: شخص يمتلك الـ refreshToken المسروق يستطيع استخدامه حتى انتهاء صلاحيته.
//
// ✅ الإصلاح: إضافة دالة logout() تستدعي POST /api/Auth/logout
//   ثم تمسح التوكنات المحلية بغض النظر عن نتيجة الطلب.

import { Injectable } from '@angular/core';
import { Observable, map, tap, catchError, of, finalize } from 'rxjs';
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

  // =========================================================================
  // ✅ الإصلاح: logout() يستدعي الـ Backend لإبطال refreshToken
  //
  // لماذا مهم؟
  //   مسح التوكن محلياً فقط لا يكفي. الـ refreshToken المخزّن في الـ Backend
  //   يبقى صالحاً حتى تنتهي صلاحيته أو يُبطَل. إذا سُرق الـ refreshToken
  //   قبل تسجيل الخروج، يستطيع المهاجم استخدامه.
  //
  // API spec: POST /api/Auth/logout
  //   Request: { RefreshToken: "..." }
  //   Response: 204 No Content
  //
  // نمسح التوكنات المحلية دائماً (finalize) بغض النظر عن نجاح الطلب.
  // =========================================================================
  logout(): Observable<void> {
    const refreshToken = this.tokenStorage.getRefreshToken();

    return this.api.post<void>('/auth/logout', { RefreshToken: refreshToken }).pipe(
      catchError(() => of(undefined)),    // تجاهل خطأ الشبكة — نسجّل الخروج على أي حال
      finalize(() => this.tokenStorage.clear())   // ✅ امسح محلياً دائماً
    );
  }

  /**
   * @deprecated استخدم logout() بدلاً من هذا. هذه الدالة باقية للتوافق الخلفي فقط.
   */
  logoutLocal(): void {
    this.tokenStorage.clear();
  }
}