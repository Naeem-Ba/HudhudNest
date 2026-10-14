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
import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { catchError, throwError } from 'rxjs';
import { ToastService } from '../../shared/services/toast.service';
import { isServerFailure } from '../api/server-failure';
import { environment } from '../../../environments/environment';
import {
  currentRouteRequiresAuth,
  isAuthEndpoint,
  isBackendApiRequest,
  RETRIED_AFTER_REFRESH
} from './refresh-auth.interceptor';

const MAX_FIELD_MESSAGES = 3;

/**
 * Set on a request whose caller already handles the failure (or treats it as a normal
 * outcome), so the generic error toast would only add noise. Example: adding a favorite that is
 * already one answers 409 — the wanted end state is reached, there is nothing to tell the user.
 */
export const SKIP_ERROR_TOAST = new HttpContextToken<boolean>(() => false);

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

  const knownKey = knownValidationMessageKey(message);
  if (knownKey) {
    return translate.instant(knownKey);
  }

  if (/field is required/i.test(message)) {
    return label ? translate.instant('API_ERRORS.FIELD_REQUIRED', { field: label }) : translate.instant('API_ERRORS.BAD_REQUEST');
  }

  if (/could not be converted|is not valid|is invalid|json|Path:\s*\$/i.test(message)) {
    return label ? translate.instant('API_ERRORS.FIELD_INVALID', { field: label }) : translate.instant('API_ERRORS.BAD_REQUEST');
  }

  return message;
}

/**
 * The search and map endpoints refuse a bad filter with a fixed English sentence (FluentValidation).
 * Those sentences are matched here and shown in the reader's language instead (QA Phase 7, P7-D06);
 * any other message passes through unchanged.
 */
const KNOWN_VALIDATION_MESSAGE_KEYS: readonly (readonly [RegExp, string])[] = [
  [/^MinPrice must be less than or equal to MaxPrice\.?$/i, 'API_ERRORS.FILTER_PRICE_RANGE'],
  [/^MinRooms must be less than or equal to MaxRooms\.?$/i, 'API_ERRORS.FILTER_ROOMS_RANGE'],
  [/^MinArea must be less than or equal to MaxArea\.?$/i, 'API_ERRORS.FILTER_AREA_RANGE'],
  [/^Page is beyond the first [\d,]+ results/i, 'API_ERRORS.FILTER_PAGE_TOO_DEEP'],
  [/^(SearchTerm|City|Region) contains characters that are not allowed\.?$/i, 'API_ERRORS.FILTER_TEXT_NOT_ALLOWED'],
  [/^SortBy=Price requires ListingType/i, 'API_ERRORS.FILTER_SORT_PRICE_NEEDS_TYPE'],
  [/^(Latitude|Longitude) is required\.?$/i, 'API_ERRORS.GEO_COORDS_REQUIRED'],
  [/^(Latitude|Longitude) must be between/i, 'API_ERRORS.GEO_COORDS_INVALID']
];

export function knownValidationMessageKey(message: string): string | null {
  const text = message.trim();
  return KNOWN_VALIDATION_MESSAGE_KEYS.find(([pattern]) => pattern.test(text))?.[1] ?? null;
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

  // A 429's title/detail ("Too many requests." / "The request rate limit has been exceeded.") is
  // English whatever the UI language is; the caller falls back to the translated limit text.
  if (error.status === 429) {
    return null;
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
  // A stable error code beats the server's message: the message is Arabic whatever the UI
  // language is, the code is translated to the reader's own.
  const codeKey = knownErrorCodeKey(error);
  if (codeKey) {
    return translate.instant(codeKey);
  }

  // A 5xx body is the API's generic English sentence ("An unexpected error occurred..."); the
  // reader gets the translated server-error text instead, whatever the UI language is.
  if (isServerFailure(error)) {
    return translate.instant('API_ERRORS.SERVER');
  }

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

/**
 * Codes the API attaches to a refusal (ForbiddenException.Code) that have their own
 * localised text. Agency eligibility: see IAgencyEligibilityPolicy on the backend.
 */
const KNOWN_ERROR_CODE_KEYS: Readonly<Record<string, string>> = {
  AGENCY_ACCOUNT_NOT_VERIFIED: 'API_ERRORS.AGENCY_ACCOUNT_NOT_VERIFIED',
  AGENCY_PAID_PLAN_REQUIRED: 'API_ERRORS.AGENCY_PAID_PLAN_REQUIRED',
  AGENCY_FREE_PLAN_NOT_ALLOWED: 'API_ERRORS.AGENCY_FREE_PLAN_NOT_ALLOWED'
};

/** The i18n key for a refusal's stable `code`, or null when there is none we translate. */
export function knownErrorCodeKey(error: HttpErrorResponse): string | null {
  const body = error.error;
  const code = body && typeof body === 'object' ? (body.code ?? body.Code) : null;
  return typeof code === 'string' ? (KNOWN_ERROR_CODE_KEYS[code] ?? null) : null;
}

function shouldShowToast(reqUrl: string): boolean {
  return (reqUrl.includes('/api/') || reqUrl.endsWith('/api'))
    && !isAuthFlowRequest(reqUrl)
    && !hasOwnErrorMessage(reqUrl);
}

/**
 * Requests whose caller always shows its own, more specific message for any failure -- the data
 * export names its once-per-24-hours limit, so a second generic "too many requests" toast on top
 * of it only contradicted it.
 */
function hasOwnErrorMessage(reqUrl: string): boolean {
  return reqUrl.includes('/users/me/export');
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
function shouldShowUnauthorizedToast(status: number, router: Router, req: HttpRequest<unknown>): boolean {
  if (status !== 401) {
    return true;
  }

  // RefreshAuthInterceptor refreshes and re-sends this request; if the refresh fails it shows
  // the session-expired notice itself. Only a 401 on the re-sent copy is worth a toast here.
  if (isBackendApiRequest(req.url) && !isAuthEndpoint(req.url) && !req.context.get(RETRIED_AFTER_REFRESH)) {
    return false;
  }

  return currentRouteRequiresAuth(router);
}

/** The API answers every unsafe request from a phone-restricted account with this 403 code. */
export const PHONE_REVERIFICATION_REQUIRED_CODE = 'PHONE_REVERIFICATION_REQUIRED';
const PHONE_REVERIFY_ROUTE = '/profile/phone-reverify';

function isPhoneReverificationRequired(error: HttpErrorResponse): boolean {
  const body = error.error as { code?: string; Code?: string } | null;
  return error.status === 403 && (body?.code ?? body?.Code) === PHONE_REVERIFICATION_REQUIRED_CODE;
}

export const ApiErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const toast = inject(ToastService);
  const router = inject(Router);
  const translate = inject(TranslateService);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse) {
        if (isPhoneReverificationRequired(error)) {
          // A restricted account can only recover through the re-verification page, so take the
          // person there instead of leaving them with an unexplained failing action. The API's own
          // message is English, hence the translated one.
          toast.error(translate.instant('AUTH.ERRORS.PHONE_REVERIFICATION_REQUIRED'), translate.instant('API_ERRORS.TITLE'));
          if (!router.url.startsWith(PHONE_REVERIFY_ROUTE)) {
            void router.navigateByUrl(PHONE_REVERIFY_ROUTE);
          }
          return throwError(() => error);
        }

        const friendlyMessage = getFriendlyApiErrorMessage(error, translate);

        if (
          shouldShowToast(req.url) &&
          !req.context.get(SKIP_ERROR_TOAST) &&
          !isLogoutRequest(req.url) &&
          shouldShowUnauthorizedToast(error.status, router, req)
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