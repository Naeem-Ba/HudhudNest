// =====================================================================
// ✅ Unit Tests – refresh-auth.interceptor.redirect.spec.ts
// Bug fix: clearAndRedirect() used to force-navigate to /auth/login on ANY 401
// a refresh could not fix, even from a background call on a PUBLIC page (e.g.
// an anonymous visitor's stale token while browsing /short-stay). It now only
// redirects when the route the user is CURRENTLY on actually requires a
// session (AuthGuard/AdminGuard) — see currentRouteRequiresAuth().
// =====================================================================
import { Component } from '@angular/core';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { environment } from '../../../environments/environment';
import { AuthGuard } from '../guards/auth-guard';
import { AuthService } from '../auth/auth.service';
import { TokenStorageService } from '../services/token-storage.service';
import { RefreshAuthInterceptor } from './refresh-auth.interceptor';

@Component({ template: '', standalone: true })
class DummyComponent {}

/** Base64url-encodes a JWT payload so AuthService.decodeJwt can parse it. */
function fakeJwt(expiresInSeconds: number): string {
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expiresInSeconds, sub: 'test-user' }));
  return `header.${payload}.signature`;
}

describe('RefreshAuthInterceptor — redirect only when the CURRENT route requires auth', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let tokenStorage: TokenStorageService;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'short-stay', component: DummyComponent }, // public
          { path: 'my-listings', component: DummyComponent, canActivate: [AuthGuard] }, // protected
          { path: 'auth/login', component: DummyComponent }
        ]),
        provideHttpClient(withInterceptors([RefreshAuthInterceptor])),
        provideHttpClientTesting()
      ]
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    tokenStorage = TestBed.inject(TokenStorageService);
    router = TestBed.inject(Router);
  });

  afterEach(() => httpMock.verify());

  /** Drives the interceptor to the point where a refresh has already failed. */
  function triggerUnrecoverable401(
    refreshFailureBody: Record<string, unknown> = { message: 'refresh token invalid' }
  ): void {
    http.get(`${environment.apiUrl}/favorites`).subscribe({ next: () => {}, error: () => {} });

    httpMock.expectOne(`${environment.apiUrl}/favorites`)
      .flush({ message: 'unauthorized' }, { status: 401, statusText: 'Unauthorized' });

    const csrfReq = httpMock.match(`${environment.apiUrl}/security/csrf-token`);
    csrfReq.forEach(r => r.flush({ csrfToken: 'csrf' }));

    httpMock.expectOne(`${environment.apiUrl}/auth/refresh`)
      .flush(refreshFailureBody, { status: 401, statusText: 'Unauthorized' });
  }

  it('✅ على صفحة عامة: لا يُعاد التوجيه إلى /auth/login عند فشل التجديد', fakeAsync(() => {
    tokenStorage.setAccessToken('stale-token-from-a-previous-session');
    router.navigateByUrl('/short-stay');
    tick();
    expect(router.url).toBe('/short-stay');

    triggerUnrecoverable401();
    tick();

    // The stale token/CSRF cache is still cleared...
    expect(tokenStorage.getAccessToken()).toBeNull();
    // ...but the visitor is left exactly where they were, not bounced to login.
    expect(router.url).toBe('/short-stay');
  }));

  it('✅ على صفحة محمية بـ AuthGuard: يُعاد التوجيه إلى /auth/login عند فشل التجديد', fakeAsync(() => {
    tokenStorage.setAccessToken(fakeJwt(3600));
    router.navigateByUrl('/my-listings');
    tick();
    expect(router.url).toBe('/my-listings');

    // AuthGuard passing triggers AuthService.validateSession() → hydrateProfile()'s
    // best-effort GET /users/me (both from AuthService's own constructor being injected
    // for the first time here, and from the guard's own explicit call) — unrelated to what
    // this test covers, just drained so it doesn't count as a leaked request.
    httpMock.match(`${environment.apiUrl}/users/me`).forEach(r =>
      r.flush({ DisplayName: 'Test', ImageUrl: null }));

    triggerUnrecoverable401();
    tick();

    expect(tokenStorage.getAccessToken()).toBeNull();
    expect(router.url).toBe('/auth/login');
  }));

  // ✅ إصلاح: AuthController.cs يُرفق الآن errorCode مع فشل /auth/refresh
  // (RefreshTokenCommand.cs). notifySessionExpired() تستقبله الآن لتُميّز
  // "أُلغيت كل الجلسات لأسباب أمنية" (REFRESH_TOKEN_REUSE_DETECTED) عن أي
  // انتهاء جلسة عادي آخر — بدل حدث واحد بلا سبب كان بلا أي مشترك أصلاً.
  it('✅ REFRESH_TOKEN_REUSE_DETECTED يُطلِق sessionExpired$ بسبب "revoked"', fakeAsync(() => {
    const authService = TestBed.inject(AuthService);
    const reasons: Array<'expired' | 'revoked' | 'superseded'> = [];
    authService.sessionExpired$.subscribe(reason => reasons.push(reason));

    tokenStorage.setAccessToken(fakeJwt(3600));
    router.navigateByUrl('/my-listings');
    tick();

    httpMock.match(`${environment.apiUrl}/users/me`).forEach(r =>
      r.flush({ DisplayName: 'Test', ImageUrl: null }));

    triggerUnrecoverable401({
      message: 'Refresh token reuse detected. All active sessions were revoked.',
      errorCode: 'REFRESH_TOKEN_REUSE_DETECTED'
    });
    tick();

    expect(reasons).toEqual(['revoked']);
  }));

  it('✅ REFRESH_TOKEN_EXPIRED (أو أي كود آخر) يُطلِق sessionExpired$ بسبب "expired"', fakeAsync(() => {
    const authService = TestBed.inject(AuthService);
    const reasons: Array<'expired' | 'revoked' | 'superseded'> = [];
    authService.sessionExpired$.subscribe(reason => reasons.push(reason));

    tokenStorage.setAccessToken(fakeJwt(3600));
    router.navigateByUrl('/my-listings');
    tick();

    httpMock.match(`${environment.apiUrl}/users/me`).forEach(r =>
      r.flush({ DisplayName: 'Test', ImageUrl: null }));

    triggerUnrecoverable401({
      message: 'Invalid or expired refresh token.',
      errorCode: 'REFRESH_TOKEN_EXPIRED'
    });
    tick();

    expect(reasons).toEqual(['expired']);
  }));
});
