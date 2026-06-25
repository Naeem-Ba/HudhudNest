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
import { catchError, throwError } from 'rxjs';
import { ToastService } from '../../shared/services/toast.service';
import { environment } from '../../../environments/environment';

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

export const ApiErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const toast = inject(ToastService);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse) {
        const friendlyMessage = getFriendlyApiErrorMessage(error);

        if (shouldShowToast(req.url)) {
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