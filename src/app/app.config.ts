// =====================================================================
// ✅ FIX #8 – app.config.ts (شامل لجميع الإعدادات)
// المشكلة: الإعدادات مكررة بين main.ts و app.config.ts
// الحل: جميع الإعدادات هنا فقط – main.ts يستورده فقط
// =====================================================================
import { APP_INITIALIZER, ApplicationConfig, importProvidersFrom } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpClient } from '@angular/common/http';

import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';

import { routes } from './app.routes';
import { AuthInterceptor } from './services/auth-interceptor';
import { ApiErrorInterceptor } from './core/interceptors/api-error.interceptor';
import { EnumService } from './services/enum.service';

export function httpLoaderFactory(http: HttpClient): TranslateHttpLoader {
  return new TranslateHttpLoader(http, '/i18n/', '.json');
}

export function preloadEnums(enumService: EnumService): () => Promise<unknown> {
  return () => enumService.loadAll();
}

// ✅ FIX #8: مصدر واحد لكل الإعدادات
export const appConfig: ApplicationConfig = {
  providers: [
    // Routing
    provideRouter(routes, withHashLocation()),

    // HTTP + Interceptors
    provideHttpClient(
      withInterceptors([AuthInterceptor, ApiErrorInterceptor])
    ),

    // Preload Enums قبل بدء التطبيق
    {
      provide: APP_INITIALIZER,
      useFactory: preloadEnums,
      deps: [EnumService],
      multi: true
    },

    // i18n (الترجمة)
    importProvidersFrom(
      TranslateModule.forRoot({
        fallbackLang: 'ar',
        loader: {
          provide: TranslateLoader,
          useFactory: httpLoaderFactory,
          deps: [HttpClient]
        }
      } as any)
    )
  ]
};
