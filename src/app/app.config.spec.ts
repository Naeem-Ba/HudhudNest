// =====================================================================
// ✅ Unit Tests – app.config.spec.ts (restoreSession)
//
// Phase 1 (Authentication & Session) bug: restoreSession() used to race the
// boot-time POST /auth/refresh against a hardcoded 5s setTimeout and give up
// silently either way — a slow/cold-started backend (e.g. Render free tier)
// looked identical to a real guest, so a genuinely logged-in user landed on
// "anonymous" after a page reload with no retry and no explanation. These
// tests cover the fix: a cancellable timeout that is retried once on a
// connection-level failure, and a guest/expired distinction driven by the
// server's own errorCode instead of collapsing every failure into one.
// =====================================================================
import { HttpBackend, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { APP_INITIALIZER } from '@angular/core';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';

import { environment } from '../environments/environment';
import { appConfig, restoreSession } from './app.config';
import { AuthService } from './core/auth/auth.service';
import { CsrfTokenService } from './core/services/csrf-token.service';
import { EnumService } from './core/services/enum.service';
import { TokenStorageService } from './core/services/token-storage.service';
import { SESSION_HINT_KEY, readSessionHint, writeSessionHint } from './core/auth/session-hint';

/** Base64url-encodes a JWT payload so AuthService.decodeJwt can parse it. */
function fakeJwt(expiresInSeconds: number): string {
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expiresInSeconds, sub: 'u1' }));
  return `header.${payload}.signature`;
}

