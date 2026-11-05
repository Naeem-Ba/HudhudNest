// =====================================================================
// ✅ Unit Tests – refresh-auth.interceptor.spec.ts
// تغطية: RELEASE-BLOCKERS-AR.md B-20 — طلب التجديد (POST /auth/refresh) يتجاوز
// كل المُعترِضات عمداً (HttpBackend خام)، وبالتالي يتجاوز CsrfInterceptor أيضاً.
// هذا الاختبار يؤكد أن requestNewAccessToken() يجلب توكن CSRF بنفسه ويُرفقه
// يدوياً كرأس X-XSRF-TOKEN على طلب /auth/refresh — أسهل جزء لينتكس بصمت لاحقاً.
// =====================================================================
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { environment } from '../../../environments/environment';
import { CsrfTokenService } from '../services/csrf-token.service';
import { TokenStorageService } from '../services/token-storage.service';
import { RefreshAuthInterceptor } from './refresh-auth.interceptor';

describe('RefreshAuthInterceptor — B-20 CSRF header on the refresh bypass call', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let tokenStorage: TokenStorageService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([RefreshAuthInterceptor])),
        provideHttpClientTesting()
      ]
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    tokenStorage = TestBed.inject(TokenStorageService);
    tokenStorage.setAccessToken('expired-access-token');
  });

  afterEach(() => httpMock.verify());

  it('✅ عند 401: يجلب توكن CSRF أولاً ثم يُرفقه على POST /auth/refresh', () => {
    http.get(`${environment.apiUrl}/listings/mine`).subscribe({
      next: () => {},
      error: () => {}
    });

    // الطلب الأصلي يفشل بـ 401 فيبدأ مسار التجديد.
    httpMock.expectOne(`${environment.apiUrl}/listings/mine`)
      .flush({ message: 'unauthorized' }, { status: 401, statusText: 'Unauthorized' });

    // requestNewAccessToken() يرى أنه لا يوجد توكن CSRF مخزَّن فيجلبه أولاً.
    const csrfReq = httpMock.expectOne(`${environment.apiUrl}/security/csrf-token`);
    csrfReq.flush({ csrfToken: 'fresh-csrf-token' });

    // ثم يُرفق التوكن كرأس X-XSRF-TOKEN على طلب التجديد نفسه.
    const refreshReq = httpMock.expectOne(`${environment.apiUrl}/auth/refresh`);
    expect(refreshReq.request.headers.get('X-XSRF-TOKEN')).toBe('fresh-csrf-token');
    expect(refreshReq.request.withCredentials).toBeTrue();
    refreshReq.flush({ accessToken: 'new-access-token', refreshToken: '', expiresIn: 900 });

    // الطلب الأصلي يُعاد بالتوكن الجديد.
    const retriedReq = httpMock.expectOne(`${environment.apiUrl}/listings/mine`);
    expect(retriedReq.request.headers.get('Authorization')).toBe('Bearer new-access-token');
    retriedReq.flush({ items: [] });
  });

  it('✅ إن كان توكن CSRF مخزَّناً مسبقاً، لا يُعاد جلبه — يُستخدم مباشرة', () => {
    const csrfTokenService = TestBed.inject(CsrfTokenService);
    (csrfTokenService as unknown as { token: string | null }).token = 'already-cached';

    http.get(`${environment.apiUrl}/listings/mine`).subscribe({
      next: () => {},
      error: () => {}
    });

    httpMock.expectOne(`${environment.apiUrl}/listings/mine`)
      .flush({ message: 'unauthorized' }, { status: 401, statusText: 'Unauthorized' });

    // لا طلب GET csrf-token هنا — ينتقل مباشرة إلى /auth/refresh بالتوكن المخزَّن.
    const refreshReq = httpMock.expectOne(`${environment.apiUrl}/auth/refresh`);
    expect(refreshReq.request.headers.get('X-XSRF-TOKEN')).toBe('already-cached');
    refreshReq.flush({ accessToken: 'new-access-token', refreshToken: '', expiresIn: 900 });

    httpMock.expectOne(`${environment.apiUrl}/listings/mine`).flush({ items: [] });
  });
});

