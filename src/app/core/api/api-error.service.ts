import { Injectable } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';

/**
 * رموز الأخطاء الموحدة المتوقعة من الخلفية
 */
export const API_ERROR_CODES = {
  // المصادقة
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  UNAUTHORIZED: 'UNAUTHORIZED',

  // التحقق من البيانات
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  PASSWORD_POLICY_FAILED: 'PASSWORD_POLICY_FAILED',
  EMAIL_ALREADY_EXISTS: 'EMAIL_ALREADY_EXISTS',

  // OTP والهاتف
  OTP_INVALID: 'OTP_INVALID',
  OTP_WRONG: 'OTP_WRONG',
  OTP_EXPIRED: 'OTP_EXPIRED',
  OTP_RATE_LIMITED: 'OTP_RATE_LIMITED',
  PHONE_ALREADY_REGISTERED: 'PHONE_ALREADY_REGISTERED',
  PHONE_INVALID: 'PHONE_INVALID',
  PHONE_AUTH_FAILED: 'PHONE_AUTH_FAILED',

  // المستخدم
  USER_NOT_FOUND: 'USER_NOT_FOUND',

  // عام
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
  NOT_FOUND: 'NOT_FOUND'
} as const;

/**
 * الصيغة الموحدة لاستجابة الخطأ من الخلفية
 */
export interface ApiErrorResponse {
  message: string;
  errorCode?: string;
  errors?: Record<string, string[]>;
  statusCode?: number;
  timestamp?: string;
  traceId?: string;
}

/**
 * كائن خطأ منسّق للاستخدام في الأمام
 */
export interface FormattedApiError {
  message: string;
  code: string;
  statusCode: number;
  validationErrors?: Record<string, string[]>;
  isDev: boolean;
}

/**
 * خدمة موحدة لمعالجة أخطاء API
 * تتعامل مع عدم التناسق بين صيغ الخطأ (PascalCase vs camelCase)
 * وتوفر رسائل موحدة للأمام
 */
@Injectable({ providedIn: 'root' })
export class ApiErrorService {
  /**
   * قراءة دفاعية لكود الخطأ تدعم PascalCase وcamelCase معاً
   */
  private readErrorCode(error: any): string | undefined {
    return error?.error?.errorCode ?? error?.error?.ErrorCode;
  }

  /**
   * قراءة دفاعية للرسالة تدعم كلا الصيغتين
   */
  private readErrorMessage(error: any): string | undefined {
    return error?.error?.message ?? error?.error?.Message;
  }

  /**
   * قراءة دفاعية لأخطاء التحقق
   */
  private readValidationErrors(error: any): Record<string, string[]> | undefined {
    return error?.error?.errors;
  }

  /**
   * معالجة خطأ HTTP وتحويله إلى صيغة موحدة
   */
  formatError(error: HttpErrorResponse | any): FormattedApiError {
    const statusCode = error?.status ?? 500;
    const errorCode = this.readErrorCode(error) || this.getDefaultErrorCode(statusCode);
    const message = this.readErrorMessage(error) || this.getDefaultErrorMessage(statusCode);
    const validationErrors = this.readValidationErrors(error);
    const isDev = this.isDevError(error);

    return {
      message,
      code: errorCode,
      statusCode,
      validationErrors,
      isDev
    };
  }

  /**
   * الحصول على الرسالة الموحدة للخطأ بناءً على الكود
   */
  getErrorMessage(errorCode: string | undefined, fallback: string = 'حدث خطأ ما'): string {
    if (!errorCode) return fallback;

    const messages: Record<string, string> = {
      [API_ERROR_CODES.INVALID_CREDENTIALS]: 'بيانات المصادقة غير صحيحة',
      [API_ERROR_CODES.TOKEN_EXPIRED]: 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجدداً',
      [API_ERROR_CODES.UNAUTHORIZED]: 'لم يتم التحقق من هويتك',
      [API_ERROR_CODES.EMAIL_ALREADY_EXISTS]: 'البريد الإلكتروني مسجل بالفعل',
      [API_ERROR_CODES.OTP_INVALID]: 'رمز OTP غير صحيح',
      [API_ERROR_CODES.OTP_WRONG]: 'رمز OTP خاطئ',
      [API_ERROR_CODES.OTP_EXPIRED]: 'انتهت صلاحية رمز OTP',
      [API_ERROR_CODES.OTP_RATE_LIMITED]: 'عدد محاولات OTP كثير جداً، حاول لاحقاً',
      [API_ERROR_CODES.PHONE_ALREADY_REGISTERED]: 'رقم الهاتف مسجل بالفعل',
      [API_ERROR_CODES.PHONE_INVALID]: 'رقم الهاتف غير صحيح',
      [API_ERROR_CODES.PASSWORD_POLICY_FAILED]: 'كلمة المرور لا تستوفي المتطلبات الأمنية'
    };

    return messages[errorCode] || fallback;
  }

  /**
   * فحص ما إذا كان الخطأ خطأ تطوير (مثل استثناء الخادم)
   */
  private isDevError(error: any): boolean {
    const statusCode = error?.status;
    return statusCode === 500 || statusCode === 503;
  }

  /**
   * الحصول على رمز الخطأ الافتراضي بناءً على رمز HTTP
   */
  private getDefaultErrorCode(statusCode: number): string {
    switch (statusCode) {
      case 400:
        return API_ERROR_CODES.BAD_REQUEST;
      case 401:
        return API_ERROR_CODES.UNAUTHORIZED;
      case 404:
        return API_ERROR_CODES.NOT_FOUND;
      case 422:
        return API_ERROR_CODES.VALIDATION_FAILED;
      case 500:
      case 503:
        return API_ERROR_CODES.INTERNAL_SERVER_ERROR;
      default:
        return 'UNKNOWN_ERROR';
    }
  }

  /**
   * الحصول على الرسالة الافتراضية بناءً على رمز HTTP
   */
  private getDefaultErrorMessage(statusCode: number): string {
    switch (statusCode) {
      case 400:
        return 'طلب غير صحيح';
      case 401:
        return 'يتطلب مصادقة';
      case 403:
        return 'الوصول مرفوض';
      case 404:
        return 'المورد غير موجود';
      case 422:
        return 'فشل التحقق من البيانات';
      case 429:
        return 'عدد الطلبات كثير جداً، حاول لاحقاً';
      case 500:
      case 503:
        return 'خطأ في الخادم، حاول لاحقاً';
      default:
        return 'حدث خطأ ما';
    }
  }

  /**
   * استخراج جميع رسائل أخطاء التحقق في قائمة مفردة
   */
  flattenValidationErrors(errors?: Record<string, string[]>): string[] {
    if (!errors) return [];
    return Object.values(errors).flat();
  }

  /**
   * فحص ما إذا كان الخطأ متعلقاً بكلمة المرور
   */
  isPasswordError(errorCode?: string): boolean {
    return errorCode === API_ERROR_CODES.PASSWORD_POLICY_FAILED;
  }

  /**
   * فحص ما إذا كان الخطأ متعلقاً بـ OTP
   */
  isOtpError(errorCode?: string): boolean {
    return errorCode?.startsWith('OTP_') || errorCode?.startsWith('PHONE_');
  }

  /**
   * فحص ما إذا كان يجب إعادة توجيه المستخدم لتسجيل الدخول
   */
  shouldRedirectToLogin(statusCode?: number, errorCode?: string): boolean {
    return (
      statusCode === 401 ||
      errorCode === API_ERROR_CODES.TOKEN_EXPIRED ||
      errorCode === API_ERROR_CODES.UNAUTHORIZED
    );
  }
}
