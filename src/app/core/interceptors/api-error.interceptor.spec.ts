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
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

import { environment } from '../../../environments/environment';
import { AuthGuard } from '../guards/auth-guard';
import { TokenStorageService } from '../services/token-storage.service';
import { ToastService } from '../../shared/services/toast.service';
import { ApiErrorInterceptor } from './api-error.interceptor';

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

  it('✅ يُظهر toast "انتهت الجلسة" لِـ401 على صفحة محمية بـ AuthGuard', fakeAsync(() => {
    tokenStorage.setAccessToken(fakeJwt(3600));
    router.navigateByUrl('/my-listings');
    tick();

    // AuthGuard passing triggers AuthService's best-effort GET /users/me hydration —
    // unrelated to what this test covers, just drained so it isn't a leaked request.
    httpMock.match(`${environment.apiUrl}/users/me`).forEach(r =>
      r.flush({ DisplayName: 'Test', ImageUrl: null }));

    expect(router.url).toBe('/my-listings');

    http.get(`${environment.apiUrl}/my-listings`).subscribe({ next: () => {}, error: () => {} });
    httpMock.expectOne(`${environment.apiUrl}/my-listings`)
      .flush({ message: 'unauthorized' }, { status: 401, statusText: 'Unauthorized' });
    tick();

    expect(toast.toasts().length).toBe(1);
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
