import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ToastService } from '../../shared/services/toast.service';

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
      return messages.join(' ');
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

        console.warn('[API Error]', {
          url: req.url,
          method: req.method,
          status: error.status,
          message: friendlyMessage,
          backendError: error.error
        });
      }

      return throwError(() => error);
    })
  );
};