// Core E2E audit 2026-10-02, B-1: POST /auth/logout is [Authorize]-protected but used to go out
// without a Bearer header (it sits in isAuthEndpoint's list), so the API answered 401, the
// refresh_token cookie stayed valid and the next page load silently restored the session.
describe('RefreshAuthInterceptor — logout must carry the Bearer token', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let liveToken: string;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([RefreshAuthInterceptor])),
        provideHttpClientTesting()
      ]
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    // AuthService.validateSession() drops anything that is not an unexpired JWT, so use a well-formed one.
    const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }));
    liveToken = `h.${payload}.s`;
    TestBed.inject(TokenStorageService).setAccessToken(liveToken);
  });

  afterEach(() => httpMock.verify());

  it('✅ POST /auth/logout يُرسل Authorization: Bearer عند وجود توكن', () => {
    http.post(`${environment.apiUrl}/auth/logout`, {}).subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/auth/logout`);
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${liveToken}`);
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('✅ 401 على /auth/logout لا يطلق دورة تجديد (لا refresh ولا إعادة محاولة)', () => {
    let status: number | undefined;
    http.post(`${environment.apiUrl}/auth/logout`, {}).subscribe({ error: e => (status = e.status) });

    httpMock.expectOne(`${environment.apiUrl}/auth/logout`)
      .flush({ message: 'unauthorized' }, { status: 401, statusText: 'Unauthorized' });

    expect(status).toBe(401);

    httpMock.expectNone(`${environment.apiUrl}/auth/refresh`);
    httpMock.expectNone(`${environment.apiUrl}/security/csrf-token`);
  });

  it('✅ مسارات الدخول العامة (login/refresh) ما زالت بلا Bearer', () => {
    http.post(`${environment.apiUrl}/auth/login`, {}).subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/auth/login`);
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({});
  });
});

/** A well-formed, unexpired token: AuthService drops anything it cannot decode as soon as it is created. */
function liveAccessToken(): string {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '');
  return `${encode({ alg: 'none' })}.${encode({ sub: 'u1', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
}

describe('RefreshAuthInterceptor — a connection problem is not a sign-out', () => {
  const LIVE = liveAccessToken();
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let tokenStorage: TokenStorageService;
  let csrf: CsrfTokenService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([RefreshAuthInterceptor])),
        provideHttpClientTesting()
      ]
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    tokenStorage = TestBed.inject(TokenStorageService);
    csrf = TestBed.inject(CsrfTokenService);
    (csrf as unknown as { token: string | null }).token = 'cached';
    tokenStorage.setAccessToken(LIVE);
  });

  afterEach(() => httpMock.verify());

  function failFirstRequestWith401(): void {
    http.get(`${environment.apiUrl}/listings/mine`).subscribe({ next: () => {}, error: () => {} });
    httpMock.expectOne(`${environment.apiUrl}/listings/mine`)
      .flush({ message: 'unauthorized' }, { status: 401, statusText: 'Unauthorized' });
  }

  it('keeps the session when the refresh never reaches the server (status 0)', () => {
    failFirstRequestWith401();

    httpMock.expectOne(`${environment.apiUrl}/auth/refresh`)
      .error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });

    expect(tokenStorage.getAccessToken()).toBe(LIVE);
    expect(csrf.getToken()).toBe('cached');
  });

  it('keeps the session when the server is down or waking up (503)', () => {
    failFirstRequestWith401();

    httpMock.expectOne(`${environment.apiUrl}/auth/refresh`)
      .flush({ message: 'unavailable' }, { status: 503, statusText: 'Service Unavailable' });

    expect(tokenStorage.getAccessToken()).toBe(LIVE);
  });

  it('keeps the session on a rate limit (429)', () => {
    failFirstRequestWith401();

    httpMock.expectOne(`${environment.apiUrl}/auth/refresh`)
      .flush({ message: 'slow down' }, { status: 429, statusText: 'Too Many Requests' });

    expect(tokenStorage.getAccessToken()).toBe(LIVE);
  });

  it('ends the session only when the server says the refresh token is no good (401)', () => {
    failFirstRequestWith401();

    httpMock.expectOne(`${environment.apiUrl}/auth/refresh`)
      .flush({ message: 'no', errorCode: 'REFRESH_TOKEN_REVOKED' }, { status: 401, statusText: 'Unauthorized' });

    expect(tokenStorage.getAccessToken()).toBeNull();
  });

  it('a stale anti-forgery token (403 CSRF_VALIDATION_FAILED) is replaced and the refresh retried once', () => {
    failFirstRequestWith401();

    httpMock.expectOne(`${environment.apiUrl}/auth/refresh`)
      .flush({ code: 'CSRF_VALIDATION_FAILED' }, { status: 403, statusText: 'Forbidden' });

    httpMock.expectOne(`${environment.apiUrl}/security/csrf-token`).flush({ csrfToken: 'renewed' });

    const retry = httpMock.expectOne(`${environment.apiUrl}/auth/refresh`);
    expect(retry.request.headers.get('X-XSRF-TOKEN')).toBe('renewed');
    retry.flush({ accessToken: 'new-access-token', refreshToken: '', expiresIn: 900 });

    httpMock.expectOne(`${environment.apiUrl}/listings/mine`).flush({ items: [] });
    expect(tokenStorage.getAccessToken()).toBe('new-access-token');
  });
});
