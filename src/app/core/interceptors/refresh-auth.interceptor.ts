import { HttpBackend, HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  catchError,
  finalize,
  map,
  Observable,
  of,
  shareReplay,
  switchMap,
  throwError
} from 'rxjs';

import { environment } from '../../../environments/environment';
import { normalizeAuthTokenResponse } from '../models/auth.model';
import { CsrfTokenService } from '../services/csrf-token.service';
import { TokenStorageService } from '../services/token-storage.service';

let refreshRequest$: Observable<string> | null = null;

/**
 * Normalize a URL so interceptor decisions are deterministic for absolute and relative URLs.
 */
function toAbsoluteUrl(url: string): string {
  const appOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';

  try {
    return new URL(url, appOrigin).href.replace(/\/+$/, '').toLowerCase();
  } catch {
    return url.replace(/\/+$/, '').toLowerCase();
  }
}

/**
 * JWT must only be attached to our REST API. This prevents token leakage to i18n,
 * static files, SignalR URLs, analytics, maps, or any future third-party request.
 * Exported for reuse by csrf.interceptor.ts, which needs the same API-request check.
 */
export function isBackendApiRequest(url: string): boolean {
  const apiBaseUrl = toAbsoluteUrl(environment.apiBaseUrl || environment.apiUrl);
  const requestUrl = toAbsoluteUrl(url);

  return requestUrl === apiBaseUrl || requestUrl.startsWith(`${apiBaseUrl}/`);
}

/** Auth endpoints must not trigger refresh loops or receive stale Authorization headers. */
function isAuthEndpoint(url: string): boolean {
  const path = toAbsoluteUrl(url);

  return (
    path.includes('/auth/login') ||
    path.includes('/auth/register') ||
    path.includes('/auth/refresh') ||
    path.includes('/auth/logout') ||
    path.includes('/auth/phone/send-otp') ||
    path.includes('/auth/phone/verify') ||
    path.includes('/auth/forgot-password') ||
    path.includes('/auth/reset-password')
  );
}

function withBearerToken(req: Parameters<HttpInterceptorFn>[0], token: string) {
  return req.clone({
    setHeaders: {
      Authorization: `Bearer ${token}`
    }
  });
}

function clearAndRedirect(
  tokenStorage: TokenStorageService,
  router: Router,
  csrfTokenService: CsrfTokenService
): void {
  tokenStorage.clear();
  csrfTokenService.clear();

  if (router.url !== '/auth/login' && router.url !== '/login') {
    void router.navigateByUrl('/auth/login');
  }
}

/**
 * RELEASE-BLOCKERS-AR.md B-13: no refresh token parameter any more — the refresh_token
 * cookie carries it, invisibly to this code, as long as the request goes out with
 * withCredentials: true (it does; see below). This raw HttpClient built on HttpBackend
 * bypasses every interceptor on purpose (to avoid a refresh loop), which is exactly why it
 * needs that option set explicitly instead of inheriting it from BackendApiService.
 *
 * RELEASE-BLOCKERS-AR.md B-20: bypassing every interceptor also bypasses CsrfInterceptor —
 * the ambient refresh_token cookie makes the backend require X-XSRF-TOKEN on this call, so
 * it is fetched (if not already cached) and attached by hand here.
 */
function requestNewAccessToken(
  httpBackend: HttpBackend,
  tokenStorage: TokenStorageService,
  router: Router,
  csrfTokenService: CsrfTokenService
): Observable<string> {
  if (!refreshRequest$) {
    const directHttp = new HttpClient(httpBackend);
    const ensureCsrfToken$ = csrfTokenService.getToken()
      ? of(void 0)
      : csrfTokenService.fetchToken();

    refreshRequest$ = ensureCsrfToken$
      .pipe(
        switchMap(() =>
          directHttp.post<unknown>(`${environment.apiUrl}/auth/refresh`, {}, {
            withCredentials: true,
            headers: { 'X-XSRF-TOKEN': csrfTokenService.getToken() ?? '' }
          })
        ),
        map(response => normalizeAuthTokenResponse(response)),
        switchMap(tokens => {
          if (!tokens.accessToken) {
            return throwError(() => new Error('Refresh response did not contain an access token.'));
          }

          tokenStorage.storeTokens(tokens);
          return of(tokens.accessToken);
        }),
        catchError(error => {
          // All waiting requests receive the same error instead of hanging forever.
          clearAndRedirect(tokenStorage, router, csrfTokenService);
          return throwError(() => error);
        }),
        finalize(() => {
          refreshRequest$ = null;
        }),
        shareReplay({ bufferSize: 1, refCount: false })
      );
  }

  return refreshRequest$;
}

export const RefreshAuthInterceptor: HttpInterceptorFn = (req, next) => {
  const tokenStorage = inject(TokenStorageService);
  const router = inject(Router);
  const httpBackend = inject(HttpBackend);
  const csrfTokenService = inject(CsrfTokenService);

  const isApiRequest = isBackendApiRequest(req.url);
  const isAuthRequest = isAuthEndpoint(req.url);
  const accessToken = tokenStorage.getAccessToken();

  const request = isApiRequest && !isAuthRequest && accessToken && !req.headers.has('Authorization')
    ? withBearerToken(req, accessToken)
    : req;

  return next(request).pipe(
    catchError((error: unknown) => {
      if (
        !(error instanceof HttpErrorResponse) ||
        error.status !== 401 ||
        !isApiRequest ||
        isAuthRequest
      ) {
        return throwError(() => error);
      }

      // RELEASE-BLOCKERS-AR.md B-13: there is no stored refresh token to check any more —
      // whether the session can be restored is now something only the server can answer, by
      // whatever the refresh_token cookie currently holds. Always attempt the refresh; a
      // missing/expired/invalid cookie surfaces as this call failing, handled below exactly
      // like before.
      return requestNewAccessToken(httpBackend, tokenStorage, router, csrfTokenService).pipe(
        switchMap(newAccessToken => next(withBearerToken(req, newAccessToken))),
        catchError(refreshError => throwError(() => refreshError))
      );
    })
  );
};