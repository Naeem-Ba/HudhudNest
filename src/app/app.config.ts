import { APP_INITIALIZER, ApplicationConfig, importProvidersFrom } from '@angular/core';
import { HttpErrorResponse, provideHttpClient, withInterceptors, HttpBackend, HttpClient } from '@angular/common/http';
import { provideRouter, withNavigationErrorHandler } from '@angular/router';
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
import { resolveAuthApiBaseUrl } from './core/auth/auth-api-base-url';
import { readSessionHint, writeSessionHint } from './core/auth/session-hint';
import { CsrfTokenService } from './core/services/csrf-token.service';
import { GeoCountryService } from './core/services/geo-country.service';
import { LanguageService } from './core/services/language.service';
import { resolveFirstVisitLanguage, toSupportedLanguage } from './core/i18n/first-visit-language';
import { browserStaleChunkReloadDeps, reloadForStaleChunk } from './core/services/stale-chunk-reload';
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

/**
 * First-time visitors only (nothing stored by the language selector or an earlier visit): pick the
 * starting language from the visitor's country, falling back to the device language. See
 * first-visit-language.ts for the exact rules and geo-country.service.ts for where the country comes from.
 *
 * Runs inside APP_INITIALIZER so the language is settled before anything renders (no visible flip from one
 * language/direction to another). It cannot delay or break startup: the lookup is capped at
 * GEO_COUNTRY_TIMEOUT_MS and every failure resolves to "country unknown".
 */
export function resolveInitialLanguage(
  languageService: LanguageService,
  geoCountry: GeoCountryService
): () => Promise<void> {
  return async () => {
    // A shared link carries the language of the person who shared it (?lang=de): it decides what a
    // visitor who never picked a language sees, for this page load only (nothing is stored).
    const linked = toSupportedLanguage(
      typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('lang')
    );
    if (linked && !languageService.hasUserChoice()) {
      languageService.use(linked, 'ephemeral');
      return;
    }

    if (languageService.hasStoredPreference()) {
      return;
    }

    const country = await geoCountry.fetchCountryCode();
    const lang = resolveFirstVisitLanguage({
      country,
      deviceLanguages: languageService.getDeviceLanguages()
    });

    // Remember the answer only when it came from a real country; with no country the same
    // lookup is simply tried again on the next visit.
    languageService.use(lang, country ? 'auto' : 'ephemeral');
  };
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
      // A browser that knows it is signed out (see session-hint.ts) does not ask the server again.
      if (readSessionHint() === 'no') {
        return;
      }

      // RELEASE-BLOCKERS-AR.md B-20: this refresh call bypasses every interceptor on
      // purpose (see the comment below), which means it also bypasses CsrfInterceptor —
      // the ambient refresh_token cookie makes the backend require X-XSRF-TOKEN here, so
      // it must be fetched and attached manually. A failed fetch (e.g. a genuinely
      // anonymous visitor with no session) is tolerated: the refresh below then fails on
      // its own terms exactly as before, via the existing catch block.
      await firstValueFrom(csrfTokenService.fetchToken());

      const directHttp = new HttpClient(httpBackend);
      // Same-origin on the deployed web app — see auth-api-base-url.ts's doc comment (Safari
      // drops this cookie outright as third-party otherwise; stays absolute for local dev and
      // the native Capacitor app, neither of which has this problem or a proxy for it).
      const attemptRefresh = () =>
        firstValueFrom(
          directHttp.post<unknown>(`${resolveAuthApiBaseUrl(environment)}/auth/refresh`, {}, {
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
      // The server answered "no session" (not a dropped connection): remember it for the next visit.
      if (error instanceof HttpErrorResponse && (error.status === 401 || error.status === 400)) {
        writeSessionHint('no');
      }

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
    // A tab left open across a deploy asks for chunks that no longer exist; load the target page fresh once.
    provideRouter(
      routes,
      withNavigationErrorHandler(navigationError => {
        reloadForStaleChunk(navigationError.error, navigationError.url, browserStaleChunkReloadDeps());
      })
    ),
    provideHttpClient(withInterceptors([CsrfInterceptor, AuthInterceptor, ApiErrorInterceptor])),
    {
      provide: APP_INITIALIZER,
      useFactory: resolveInitialLanguage,
      deps: [LanguageService, GeoCountryService],
      multi: true
    },
    // No enum preload here (performance audit 2026-10-03, B5): it fired 10 GET /api/enums/* requests
    // before the first render, on every page load, for a lookup only the property form reads, and that
    // screen already awaits EnumService.ensureLoaded() itself.
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
