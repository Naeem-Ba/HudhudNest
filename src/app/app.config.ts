// =====================================================================
// 🔧 FIX — app.config.ts
//
// المشكلة الأصلية:
//   عند تحديث الصفحة، يختفي accessToken من الذاكرة.
//   التطبيق يبدأ بدون توكن → AuthGuard يُحوِّل المستخدم لصفحة الدخول.
//   رغم وجود refreshToken صالح في sessionStorage!
//
// الإصلاح:
//   إضافة APP_INITIALIZER يعمل قبل بدء الـ routing:
//   يقرأ الـ refreshToken → يطلب accessToken جديد من Backend
//   → يُسجِّل المستخدم → التطبيق يبدأ وهو مُسجَّل الدخول.
//
//   Timeout بعد 5 ثواني: إذا كان الـ Backend بطيئاً (Render.com cold start)،
//   التطبيق يبدأ بدون مستخدم ولا يتوقف للأبد.
//
//   إصلاح إضافي: استبدال 'as any' في TranslateModule
//   بالخاصية الصحيحة: defaultLanguage بدلاً من fallbackLang.
//
// المسار: src/app/app.config.ts
// =====================================================================

import {
  APP_INITIALIZER,
  ApplicationConfig,
  importProvidersFrom
} from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideHttpClient, withInterceptors, HttpBackend } from '@angular/common/http';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';

import { routes } from './app.routes';
import { AuthInterceptor } from './services/auth-interceptor';
import { ApiErrorInterceptor } from './core/interceptors/api-error.interceptor';
import { EnumService } from './services/enum.service';
import { TokenStorageService } from './core/services/token-storage.service';
import { AuthService } from './services/auth.service';
import { environment } from '../environments/environment';

// ─── Factory: تحميل ملفات الترجمة ───────────────────────────────────────────
export function httpLoaderFactory(http: HttpClient): TranslateHttpLoader {
  return new TranslateHttpLoader(http, '/i18n/', '.json');
}

// ─── Factory: تحميل القوائم (Enums) قبل بدء التطبيق ────────────────────────
export function preloadEnums(enumService: EnumService): () => Promise<unknown> {
  return () => enumService.loadAll();
}

// ─── Factory: استعادة جلسة المستخدم عند تحديث الصفحة ────────────────────────
/**
 * يُنفَّذ هذا الكود قبل أي routing.
 *
 * الخطوات:
 * 1. هل يوجد refreshToken في sessionStorage؟
 *    - لا → التطبيق يبدأ بدون مستخدم (لم يسجل الدخول أصلاً).
 *    - نعم → ننتقل للخطوة 2.
 * 2. نُرسل طلب POST /auth/refresh مباشرةً إلى Backend.
 *    - نستخدم HttpBackend (بدون interceptors) لتجنب التعارض.
 *    - مهلة 5 ثواني: إذا فاتت، يبدأ التطبيق بدون مستخدم.
 * 3. عند النجاح: نُسجِّل المستخدم → يرى صفحته المحمية.
 * 4. عند الفشل: نحذف الـ refreshToken المنتهي → صفحة الدخول.
 */
export function restoreSession(
  tokenStorage: TokenStorageService,
  httpBackend: HttpBackend,
  authService: AuthService
): () => Promise<void> {
  return async () => {
    const refreshToken = tokenStorage.getRefreshToken();

    // لا يوجد refreshToken — المستخدم غير مسجل دخوله أصلاً
    if (!refreshToken) return;

    try {
      // ✅ HttpClient مبني على HttpBackend مباشرةً (يتجاوز جميع interceptors)
      const directHttp = new HttpClient(httpBackend);

      // ✅ Race بين طلب الـ refresh وTimeout بعد 5 ثواني
      // (يمنع توقف التطبيق إذا كان Backend بطيئاً — كـ Render.com في cold start)
      const timeoutPromise = new Promise<null>(resolve =>
        setTimeout(() => resolve(null), 5000)
      );
      const refreshPromise = firstValueFrom(
        directHttp.post<any>(
          `${environment.apiUrl}/auth/refresh`,
          { refreshToken }
        )
      );

      const result = await Promise.race([refreshPromise, timeoutPromise]);

      if (result) {
        // ✅ توكن جديد — سجّل المستخدم
        authService.login(result);
      }
      // result === null → Timeout انتهى → يبدأ التطبيق بدون مستخدم
    } catch {
      // الـ refreshToken منتهي الصلاحية أو مُبطَل من Backend → احذفه
      tokenStorage.clear();
    }
  };
}

// ─── إعدادات التطبيق ─────────────────────────────────────────────────────────
export const appConfig: ApplicationConfig = {
  providers: [
    // Routing (Hash-based للـ Capacitor)
    provideRouter(routes, withHashLocation()),

    // HTTP + Interceptors
    provideHttpClient(
      withInterceptors([AuthInterceptor, ApiErrorInterceptor])
    ),

    // ── APP_INITIALIZER #1: تحميل القوائم (Enums) ─────────────────────────
    {
      provide: APP_INITIALIZER,
      useFactory: preloadEnums,
      deps: [EnumService],
      multi: true
    },

    // ── APP_INITIALIZER #2: استعادة جلسة المستخدم عند تحديث الصفحة ────────
    // ✅ هذا هو الإصلاح الجوهري لمشكلة "تسجيل الخروج عند تحديث الصفحة"
    {
      provide: APP_INITIALIZER,
      useFactory: restoreSession,
      deps: [TokenStorageService, HttpBackend, AuthService],
      multi: true
    },

    // ── i18n (الترجمة) ──────────────────────────────────────────────────────
    // ✅ إصلاح: defaultLanguage (الاسم الصحيح) بدلاً من fallbackLang + 'as any'
    importProvidersFrom(
      TranslateModule.forRoot({
        defaultLanguage: 'ar',
        loader: {
          provide: TranslateLoader,
          useFactory: httpLoaderFactory,
          deps: [HttpClient]
        }
      })
    )
  ]
};