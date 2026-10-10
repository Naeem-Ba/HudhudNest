// =====================================================================
// ✅ Unit Tests – api-error.interceptor.spec.ts
// Bug fix: ApiErrorInterceptor used to show a "session expired" toast for
// ANY 401 anywhere, including a background call failing while an anonymous
// visitor browses a PUBLIC page — even though RefreshAuthInterceptor already
// knew not to force-navigate them in that exact case (currentRouteRequiresAuth).
// The toast is now gated by the same check, so it only appears when the
// CURRENT route actually requires a session.
// =====================================================================
import { Component } from '@angular/core';
import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

import { environment } from '../../../environments/environment';
import { AuthGuard } from '../guards/auth-guard';
import { CsrfTokenService } from '../services/csrf-token.service';
import { TokenStorageService } from '../services/token-storage.service';
import { ToastService } from '../../shared/services/toast.service';
import { ApiErrorInterceptor } from './api-error.interceptor';
import { RefreshAuthInterceptor, RETRIED_AFTER_REFRESH } from './refresh-auth.interceptor';

@Component({ template: '', standalone: true })
class DummyComponent {}

/** Base64url-encodes a JWT payload so AuthService.decodeJwt can parse it (mirrors refresh-auth.interceptor.redirect.spec.ts). */
function fakeJwt(expiresInSeconds: number): string {
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expiresInSeconds, sub: 'test-user' }));
  return `header.${payload}.signature`;
}

describe('ApiErrorInterceptor — 401 toast only when the CURRENT route requires auth', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let toast: ToastService;
  let router: Router;
  let tokenStorage: TokenStorageService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        provideRouter([
          { path: 'short-stay', component: DummyComponent }, // public
          { path: 'my-listings', component: DummyComponent, canActivate: [AuthGuard] }, // protected
          { path: 'auth/login', component: DummyComponent }
        ]),
        provideHttpClient(withInterceptors([ApiErrorInterceptor])),
        provideHttpClientTesting()
      ]
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
    router = TestBed.inject(Router);
    tokenStorage = TestBed.inject(TokenStorageService);
  });

  afterEach(() => httpMock.verify());

  it('✅ لا يُظهر toast "انتهت الجلسة" لِـ401 من نداء خلفي على صفحة عامة', fakeAsync(() => {
    router.navigateByUrl('/short-stay');
    tick();
    expect(router.url).toBe('/short-stay');

    http.get(`${environment.apiUrl}/favorites`).subscribe({ next: () => {}, error: () => {} });
    httpMock.expectOne(`${environment.apiUrl}/favorites`)
      .flush({ message: 'unauthorized' }, { status: 401, statusText: 'Unauthorized' });
    tick();

    expect(toast.toasts()).toEqual([]);
  }));

  it('✅ يُظهر toast لِـ401 ثانٍ على صفحة محمية بعد إعادة المحاولة بالرمز المجدَّد', fakeAsync(() => {
    tokenStorage.setAccessToken(fakeJwt(3600));
    router.navigateByUrl('/my-listings');
    tick();

    // AuthGuard passing triggers AuthService's best-effort GET /users/me hydration —
    // unrelated to what this test covers, just drained so it isn't a leaked request.
    httpMock.match(`${environment.apiUrl}/users/me`).forEach(r =>
      r.flush({ DisplayName: 'Test', ImageUrl: null }));

    expect(router.url).toBe('/my-listings');

    http.get(`${environment.apiUrl}/my-listings`, { context: new HttpContext().set(RETRIED_AFTER_REFRESH, true) })
      .subscribe({ next: () => {}, error: () => {} });
    httpMock.expectOne(`${environment.apiUrl}/my-listings`)
      .flush({ message: 'unauthorized' }, { status: 401, statusText: 'Unauthorized' });
    tick();

    expect(toast.toasts().length).toBe(1);
  }));

  it('✅ لا يُظهر toast لأول 401 على صفحة محمية — RefreshAuthInterceptor سيجدد الرمز ويعيد الطلب', fakeAsync(() => {
    tokenStorage.setAccessToken(fakeJwt(3600));
    router.navigateByUrl('/my-listings');
    tick();

    httpMock.match(`${environment.apiUrl}/users/me`).forEach(r =>
      r.flush({ DisplayName: 'Test', ImageUrl: null }));

    http.get(`${environment.apiUrl}/my-listings`).subscribe({ next: () => {}, error: () => {} });
    httpMock.expectOne(`${environment.apiUrl}/my-listings`)
      .flush({ message: 'unauthorized' }, { status: 401, statusText: 'Unauthorized' });
    tick();

    expect(toast.toasts()).toEqual([]);
  }));

  it('✅ أخطاء أخرى غير 401 (مثل 500) تُظهر toast حتى على صفحة عامة', fakeAsync(() => {
    router.navigateByUrl('/short-stay');
    tick();

    http.get(`${environment.apiUrl}/favorites`).subscribe({ next: () => {}, error: () => {} });
    httpMock.expectOne(`${environment.apiUrl}/favorites`)
      .flush({ message: 'server error' }, { status: 500, statusText: 'Internal Server Error' });
    tick();

    expect(toast.toasts().length).toBe(1);
  }));

  it('✅ لا يُظهر أي toast عند فشل POST /auth/logout بـ401 — تسجيل الخروج يُعتبر ناجحاً محلياً دائماً', fakeAsync(() => {
    tokenStorage.setAccessToken(fakeJwt(3600));
    router.navigateByUrl('/my-listings'); // صفحة محمية — لو كان هذا نداءً عادياً لأظهر toast
    tick();

    httpMock.match(`${environment.apiUrl}/users/me`).forEach(r =>
      r.flush({ DisplayName: 'Test', ImageUrl: null }));

    http.post(`${environment.apiUrl}/auth/logout`, {}).subscribe({ next: () => {}, error: () => {} });
    httpMock.expectOne(`${environment.apiUrl}/auth/logout`)
      .flush({ message: 'unauthorized' }, { status: 401, statusText: 'Unauthorized' });
    tick();

    expect(toast.toasts()).toEqual([]);
  }));

  it('✅ لا يُظهر أي toast عند فشل POST /auth/logout بخطأ خادم (500)', fakeAsync(() => {
    router.navigateByUrl('/short-stay');
    tick();

    http.post(`${environment.apiUrl}/auth/logout`, {}).subscribe({ next: () => {}, error: () => {} });
    httpMock.expectOne(`${environment.apiUrl}/auth/logout`)
      .flush({ message: 'server error' }, { status: 500, statusText: 'Internal Server Error' });
    tick();

    expect(toast.toasts()).toEqual([]);
  }));
});

