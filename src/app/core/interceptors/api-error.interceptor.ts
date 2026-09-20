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
import { TranslateService } from '@ngx-translate/core';
import { catchError, throwError } from 'rxjs';
import { ToastService } from '../../shared/services/toast.service';
import { environment } from '../../../environments/environment';
import { currentRouteRequiresAuth } from './refresh-auth.interceptor';

const MAX_FIELD_MESSAGES = 3;

/** "$.defaultBasePricePerNight" / "DefaultBasePricePerNight" -> "Default base price per night". */
function humanizeFieldName(key: string): string {
  const name = key.replace(/^\$\.?/, '').split('.').pop() ?? '';
  const words = name.replace(/\[\d+\]/g, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').trim().toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : '';
}

/**
 * ASP.NET's automatic model-binding errors (400 application/problem+json) are English,
 * technical sentences ("The JSON value could not be converted to System.Int32. Path: $.capacity
 * | LineNumber: 0 ..."). Those are rewritten into a short, translated "field X is
 * required/invalid"; app-level FluentValidation messages (422) are already user-facing and pass through.
 */
function describeFieldError(field: string, message: string, translate: TranslateService): string {
  const label = humanizeFieldName(field);

  if (/field is required/i.test(message)) {
    return label ? translate.instant('API_ERRORS.FIELD_REQUIRED', { field: label }) : translate.instant('API_ERRORS.BAD_REQUEST');
  }

  if (/could not be converted|is not valid|is invalid|json|Path:\s*\$/i.test(message)) {
    return label ? translate.instant('API_ERRORS.FIELD_INVALID', { field: label }) : translate.instant('API_ERRORS.BAD_REQUEST');
  }

  return message;
}

/** Flattens ProblemDetails / ValidationError `errors` (a field -> messages map, or a list). */
function extractValidationMessages(errors: unknown, translate: TranslateService): string[] {
  const messages: string[] = [];

  const add = (field: string, value: unknown): void => {
    if (typeof value === 'string' && value.trim()) {
      messages.push(describeFieldError(field, value.trim(), translate));
    } else if (Array.isArray(value)) {
      value.forEach(item => add(field, item));
    }
  };

  if (Array.isArray(errors)) {
    errors.forEach(item => add('', item));
  } else if (errors && typeof errors === 'object') {
    Object.entries(errors as Record<string, unknown>).forEach(([field, value]) => add(field, value));
  }

  return [...new Set(messages)].slice(0, MAX_FIELD_MESSAGES);
}

/**
 * Order matters: a domain `message` is already the whole story; the field-level validation
 * reasons come next; the generic `title` ("Validation Error", "One or more validation errors
 * occurred.") is only a last resort — it used to win and hid the actual reason.
 */
function extractBackendMessage(error: HttpErrorResponse, translate: TranslateService): string | null {
  const body = error.error;

  if (!body) {
    return null;
  }

  if (typeof body === 'string') {
    return body.trim() || null;
  }

  const message = body.message ?? body.Message;
  if (message) {
    return String(message);
  }

  const fieldMessages = extractValidationMessages(body.errors ?? body.Errors, translate);
  if (fieldMessages.length > 0) {
    return fieldMessages.join(' ');
  }

  const generic = body.detail ?? body.Detail ?? body.title ?? body.Title;
  return generic ? String(generic) : null;
}

/**
 * كانت هذه الرسائل نصوصاً عربية ثابتة غير مُمرَّرة عبر ngx-translate، فكان
 * مستخدم إنجليزي أو ألماني يرى نصاً عربياً لأي فشل API لا يحمل حقل
 * message/errors في جسمه (مثال: 404 بلا جسم، أو انقطاع شبكة). الآن تُقرأ
 * من public/i18n/{en,de,ar}.json عبر مفاتيح API_ERRORS.* الجديدة.
 */
export function getFriendlyApiErrorMessage(error: HttpErrorResponse, translate: TranslateService): string {
  const backendMessage = extractBackendMessage(error, translate);

  if (backendMessage) {
    return backendMessage;
  }

  const key = ((): string => {
    switch (error.status) {
      case 0: return 'API_ERRORS.NETWORK';
      case 400: return 'API_ERRORS.BAD_REQUEST';
      case 401: return 'API_ERRORS.UNAUTHORIZED';
      case 403: return 'API_ERRORS.FORBIDDEN';
      case 404: return 'API_ERRORS.NOT_FOUND';
      case 409: return 'API_ERRORS.CONFLICT';
      case 429: return 'API_ERRORS.RATE_LIMITED';
      default: return error.status >= 500 ? 'API_ERRORS.SERVER' : 'API_ERRORS.UNKNOWN';
    }
  })();

  return translate.instant(key);
}

function shouldShowToast(reqUrl: string): boolean {
  return (reqUrl.includes('/api/') || reqUrl.endsWith('/api')) && !isAuthFlowRequest(reqUrl);
}

/**
 * كل صفحات تدفّق المصادقة (تسجيل الدخول/التسجيل/OTP/إعادة تعيين كلمة السر/…)
 * تعرض خطأها الخاص inline بالفعل — راجع LoginComponent.setError وتعليقها،
 * وphone-register.page.ts/phone-password-reset.page.ts. عرض toast عام أيضاً
 * هنا كان يكرّر نفس الرسالة مرتين أو ثلاثاً لكل عملية دخول/تسجيل فاشلة.
 */
function isAuthFlowRequest(reqUrl: string): boolean {
  return reqUrl.includes('/auth/');
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
  const translate = inject(TranslateService);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse) {
        const friendlyMessage = getFriendlyApiErrorMessage(error, translate);

        if (
          shouldShowToast(req.url) &&
          !isLogoutRequest(req.url) &&
          shouldShowUnauthorizedToast(error.status, router)
        ) {
          toast.error(friendlyMessage, translate.instant('API_ERRORS.TITLE'));
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