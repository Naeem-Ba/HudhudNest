import { HttpBackend, HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, finalize, map, Observable, of, shareReplay, switchMap, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import { normalizeAuthTokenResponse } from '../models/auth.model';
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
 */
function isBackendApiRequest(url: string): boolean {
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

function clearAndRedirect(tokenStorage: TokenStorageService, router: Router): void {
  tokenStorage.clear();

  if (router.url !== '/auth/login' && router.url !== '/login') {
    void router.navigateByUrl('/auth/login');
  }
}

function requestNewAccessToken(
  httpBackend: HttpBackend,
  tokenStorage: TokenStorageService,
  router: Router,
  refreshToken: string
): Observable<string> {
  if (!refreshRequest$) {
    const directHttp = new HttpClient(httpBackend);

    refreshRequest$ = directHttp
      .post<unknown>(`${environment.apiUrl}/auth/refresh`, { refreshToken })
      .pipe(
        map(response => normalizeAuthTokenResponse(response)),
        switchMap(tokens => {
          if (!tokens.accessToken) {
            return throwError(() => new Error('Refresh response did not contain an access token.'));
          }

          // Keep the previous "remember me" storage location when rotating tokens.
          tokenStorage.storeTokens(tokens, tokenStorage.isRemembered());
          return of(tokens.accessToken);
        }),
        catchError(error => {
          // All waiting requests receive the same error instead of hanging forever.
          clearAndRedirect(tokenStorage, router);
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

      const refreshToken = tokenStorage.getRefreshToken();

      if (!refreshToken) {
        clearAndRedirect(tokenStorage, router);
        return throwError(() => error);
      }

      return requestNewAccessToken(httpBackend, tokenStorage, router, refreshToken).pipe(
        switchMap(newAccessToken => next(withBearerToken(req, newAccessToken))),
        catchError(refreshError => throwError(() => refreshError))
      );
    })
  );
};