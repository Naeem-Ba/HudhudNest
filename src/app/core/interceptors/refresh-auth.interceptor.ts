// =====================================================================
// 🔧 FIX — refresh-auth.interceptor.ts
//
// المشكلة الأصلية:
//   الاسم "RefreshAuthInterceptor" مُضلِّل — لم يكن يُجدِّد التوكن أبداً.
//   عند أي 401: كان يحذف التوكنات ويُحوِّل المستخدم لصفحة تسجيل الدخول.
//   النتيجة: المستخدم يُسجَّل خروجه عند كل تحديث للصفحة.
//
// الإصلاح:
//   1. عند الـ 401: نحاول استخدام refreshToken لطلب accessToken جديد.
//   2. عند النجاح: نُعيد الطلب الأصلي بالتوكن الجديد.
//   3. عند الفشل: نحذف التوكنات ونُحوِّل لصفحة الدخول.
//   4. إذا جاءت عدة طلبات بـ 401 في نفس الوقت: يُرسَل طلب refresh واحد فقط،
//      والبقية تنتظر نتيجته (عبر BehaviorSubject مشترك).
//
// المسار: src/app/core/interceptors/refresh-auth.interceptor.ts
// =====================================================================

import {
  HttpBackend,
  HttpClient,
  HttpErrorResponse,
  HttpInterceptorFn
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  BehaviorSubject,
  catchError,
  filter,
  switchMap,
  take,
  throwError
} from 'rxjs';
import { TokenStorageService, AuthTokenResponse } from '../services/token-storage.service';
import { environment } from '../../../environments/environment';

// ─── حالة الـ refresh المشتركة بين جميع الطلبات ──────────────────────────────
// هذه المتغيرات خارج الدالة حتى تُشارَك بين جميع استدعاءات الـ interceptor.
let isRefreshing = false;
const refreshCompleted$ = new BehaviorSubject<boolean>(false);

/**
 * هل هذا URL خاص بالمصادقة؟
 * نتجاهل أخطاء الـ 401 من هذه المسارات لتجنب الحلقة اللانهائية.
 */
function isAuthEndpoint(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes('/auth/login') ||
    lower.includes('/auth/register') ||
    lower.includes('/auth/refresh') ||
    lower.includes('/auth/phone/send-otp') ||
    lower.includes('/auth/phone/verify') ||
    lower.includes('/auth/forgot-password') ||
    lower.includes('/auth/reset-password')
  );
}

/** مسح التوكنات والتوجيه لصفحة الدخول */
function clearAndRedirect(tokenStorage: TokenStorageService, router: Router): void {
  isRefreshing = false;
  tokenStorage.clear();
  void router.navigateByUrl('/auth/login');
}

export const RefreshAuthInterceptor: HttpInterceptorFn = (req, next) => {
  const tokenStorage = inject(TokenStorageService);
  const router      = inject(Router);
  // ✅ HttpBackend يتجاوز جميع الـ interceptors — يمنع الحلقة اللانهائية
  const httpBackend = inject(HttpBackend);

  // ── إضافة Authorization header إذا كان التوكن موجوداً ───────────────────
  const accessToken = tokenStorage.getAccessToken();
  const authReq = accessToken && !req.headers.has('Authorization')
    ? req.clone({ setHeaders: { Authorization: `Bearer ${accessToken}` } })
    : req;

  return next(authReq).pipe(
    catchError((error: unknown) => {

      // نتجاهل أي خطأ غير 401، أو إذا كان الطلب لمسار مصادقة
      if (
        !(error instanceof HttpErrorResponse) ||
        error.status !== 401 ||
        isAuthEndpoint(req.url)
      ) {
        return throwError(() => error);
      }

      const refreshToken = tokenStorage.getRefreshToken();

      // لا يوجد refresh token — أوقف الجلسة مباشرةً
      if (!refreshToken) {
        clearAndRedirect(tokenStorage, router);
        return throwError(() => error);
      }

      // ── الحالة أ: refresh جارٍ بالفعل — انتظر نتيجته ────────────────────
      if (isRefreshing) {
        return refreshCompleted$.pipe(
          filter(done => done === true),   // انتظر حتى يكتمل الـ refresh
          take(1),
          switchMap(() => {
            const newToken = tokenStorage.getAccessToken();
            if (!newToken) return throwError(() => error);

            // أعد الطلب الأصلي بالتوكن الجديد
            const retryReq = req.clone({
              setHeaders: { Authorization: `Bearer ${newToken}` }
            });
            return next(retryReq);
          })
        );
      }

      // ── الحالة ب: أبدأ refresh جديداً ────────────────────────────────────
      isRefreshing = true;
      refreshCompleted$.next(false);

      // HttpClient مبني على HttpBackend مباشرةً (يتجاوز الـ interceptors)
      const directHttp = new HttpClient(httpBackend);

      return directHttp
        .post<AuthTokenResponse>(`${environment.apiUrl}/auth/refresh`, { refreshToken })
        .pipe(
          switchMap(res => {
            // ✅ خزِّن التوكنات الجديدة
            tokenStorage.storeTokens(res);
            isRefreshing = false;
            refreshCompleted$.next(true);   // أخبر الطلبات المنتظِرة

            const newToken = tokenStorage.getAccessToken();
            if (!newToken) {
              clearAndRedirect(tokenStorage, router);
              return throwError(() => error);
            }

            // ✅ أعد الطلب الأصلي بالتوكن الجديد
            const retryReq = req.clone({
              setHeaders: { Authorization: `Bearer ${newToken}` }
            });
            return next(retryReq);
          }),
          catchError(refreshError => {
            // الـ refresh فشل (التوكن منتهي الصلاحية أو مُبطَل من الـ Backend)
            clearAndRedirect(tokenStorage, router);
            return throwError(() => refreshError);
          })
        );
    })
  );
};