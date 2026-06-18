// =====================================================================
// ✅ FIX #5 – auth-guard.ts
// المشكلة: كان يتحقق من وجود التوكن فقط، دون التحقق من صلاحيته
// الحل: استدعاء validateSession() التي تتحقق من تاريخ انتهاء الصلاحية
// =====================================================================
import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService } from './auth.service';

export const AuthGuard: CanActivateFn = (_route, state): boolean | UrlTree => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  // ✅ validateSession() تتحقق من:
  //    1. وجود التوكن في الذاكرة
  //    2. صحة صيغة JWT
  //    3. عدم انتهاء صلاحيته (exp claim)
  auth.validateSession();

  // بعد validateSession()، إذا انتهت الصلاحية يُمسح التوكن تلقائياً
  const isLoggedIn = auth.getAccessToken() !== null;

  if (isLoggedIn) {
    return true;
  }

  // ✅ حفظ الرابط الأصلي للعودة إليه بعد تسجيل الدخول
  return router.createUrlTree(['/auth/login'], {
    queryParams: { returnUrl: state.url }
  });
};
