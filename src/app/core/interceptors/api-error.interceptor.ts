// ═══════════════════════════════════════════════════════════════
// ✅ إصلاح L-3: إخفاء backendError من console.warn في Production
//
// المشكلة القديمة:
//   console.warn('[API Error]', { backendError: error.error });
//   في Production → يعرض تفاصيل الخطأ الداخلية في DevTools للمتصفح.
//   هذا يساعد المهاجم في فهم بنية الـ Backend وثغراته.
//
// الإصلاح:
//   في Production: نُسجِّل فقط URL + Method + Status
//   في Development: نُسجِّل التفاصيل الكاملة للمساعدة في التطوير
//
// التعليم — Security Through Obscurity ليس كافياً، لكنه طبقة إضافية:
//   رسائل الخطأ التفصيلية في Console تساعد:
//     ✅ المطور أثناء التطوير
//     ❌ المهاجم في Production
//   الحل: نُفرِّق بين البيئتين.
// ═══════════════════════════════════════════════════════════════
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { ToastService } from '../../shared/services/toast.service';
import { environment } from '../../../environments/environment';
import { currentRouteRequiresAuth } from './refresh-auth.interceptor';

function extractBackendMessage(error: HttpErrorResponse): string | null {
  const body = error.error;

  if (!body) {
    return null;
  }

  if (typeof body === 'string') {
    return body.trim() || null;
  }

  const directMessage = body.message ?? body.Message ?? body.title ?? body.Title ?? body.detail ?? body.Detail;
  if (directMessage) {
    return String(directMessage);
  }

  const validationErrors = body.errors ?? body.Errors;
  if (validationErrors && typeof validationErrors === 'object') {
    const messages = Object.values(validationErrors).flat().filter(Boolean);
    if (messages.length > 0) {
      return (messages as string[]).join(' ');
    }
  }

  return null;
}

export function getFriendlyApiErrorMessage(error: HttpErrorResponse): string {
  const backendMessage = extractBackendMessage(error);

  if (backendMessage) {
    return backendMessage;
  }

  if (error.status === 0) {
    return 'تعذر الاتصال بالخادم. تأكد من تشغيل الـ Backend أو تحقق من إعدادات CORS.';
  }

  if (error.status === 400) {
    return 'البيانات المرسلة غير صحيحة. راجع الحقول المطلوبة ثم حاول مرة أخرى.';
  }

  if (error.status === 401) {
    return 'انتهت الجلسة أو تحتاج إلى تسجيل الدخول.';
  }

  if (error.status === 403) {
    return 'ليس لديك صلاحية لتنفيذ هذا الإجراء.';
  }

  if (error.status === 404) {
    return 'المورد المطلوب غير موجود.';
  }

  if (error.status === 409) {
    return 'يوجد تعارض في البيانات. حدّث الصفحة ثم حاول مرة أخرى.';
  }

  if (error.status === 429) {
    return 'تم إرسال طلبات كثيرة. انتظر قليلًا ثم حاول مرة أخرى.';
  }

  if (error.status >= 500) {
    return 'حدث خطأ في الخادم. حاول لاحقًا.';
  }

  return 'حدث خطأ غير متوقع.';
}

function shouldShowToast(reqUrl: string): boolean {
  return reqUrl.includes('/api/') || reqUrl.endsWith('/api');
}

/**
 * Logging out is always treated as succeeding locally regardless of what the backend
 * call does — AuthApiService.logout() swallows any error from POST /auth/logout and
 * clears the session either way (see its catchError + finalize). So the visitor who
 * just clicked "logout" must never see an error toast for that request: whatever the
 * backend answered, they ARE logged out, and a "session expired"/generic error toast
 * right after an intentional logout reads as if something went wrong when nothing did.
 */
function isLogoutRequest(reqUrl: string): boolean {
  return reqUrl.includes('/auth/logout');
}

/**
 * A 401 is only actually "your session ended" when the page the visitor is looking at
 * requires one. A background call that 401s while browsing a PUBLIC page (e.g. an
 * anonymous favorite-status check) is expected and must not show a "session expired"
 * toast — RefreshAuthInterceptor already applies the same currentRouteRequiresAuth
 * check before redirecting for the same reason (see its clearAndRedirect doc comment).
 */
function shouldShowUnauthorizedToast(status: number, router: Router): boolean {
  return status !== 401 || currentRouteRequiresAuth(router);
}

export const ApiErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const toast = inject(ToastService);
  const router = inject(Router);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse) {
        const friendlyMessage = getFriendlyApiErrorMessage(error);

        if (
          shouldShowToast(req.url) &&
          !isLogoutRequest(req.url) &&
          shouldShowUnauthorizedToast(error.status, router)
        ) {
          toast.error(friendlyMessage, 'خطأ');
        }

        // ✅ إصلاح L-3: تقسيم الـ Logging بين Development و Production
        //
        // Development:
        //   نُظهر backendError الكامل للمساعدة في debugging
        //   المطور يحتاج كل التفاصيل لإصلاح المشكلة
        //
        // Production:
        //   نُسجِّل فقط URL + Status + الرسالة الودية
        //   لا نُظهر backendError لأنه قد يحتوي على:
        //     - Stack traces تكشف بنية الـ Backend
        //     - رسائل قاعدة البيانات
        //     - مسارات الملفات الداخلية
        if (!environment.production) {
          // Development: logging كامل للمساعدة في التطوير
          console.warn('[API Error]', {
            url: req.url,
            method: req.method,
            status: error.status,
            message: friendlyMessage,
            backendError: error.error  // ← متاح في Development فقط
          });
        } else {
          // Production: logging محدود — لا تفاصيل داخلية
          console.warn('[API Error]', {
            url: req.url,
            method: req.method,
            status: error.status,
            message: friendlyMessage
            // backendError: مُخفَى في Production ✅
          });
        }
      }

      return throwError(() => error);
    })
  );
};