describe('restoreSession (app.config.ts)', () => {
  let httpMock: HttpTestingController;
  let tokenStorage: TokenStorageService;
  let authService: AuthService;
  let csrfTokenService: CsrfTokenService;
  let httpBackend: HttpBackend;

  beforeEach(() => {
    localStorage.removeItem(SESSION_HINT_KEY);
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });

    httpMock = TestBed.inject(HttpTestingController);
    tokenStorage = TestBed.inject(TokenStorageService);
    authService = TestBed.inject(AuthService);
    csrfTokenService = TestBed.inject(CsrfTokenService);
    httpBackend = TestBed.inject(HttpBackend);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.removeItem(SESSION_HINT_KEY);
  });

  function flushCsrf(): void {
    httpMock.expectOne(`${environment.apiUrl}/security/csrf-token`).flush({ csrfToken: 'csrf' });
  }

  /** Drains the GET /users/me that a successful login()/validateSession() triggers. */
  function drainHydrateProfile(): void {
    httpMock.match(`${environment.apiUrl}/users/me`).forEach(r => r.flush({}, { status: 401, statusText: 'Unauthorized' }));
  }

  function run(): void {
    void restoreSession(tokenStorage, httpBackend, authService, csrfTokenService)();
  }

  // ────────────── زائر حقيقي: لا كوكي refresh_token على الإطلاق ──────────────

  it('✅ زائر حقيقي (401 بلا errorCode) ⇒ يبقى صامتاً بلا sessionExpired$', fakeAsync(() => {
    const reasons: Array<'expired' | 'revoked' | 'superseded'> = [];
    authService.sessionExpired$.subscribe(r => reasons.push(r));

    run();
    tick();
    flushCsrf();
    tick();

    httpMock.expectOne(`${environment.apiUrl}/auth/refresh`)
      .flush({ message: 'No refresh token was supplied.' }, { status: 401, statusText: 'Unauthorized' });
    tick();

    expect(tokenStorage.getAccessToken()).toBeNull();
    expect(reasons).toEqual([]);
  }));

  // ────────────── تلميح الجلسة: لا سؤال للخادم من متصفح يعرف أنه بلا جلسة ──────────────

  it('✅ زائر عرفنا سابقاً أنه بلا جلسة ⇒ لا طلب CSRF ولا /auth/refresh', fakeAsync(() => {
    writeSessionHint('no');

    run();
    tick();

    httpMock.expectNone(`${environment.apiUrl}/security/csrf-token`);
    httpMock.expectNone(`${environment.apiUrl}/auth/refresh`);
    expect(tokenStorage.getAccessToken()).toBeNull();
  }));

  it('✅ متصفح بلا تلميح (أول زيارة بعد التحديث) ⇒ يسأل الخادم كالسابق، ثم يتذكر أن لا جلسة', fakeAsync(() => {
    run();
    tick();
    flushCsrf();
    tick();
    httpMock.expectOne(`${environment.apiUrl}/auth/refresh`)
      .flush({ message: 'No refresh token was supplied.' }, { status: 401, statusText: 'Unauthorized' });
    tick();

    expect(readSessionHint()).toBe('no');
  }));

  it('✅ تلميح "نعم" ⇒ يسأل الخادم ويستعيد الجلسة', fakeAsync(() => {
    writeSessionHint('yes');

    run();
    tick();
    flushCsrf();
    tick();
    httpMock.expectOne(`${environment.apiUrl}/auth/refresh`).flush({ accessToken: fakeJwt(3600) });
    tick();
    drainHydrateProfile();

    expect(tokenStorage.getAccessToken()).not.toBeNull();
    expect(readSessionHint()).toBe('yes');
  }));

  it('✅ انقطاع شبكة (status 0) لا يُسجَّل كـ"لا جلسة"', fakeAsync(() => {
    writeSessionHint('yes');

    run();
    tick();
    flushCsrf();
    tick();
    httpMock.expectOne(`${environment.apiUrl}/auth/refresh`).error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
    tick();
    httpMock.expectOne(`${environment.apiUrl}/auth/refresh`).error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
    tick();

    expect(readSessionHint()).toBe('yes');
  }));

  // ────────────── جلسة انتهت فعلاً (الخادم أعاد errorCode محدَّداً) ──────────────

  it('✅ REFRESH_TOKEN_EXPIRED ⇒ يُطلِق sessionExpired$ بسبب expired', fakeAsync(() => {
    const reasons: Array<'expired' | 'revoked' | 'superseded'> = [];
    authService.sessionExpired$.subscribe(r => reasons.push(r));

    run();
    tick();
    flushCsrf();
    tick();

    httpMock.expectOne(`${environment.apiUrl}/auth/refresh`).flush(
      { message: 'Invalid or expired refresh token.', errorCode: 'REFRESH_TOKEN_EXPIRED' },
      { status: 401, statusText: 'Unauthorized' }
    );
    tick();

    expect(reasons).toEqual(['expired']);
  }));

  it('✅ REFRESH_TOKEN_REUSE_DETECTED ⇒ يُطلِق sessionExpired$ بسبب revoked', fakeAsync(() => {
    const reasons: Array<'expired' | 'revoked' | 'superseded'> = [];
    authService.sessionExpired$.subscribe(r => reasons.push(r));

    run();
    tick();
    flushCsrf();
    tick();

    httpMock.expectOne(`${environment.apiUrl}/auth/refresh`).flush(
      { message: 'Refresh token reuse detected.', errorCode: 'REFRESH_TOKEN_REUSE_DETECTED' },
      { status: 401, statusText: 'Unauthorized' }
    );
    tick();

    expect(reasons).toEqual(['revoked']);
  }));

  // ────────────── الجذر الفعلي للعطل: خطأ شبكة/انقطاع (لا رد نهائي من الخادم) ──────────────

  it('✅ خطأ شبكة في أول محاولة (لا 401 حقيقي) ⇒ يُعاد المحاولة مرة واحدة وتنجح الجلسة', fakeAsync(() => {
    run();
    tick();
    flushCsrf();
    tick();

    // أول محاولة: انقطاع اتصال (status 0) — ليس ردّاً نهائياً من الخادم.
    httpMock.expectOne(`${environment.apiUrl}/auth/refresh`)
      .error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
    tick();

    // ✅ الأهم: مُعاد المحاولة تلقائياً، بدل الاستسلام الفوري كما كان قبل الإصلاح.
    httpMock.expectOne(`${environment.apiUrl}/auth/refresh`)
      .flush({ accessToken: fakeJwt(3600) });
    tick();
    drainHydrateProfile();

    expect(tokenStorage.getAccessToken()).not.toBeNull();
    expect(authService.currentUserSnapshot).not.toBeNull();
  }));

  // ────────────── نفس الجذر، بصيغة أخرى: خادم بطيء التشغيل من الخمول (Render cold start) ──────────────

  it('✅ تجاوز مهلة أول محاولة (خادم بطيء الإقلاع) ⇒ يُعاد المحاولة وتنجح الجلسة', fakeAsync(() => {
    run();
    tick();
    flushCsrf();
    tick();

    httpMock.expectOne(`${environment.apiUrl}/auth/refresh`);
    // لا نُطلق (flush) الطلب الأول إطلاقاً — نُقدّم الزمن الافتراضي لتجاوز مهلة 15 ثانية،
    // فتُلغيه عملية timeout()، ثم تبدأ محاولة ثانية.
    tick(16000);

    httpMock.expectOne(`${environment.apiUrl}/auth/refresh`)
      .flush({ accessToken: fakeJwt(3600) });
    tick();
    drainHydrateProfile();

    expect(tokenStorage.getAccessToken()).not.toBeNull();
    expect(authService.currentUserSnapshot).not.toBeNull();
  }));
});

describe('appConfig startup initializers', () => {
  it('does not block the first render on the /api/enums lookups (performance audit B5)', () => {
    // Every APP_INITIALIZER delays bootstrap until its promise settles. The enum lookups only feed the
    // property form, which awaits EnumService.ensureLoaded() itself, so no initializer may depend on it.
    const initializers = (appConfig.providers as Array<{ provide?: unknown; deps?: unknown[] }>)
      .filter(provider => provider.provide === APP_INITIALIZER);

    expect(initializers.length).toBeGreaterThan(0);
    for (const initializer of initializers) {
      expect(initializer.deps ?? []).not.toContain(EnumService);
    }
  });
});
