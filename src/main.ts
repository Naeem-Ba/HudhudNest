import { APP_INITIALIZER, importProvidersFrom } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withHashLocation } from '@angular/router';
import { HttpClient } from '@angular/common/http';

import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';

import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { AuthInterceptor } from './app/services/auth-interceptor';
import { ApiErrorInterceptor } from './app/core/interceptors/api-error.interceptor';
import { EnumService } from './app/services/enum.service';

export function httpLoaderFactory(http: HttpClient): TranslateHttpLoader {
  return new TranslateHttpLoader(http, '/i18n/', '.json');
}

export function preloadEnums(enumService: EnumService): () => Promise<unknown> {
  return () => enumService.loadAll();
}

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes, withHashLocation()),
    provideHttpClient(withInterceptors([AuthInterceptor, ApiErrorInterceptor])),
    {
      provide: APP_INITIALIZER,
      useFactory: preloadEnums,
      deps: [EnumService],
      multi: true
    },
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
}).catch(console.error);
