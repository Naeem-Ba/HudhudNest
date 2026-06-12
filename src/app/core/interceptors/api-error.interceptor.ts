import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

function getFriendlyMessage(error: HttpErrorResponse): string {
  if (error.status === 0) {
    return 'تعذر الاتصال بالخادم. تأكد من تشغيل الـ Backend أو تحقق من CORS.';
  }

  if (error.status === 400) {
    return 'البيانات المرسلة غير صحيحة.';
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
    return 'يوجد تعارض في البيانات.';
  }

  if (error.status === 429) {
    return 'تم إرسال طلبات كثيرة. حاول لاحقًا.';
  }

  if (error.status >= 500) {
    return 'حدث خطأ في الخادم. حاول لاحقًا.';
  }

  return 'حدث خطأ غير متوقع.';
}

export const ApiErrorInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse) {
        const friendlyMessage = getFriendlyMessage(error);

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