// The real chain: RefreshAuthInterceptor wraps ApiErrorInterceptor, so ApiErrorInterceptor sees
// the first 401 before any refresh. Creating an agency invalidates the access token at once
// (SecurityStamp change), and the page then showed "You need to sign in" although the retry
// right after it succeeded.
describe('ApiErrorInterceptor + RefreshAuthInterceptor — a 401 the refresh recovers shows no toast', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let toast: ToastService;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        provideRouter([
          { path: 'my-listings', component: DummyComponent, canActivate: [AuthGuard] },
          { path: 'auth/login', component: DummyComponent }
        ]),
        provideHttpClient(withInterceptors([RefreshAuthInterceptor, ApiErrorInterceptor])),
        provideHttpClientTesting()
      ]
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
    router = TestBed.inject(Router);
    TestBed.inject(TokenStorageService).setAccessToken(fakeJwt(3600));
    (TestBed.inject(CsrfTokenService) as unknown as { token: string | null }).token = 'csrf';
  });

  afterEach(() => httpMock.verify());

  function openProtectedPageAndFailOnce(): void {
    router.navigateByUrl('/my-listings');
    tick();
    httpMock.match(`${environment.apiUrl}/users/me`).forEach(r =>
      r.flush({ DisplayName: 'Test', ImageUrl: null }));

    http.get(`${environment.apiUrl}/agencies/1/invitations`).subscribe({ next: () => {}, error: () => {} });
    httpMock.expectOne(`${environment.apiUrl}/agencies/1/invitations`)
      .flush({ message: 'unauthorized' }, { status: 401, statusText: 'Unauthorized' });
    httpMock.expectOne(`${environment.apiUrl}/auth/refresh`)
      .flush({ accessToken: fakeJwt(3600), refreshToken: '', expiresIn: 900 });
  }

  it('✅ التجديد ينجح وإعادة المحاولة تنجح: لا toast', fakeAsync(() => {
    openProtectedPageAndFailOnce();
    httpMock.expectOne(`${environment.apiUrl}/agencies/1/invitations`).flush([]);
    tick();

    expect(toast.toasts()).toEqual([]);
  }));

  it('✅ التجديد ينجح لكن إعادة المحاولة تُرفض بـ401: toast واحد', fakeAsync(() => {
    openProtectedPageAndFailOnce();
    httpMock.expectOne(`${environment.apiUrl}/agencies/1/invitations`)
      .flush({ message: 'unauthorized' }, { status: 401, statusText: 'Unauthorized' });
    tick();

    expect(toast.toasts().length).toBe(1);
  }));
});

describe('ApiErrorInterceptor — a 429 on a request that names its own limit', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let toast: ToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([ApiErrorInterceptor])),
        provideHttpClientTesting()
      ]
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
  });

  afterEach(() => httpMock.verify());

  const limiter429 = {
    title: 'Too many requests.',
    detail: 'The request rate limit has been exceeded.',
    status: 429
  };

  it('data export: no generic toast on top of the page\'s own "once every 24 hours" message', () => {
    http.get(`${environment.apiUrl}/users/me/export`).subscribe({ next: () => {}, error: () => {} });
    httpMock.expectOne(`${environment.apiUrl}/users/me/export`)
      .flush(limiter429, { status: 429, statusText: 'Too Many Requests' });

    expect(toast.toasts()).toEqual([]);
  });

  it('any other request still gets one toast, never the limiter\'s English sentence', () => {
    http.get(`${environment.apiUrl}/properties`).subscribe({ next: () => {}, error: () => {} });
    httpMock.expectOne(`${environment.apiUrl}/properties`)
      .flush(limiter429, { status: 429, statusText: 'Too Many Requests' });

    expect(toast.toasts().length).toBe(1);
    expect(toast.toasts()[0].message).toBe('API_ERRORS.RATE_LIMITED');
  });
});
