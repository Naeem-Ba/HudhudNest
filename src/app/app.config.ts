import { APP_INITIALIZER, ApplicationConfig, importProvidersFrom } from '@angular/core';
import { HttpErrorResponse, provideHttpClient, withInterceptors, HttpBackend, HttpClient } from '@angular/common/http';
import { provideRouter, withHashLocation } from '@angular/router';
import { firstValueFrom, timeout, TimeoutError } from 'rxjs';

import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';

import { routes } from './app.routes';
import { ApiErrorInterceptor } from './core/interceptors/api-error.interceptor';
import { AuthInterceptor } from './core/interceptors/auth-interceptor';
import { CsrfInterceptor } from './core/interceptors/csrf.interceptor';
import { readRefreshErrorCode, REUSE_DETECTED_CODE } from './core/interceptors/refresh-auth.interceptor';
import { AuthService } from './core/auth/auth.service';
import { normalizeAuthTokenResponse } from './core/models/auth.model';
import { CsrfTokenService } from './core/services/csrf-token.service';
import { EnumService } from './core/services/enum.service';
import { TokenStorageService } from './core/services/token-storage.service';
import { environment } from '../environments/environment';

const REFRESH_TIMEOUT_MS = 15000;

/**
 * True for a failure that never got a definitive answer from the server (a dropped
 * connection, or the request timing out — e.g. a cold-started Render free-tier instance,
 * which can take well over 5s to respond) as opposed to a real 4xx/5xx response. Such a
 * failure is not evidence the session is actually gone, so it is retried once instead of
 * being treated the same as a confirmed guest/expired session.
 */
function isNetworkOrTimeoutError(error: unknown): boolean {
  if (error instanceof TimeoutError) {
    return true;
  }
  return error instanceof HttpErrorResponse && error.status === 0;
}

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
 *
 * Phase 1 (Authentication & Session) fix: this used to race the refresh call against a
 * hardcoded 5s setTimeout and silently give up either way — on a slow/cold-started backend
 * that discarded a session that was actually still valid, indistinguishable from a genuine
 * guest. It now (a) gives the request a realistic timeout via the cancellable rxjs
 * `timeout()` operator instead of a fire-and-forget race, (b) retries once on a connection-
 * level failure (no server answer at all) before giving up, and (c) on a definitive failure,
 * only raises sessionExpired — the same "was logged in, now genuinely isn't" signal
 * refresh-auth.interceptor.ts uses — when the server actually returned a refresh-specific
 * errorCode; a plain "no refresh token" 401 (real guest) or a network failure that survives
 * the retry stays silent, exactly like a first-time visitor. (Unlike
 * refresh-auth.interceptor.ts's clearAndRedirect, this cannot also gate on
 * currentRouteRequiresAuth: this runs inside APP_INITIALIZER, strictly before the app's
 * first navigation, so there is no resolved "current route" yet to check.)
 */
export function restoreSession(
  tokenStorage: TokenStorageService,
  httpBackend: HttpBackend,
  authService: AuthService,
  csrfTokenService: CsrfTokenService
): () => Promise<void> {
  return async () => {
    // authStatus$ 'sessionRefreshing' أثناء هذا الاستدعاء بدل 'anonymous' المؤقتة —
    // راجع تعليق AuthStatus في auth.service.ts.
    authService.beginSessionRefresh();
    try {
      // RELEASE-BLOCKERS-AR.md B-20: this refresh call bypasses every interceptor on
      // purpose (see the comment below), which means it also bypasses CsrfInterceptor —
      // the ambient refresh_token cookie makes the backend require X-XSRF-TOKEN here, so
      // it must be fetched and attached manually. A failed fetch (e.g. a genuinely
      // anonymous visitor with no session) is tolerated: the refresh below then fails on
      // its own terms exactly as before, via the existing catch block.
      await firstValueFrom(csrfTokenService.fetchToken());

      const directHttp = new HttpClient(httpBackend);
      const attemptRefresh = () =>
        firstValueFrom(
          directHttp.post<unknown>(`${environment.apiUrl}/auth/refresh`, {}, {
            withCredentials: true,
            headers: { 'X-XSRF-TOKEN': csrfTokenService.getToken() ?? '' }
          }).pipe(timeout(REFRESH_TIMEOUT_MS))
        );

      let result: unknown;
      try {
        result = await attemptRefresh();
      } catch (firstAttemptError) {
        if (!isNetworkOrTimeoutError(firstAttemptError)) {
          throw firstAttemptError;
        }
        result = await attemptRefresh();
      }

      const normalizedToken = normalizeAuthTokenResponse(result);

      if (normalizedToken.accessToken) {
        authService.login(normalizedToken);
      }
    } catch (error) {
      tokenStorage.clear();
      csrfTokenService.clear();

      const errorCode = readRefreshErrorCode(error);
      if (errorCode) {
        const reason = errorCode === REUSE_DETECTED_CODE ? 'revoked' : 'expired';
        authService.notifySessionExpired(reason);
      }
    } finally {
      authService.endSessionRefresh();
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
