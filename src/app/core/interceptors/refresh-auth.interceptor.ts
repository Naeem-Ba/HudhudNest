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
import { AdminGuard } from '../guards/admin-guard';
import { AuthGuard } from '../guards/auth-guard';
import { AuthService } from '../auth/auth.service';
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

/**
 * True when the route the user is CURRENTLY looking at (not the route the failed request
 * happened to belong to — a background call from a public page counts as "not required")
 * is itself gated by AuthGuard/AdminGuard. Walks the whole activated-route chain, not just
 * the leaf, since a guard can sit on a parent route and apply to every child.
 */
export function currentRouteRequiresAuth(router: Router): boolean {
  let route = router.routerState.snapshot.root;

  while (route) {
    const guards = route.routeConfig?.canActivate ?? [];
    if (guards.includes(AuthGuard) || guards.includes(AdminGuard)) {
      return true;
    }

    if (!route.firstChild) {
      break;
    }
    route = route.firstChild;
  }

  return false;
}

/**
 * Bug fix: this used to force-navigate to /auth/login on ANY 401 a refresh could not fix —
 * even one from a background call made incidentally on a PUBLIC page (e.g. loading favorite
 * ids while an anonymous visitor, or one with a stale/expired token, browses /short-stay or
 * /properties/:id). A public page must never be interrupted by a login redirect just because
 * some unrelated authenticated call in the background failed. The token/CSRF cache is still
 * always cleared — an invalid token must not keep being sent — but the redirect itself is now
 * conditional on the CURRENT route actually requiring a session (see
 * currentRouteRequiresAuth), matching what AuthGuard/AdminGuard would have done had the user
 * navigated there fresh with no token at all.
 */
/** Backend code for RefreshTokenCommand's reuse-detection branch — see RefreshTokenCommand.cs. */
const REUSE_DETECTED_CODE = 'REFRESH_TOKEN_REUSE_DETECTED';

/**
 * Reads the /auth/refresh failure's errorCode (AuthController.cs now includes it on the 401
 * body) so the UI can tell "all sessions revoked for security" apart from an ordinary expiry
 * instead of showing one undifferentiated message for both.
 */
function readRefreshErrorCode(error: unknown): string | null {
  if (!(error instanceof HttpErrorResponse)) {
    return null;
  }

  const body = error.error as { errorCode?: unknown } | null | undefined;
  return typeof body?.errorCode === 'string' ? body.errorCode : null;
}

function clearAndRedirect(
  tokenStorage: TokenStorageService,
  router: Router,
  csrfTokenService: CsrfTokenService,
  authService: AuthService,
  refreshError: unknown
): void {
  tokenStorage.clear();
  csrfTokenService.clear();

  if (
    currentRouteRequiresAuth(router) &&
    router.url !== '/auth/login' &&
    router.url !== '/login'
  ) {
    // A real expiry: the visitor was on a route that needed a session and the refresh
    // could not restore one — distinct from a background 401 on a public page, which
    // never reaches this branch. See AuthService.notifySessionExpired's doc comment.
    const reason = readRefreshErrorCode(refreshError) === REUSE_DETECTED_CODE ? 'revoked' : 'expired';
    authService.notifySessionExpired(reason);
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
  csrfTokenService: CsrfTokenService,
  authService: AuthService
): Observable<string> {
  if (!refreshRequest$) {
    authService.beginSessionRefresh();

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
          clearAndRedirect(tokenStorage, router, csrfTokenService, authService, error);
          return throwError(() => error);
        }),
        finalize(() => {
          refreshRequest$ = null;
          authService.endSessionRefresh();
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
  const authService = inject(AuthService);

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
      return requestNewAccessToken(httpBackend, tokenStorage, router, csrfTokenService, authService).pipe(
        switchMap(newAccessToken => next(withBearerToken(req, newAccessToken))),
        catchError(refreshError => throwError(() => refreshError))
      );
    })
  );
};