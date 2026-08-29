import { APP_INITIALIZER, ApplicationConfig, importProvidersFrom } from '@angular/core';
import { provideHttpClient, withInterceptors, HttpBackend, HttpClient } from '@angular/common/http';
import { provideRouter, withHashLocation } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';

import { routes } from './app.routes';
import { ApiErrorInterceptor } from './core/interceptors/api-error.interceptor';
import { AuthInterceptor } from './core/interceptors/auth-interceptor';
import { CsrfInterceptor } from './core/interceptors/csrf.interceptor';
import { AuthService } from './core/auth/auth.service';
import { normalizeAuthTokenResponse } from './core/models/auth.model';
import { CsrfTokenService } from './core/services/csrf-token.service';
import { EnumService } from './core/services/enum.service';
import { TokenStorageService } from './core/services/token-storage.service';
import { environment } from '../environments/environment';

export function httpLoaderFactory(http: HttpClient): TranslateHttpLoader {
  return new TranslateHttpLoader(http, '/i18n/', '.json');
}

export function preloadEnums(enumService: EnumService): () => Promise<unknown> {
  return () => enumService.loadAll();
}

/**
 * RELEASE-BLOCKERS-AR.md B-13: this used to gate on a refresh token read from storage — now
 * that nothing is ever stored there, that check would make this a permanent no-op and log
 * every user out on every page reload. It now always attempts the refresh; the ambient
 * refresh_token cookie (or its absence, for a genuinely anonymous visitor) decides the
 * outcome, exactly as tokenStorage.getRefreshToken() used to.
 */
export function restoreSession(
  tokenStorage: TokenStorageService,
  httpBackend: HttpBackend,
  authService: AuthService,
  csrfTokenService: CsrfTokenService
): () => Promise<void> {
  return async () => {
    try {
      // RELEASE-BLOCKERS-AR.md B-20: this refresh call bypasses every interceptor on
      // purpose (see the comment below), which means it also bypasses CsrfInterceptor —
      // the ambient refresh_token cookie makes the backend require X-XSRF-TOKEN here, so
      // it must be fetched and attached manually. A failed fetch (e.g. a genuinely
      // anonymous visitor with no session) is tolerated: the refresh below then fails on
      // its own terms exactly as before, via the existing catch block.
      await firstValueFrom(csrfTokenService.fetchToken());

      const directHttp = new HttpClient(httpBackend);
      const timeoutPromise = new Promise<null>(resolve => window.setTimeout(() => resolve(null), 5000));
      const refreshPromise = firstValueFrom(
        directHttp.post<unknown>(`${environment.apiUrl}/auth/refresh`, {}, {
          withCredentials: true,
          headers: { 'X-XSRF-TOKEN': csrfTokenService.getToken() ?? '' }
        })
      );

      const result = await Promise.race([refreshPromise, timeoutPromise]);

      if (!result) {
        return;
      }

      const normalizedToken = normalizeAuthTokenResponse(result);

      if (normalizedToken.accessToken) {
        authService.login(normalizedToken);
      }
    } catch {
      tokenStorage.clear();
      csrfTokenService.clear();
    }
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withHashLocation()),
    provideHttpClient(withInterceptors([CsrfInterceptor, AuthInterceptor, ApiErrorInterceptor])),
    {
      provide: APP_INITIALIZER,
      useFactory: preloadEnums,
      deps: [EnumService],
      multi: true
    },
    {
      provide: APP_INITIALIZER,
      useFactory: restoreSession,
      deps: [TokenStorageService, HttpBackend, AuthService, CsrfTokenService],
      multi: true
    },
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
