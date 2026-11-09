import { HttpBackend, HttpClient, HttpContextToken, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
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
import { resolveAuthApiBaseUrl } from '../auth/auth-api-base-url';
import { CsrfTokenService } from '../services/csrf-token.service';
import { TokenStorageService } from '../services/token-storage.service';

let refreshRequest$: Observable<string> | null = null;

/**
 * Set on the copy of a request this interceptor re-sends after a successful refresh.
 * ApiErrorInterceptor sits inside this one, so it sees the first 401 before any refresh is
 * tried; it uses this flag to stay quiet on that first 401 (this interceptor either recovers
 * the request or reports the ended session itself) and to toast only a 401 that survives the
 * retry. Without it, every request made with an expired or just-invalidated access token
 * showed "You need to sign in" even though the retry then succeeded.
 */
export const RETRIED_AFTER_REFRESH = new HttpContextToken<boolean>(() => false);

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
 *
 * Also matches the same-origin-proxied auth base (see auth-api-base-url.ts): on the deployed
 * web app, /auth/* calls resolve to a relative /api/... path instead of the real apiBaseUrl, so
 * an authenticated /auth/* call that ISN'T in isAuthEndpoint's list below (e.g.
 * /auth/phone/change/verify, /auth/email/add — both [Authorize]-protected) would otherwise be
 * missed here, losing both its Bearer token and its CSRF header (csrf.interceptor.ts reuses
 * this same check) even though the backend still requires both.
 */
export function isBackendApiRequest(url: string): boolean {
  const requestUrl = toAbsoluteUrl(url);
  const apiBaseUrl = toAbsoluteUrl(environment.apiBaseUrl || environment.apiUrl);
  const authBaseUrl = toAbsoluteUrl(resolveAuthApiBaseUrl(environment));

  return (
    requestUrl === apiBaseUrl || requestUrl.startsWith(`${apiBaseUrl}/`) ||
    requestUrl === authBaseUrl || requestUrl.startsWith(`${authBaseUrl}/`)
  );
}

/** Auth endpoints must not trigger refresh loops or receive stale Authorization headers. */
export function isAuthEndpoint(url: string): boolean {
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

/** The only auth endpoint that is [Authorize]-protected and so must carry the access token. */
function isLogoutEndpoint(url: string): boolean {
  return toAbsoluteUrl(url).includes('/auth/logout');
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
export const REUSE_DETECTED_CODE = 'REFRESH_TOKEN_REUSE_DETECTED';
/** This device's session was ended because the account has more sessions than allowed. */
export const SUPERSEDED_CODE = 'REFRESH_TOKEN_SUPERSEDED';
/** The session was ended on purpose (sign-out from another device, password change). */
export const REVOKED_CODE = 'REFRESH_TOKEN_REVOKED';

/**
 * Did the server itself say "this refresh token is no good"? Only then may the app drop the session.
 * A dropped connection (status 0), a timeout, a 5xx while the host wakes up, or a 429 says nothing about
 * the session: clearing it there signed people out whenever a phone came back from a tunnel or the
 * background with a weak signal. The session is kept, the failed request fails on its own, and the next
 * attempt (or the recovery on reconnect) refreshes normally.
 */
export function isDefinitiveSessionEnd(error: unknown): boolean {
  return error instanceof HttpErrorResponse && (error.status === 401 || error.status === 400);
}

export function isCsrfFailure(error: unknown): boolean {
  return (
    error instanceof HttpErrorResponse &&
    error.status === 403 &&
    (error.error as { code?: unknown } | null | undefined)?.code === 'CSRF_VALIDATION_FAILED'
  );
}

export function sessionEndReason(error: unknown): 'expired' | 'revoked' | 'superseded' {
  const code = readRefreshErrorCode(error);
  if (code === SUPERSEDED_CODE) {
    return 'superseded';
  }
  return code === REUSE_DETECTED_CODE || code === REVOKED_CODE ? 'revoked' : 'expired';
}

/**
 * Reads the /auth/refresh failure's errorCode (AuthController.cs now includes it on the 401
 * body) so the UI can tell "all sessions revoked for security" apart from an ordinary expiry
 * instead of showing one undifferentiated message for both. Exported for app.config.ts's
 * restoreSession(), which needs the exact same guest-vs-expired distinction at app boot.
 */
export function readRefreshErrorCode(error: unknown): string | null {
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
  // Not an answer about the session: keep it (see isDefinitiveSessionEnd).
  if (!isDefinitiveSessionEnd(refreshError)) {
    return;
  }

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
    authService.notifySessionExpired(sessionEndReason(refreshError));
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

    // Same-origin on the deployed web app — see auth-api-base-url.ts's doc comment (Safari
    // drops this cookie outright as third-party otherwise; stays absolute for local dev and
    // the native Capacitor app, neither of which has this problem or a proxy for it).
    const post$ = () =>
      directHttp.post<unknown>(`${resolveAuthApiBaseUrl(environment)}/auth/refresh`, {}, {
        withCredentials: true,
        headers: { 'X-XSRF-TOKEN': csrfTokenService.getToken() ?? '' }
      });

    refreshRequest$ = ensureCsrfToken$
      .pipe(
        switchMap(() => post$()),
        // A stale anti-forgery token (the API restarted and lost its keys, or the page was open for
        // days) is not a verdict on the session: fetch a fresh one and ask once more.
        catchError(error =>
          isCsrfFailure(error)
            ? csrfTokenService.fetchToken().pipe(switchMap(() => post$()))
            : throwError(() => error)
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

  // POST /auth/logout is the one auth endpoint behind [Authorize]: without the Bearer token the API
  // answers 401, the refresh_token cookie stays valid and the next load silently restores the session.
  const needsBearer = !isAuthRequest || isLogoutEndpoint(req.url);
  const request = isApiRequest && needsBearer && accessToken && !req.headers.has('Authorization')
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
        switchMap(newAccessToken => next(withBearerToken(
          req.clone({ context: req.context.set(RETRIED_AFTER_REFRESH, true) }),
          newAccessToken
        ))),
        catchError(refreshError => throwError(() => refreshError))
      );
    })
  );
};