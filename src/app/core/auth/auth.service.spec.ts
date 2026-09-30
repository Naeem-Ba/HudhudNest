// =====================================================================
// ✅ Unit Tests – auth.service.spec.ts
// تغطية: بناء حالة المستخدم من التوكن (validateSession)، معالجة التوكنات
// المنتهية/التالفة/المفقودة، login/logout، تحديث المستخدم الحالي.
//
// هذه الخدمة تُعتبر "حرجة" لأن أي خلل بها يعطّل تسجيل الدخول بالكامل —
// كل الصفحات المحمية بـAuthGuard تعتمد على isLoggedIn$/currentUser$ هنا.
// =====================================================================
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { AuthApiService } from './auth-api.service';
import { TokenStorageService } from '../services/token-storage.service';

/**
 * يبني توكن JWT شكليًا صالحًا للاختبار (header.payload.signature)،
 * كافيًا لتمرير decodeJwt() الخاصة بالخدمة (تتوقع فقط أن الجزء الثاني
 * base64 صالح يحتوي JSON). التوقيع نفسه غير مُتحقَّق منه بالواجهة
 * الأمامية أصلًا (التحقق الحقيقي من التوقيع مسؤولية الباك اند)، فقيمته
 * هنا وهمية بالكامل.
 */
function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.fake-signature`;
}

describe('AuthService', () => {
  let service: AuthService;
  let tokenStorage: TokenStorageService;
  let authApiSpy: jasmine.SpyObj<AuthApiService>;

  beforeEach(() => {
    authApiSpy = jasmine.createSpyObj('AuthApiService', ['logout']);

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthApiService, useValue: authApiSpy }
      ]
    });

    tokenStorage = TestBed.inject(TokenStorageService);
    tokenStorage.setAccessToken(null);
  });

  // ────────────── لا يوجد توكن ──────────────

  it('✅ لا يوجد توكن مخزَّن ⇒ حالة مجهول (غير مسجَّل دخول)', () => {
    // AuthService.constructor يستدعي validateSession() تلقائيًا
    service = TestBed.inject(AuthService);

    expect(service.currentUserSnapshot).toBeNull();
    let loggedIn: boolean | undefined;
    service.isLoggedIn$.subscribe(v => (loggedIn = v));
    expect(loggedIn).toBeFalse();
  });

  it('✅ توكن بقيمة نصية "undefined"/"null" يُعامَل كأنه لا يوجد توكن', () => {
    tokenStorage.setAccessToken('undefined');
    service = TestBed.inject(AuthService);

    expect(service.currentUserSnapshot).toBeNull();
  });

  // ────────────── توكن تالف ──────────────

  it('✅ توكن تالف (ليس JWT صالح) ⇒ يُمسح ويصير المستخدم مجهول', () => {
    tokenStorage.setAccessToken('this-is-not-a-jwt-at-all');
    service = TestBed.inject(AuthService);

    expect(service.currentUserSnapshot).toBeNull();
    // ✅ الأهم: التوكن التالف يُمسح من التخزين، لا يبقى عالقًا
    expect(tokenStorage.getAccessToken()).toBeNull();
  });

  // ────────────── توكن منتهي الصلاحية ──────────────

  it('✅ توكن منتهي الصلاحية (exp بالماضي) ⇒ يُمسح ويصير المستخدم مجهول', () => {
    const expiredSecondsAgo = Math.floor(Date.now() / 1000) - 3600; // منذ ساعة
    const token = makeJwt({
      sub: 'user-1',
      email: 'test@example.com',
      exp: expiredSecondsAgo
    });
    tokenStorage.setAccessToken(token);

    service = TestBed.inject(AuthService);

    expect(service.currentUserSnapshot).toBeNull();
    expect(tokenStorage.getAccessToken()).toBeNull();
  });

  // ────────────── توكن صالح ──────────────

  it('✅ توكن صالح غير منتهٍ ⇒ يبني حالة المستخدم بشكل صحيح', () => {
    const expiresInFuture = Math.floor(Date.now() / 1000) + 3600; // خلال ساعة
    const token = makeJwt({
      sub: 'user-42',
      email: 'naeem@example.com',
      name: 'Naeem',
      role: 'Admin',
      exp: expiresInFuture
    });
    tokenStorage.setAccessToken(token);

    service = TestBed.inject(AuthService);

    const user = service.currentUserSnapshot;
    expect(user).not.toBeNull();
    expect(user?.id).toBe('user-42');
    expect(user?.Id).toBe('user-42');
    expect(user?.email).toBe('naeem@example.com');
    expect(user?.displayName).toBe('Naeem');
    expect(user?.roles).toEqual(['Admin']);

    let loggedIn: boolean | undefined;
    service.isLoggedIn$.subscribe(v => (loggedIn = v));
    expect(loggedIn).toBeTrue();
  });

  it('✅ توكن HudhudNestApi الفعلي (أسماء claims بصيغة URI الكاملة) ⇒ يُقرأ المعرّف والبريد', () => {
    // نفس شكل التوكن الذي يصدره TokenService في الباك اند (ClaimTypes.*).
    const token = makeJwt({
      'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier': '3fe4a0b1-2121-43d6-90df-2d8bf15a2c65',
      'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress': 'renter@example.com',
      'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name': 'renter@example.com',
      'http://schemas.microsoft.com/ws/2008/06/identity/claims/role': 'User',
      exp: Math.floor(Date.now() / 1000) + 3600
    });
    tokenStorage.setAccessToken(token);

    service = TestBed.inject(AuthService);

    expect(service.getCurrentUserId()).toBe('3fe4a0b1-2121-43d6-90df-2d8bf15a2c65');
    expect(service.currentUserSnapshot?.email).toBe('renter@example.com');
    expect(service.currentUserSnapshot?.roles).toEqual(['User']);
  });

  it('✅ التوكن بلا exp ⇒ يُعامَل كصالح (لا انتهاء صلاحية معروف)', () => {
    const token = makeJwt({ sub: 'user-7', email: 'no-exp@example.com' });
    tokenStorage.setAccessToken(token);

    service = TestBed.inject(AuthService);

    expect(service.currentUserSnapshot?.id).toBe('user-7');
  });

  // ────────────── extractRoles: صيغ متعددة ──────────────

  it('✅ roles كمصفوفة تُقرأ كما هي', () => {
    const token = makeJwt({ sub: 'u1', roles: ['Admin', 'Owner'] });
    tokenStorage.setAccessToken(token);
    service = TestBed.inject(AuthService);

    expect(service.currentUserSnapshot?.roles).toEqual(['Admin', 'Owner']);
  });

  it('✅ role كنص مفرد يتحول لمصفوفة من عنصر واحد', () => {
    const token = makeJwt({ sub: 'u1', role: 'User' });
    tokenStorage.setAccessToken(token);
    service = TestBed.inject(AuthService);

    expect(service.currentUserSnapshot?.roles).toEqual(['User']);
  });

  it('✅ عدم وجود أي claim للأدوار ⇒ مصفوفة فارغة (وليس خطأ)', () => {
    const token = makeJwt({ sub: 'u1' });
    tokenStorage.setAccessToken(token);
    service = TestBed.inject(AuthService);

    expect(service.currentUserSnapshot?.roles).toEqual([]);
  });

  // ────────────── isAdmin$ ──────────────

  it('✅ isAdmin$ يكون true فقط إذا roles تحتوي "Admin"', () => {
    const token = makeJwt({ sub: 'u1', role: 'Admin' });
    tokenStorage.setAccessToken(token);
    service = TestBed.inject(AuthService);

    let isAdmin: boolean | undefined;
    service.isAdmin$.subscribe(v => (isAdmin = v));
    expect(isAdmin).toBeTrue();
  });

  it('✅ isAdmin$ يكون false لمستخدم بدور غير Admin', () => {
    const token = makeJwt({ sub: 'u1', role: 'User' });
    tokenStorage.setAccessToken(token);
    service = TestBed.inject(AuthService);

    let isAdmin: boolean | undefined;
    service.isAdmin$.subscribe(v => (isAdmin = v));
    expect(isAdmin).toBeFalse();
  });

  // ────────────── login() ──────────────

  it('✅ login() يقرأ accessToken بأي من الصيغتين (camelCase/PascalCase)', () => {
    service = TestBed.inject(AuthService);
    const expiresInFuture = Math.floor(Date.now() / 1000) + 3600;
    const token = makeJwt({ sub: 'u9', exp: expiresInFuture });

    service.login({ AccessToken: token, RefreshToken: 'r-1' });

    expect(tokenStorage.getAccessToken()).toBe(token);
    expect(service.currentUserSnapshot?.id).toBe('u9');
  });

  it('✅ login() باستجابة بلا accessToken ⇒ لا يغيّر حالة تسجيل الدخول', () => {
    service = TestBed.inject(AuthService);
    service.login({});

    expect(service.currentUserSnapshot).toBeNull();
  });

  // ────────────── logout / logoutLocal ──────────────

  it('✅ logoutLocal() يمسح التوكن وحالة المستخدم فورًا (بدون نداء API)', () => {
    const token = makeJwt({ sub: 'u1', exp: Math.floor(Date.now() / 1000) + 3600 });
    tokenStorage.setAccessToken(token);
    service = TestBed.inject(AuthService);
    expect(service.currentUserSnapshot).not.toBeNull();

    service.logoutLocal();

    expect(service.currentUserSnapshot).toBeNull();
    expect(tokenStorage.getAccessToken()).toBeNull();
    expect(authApiSpy.logout).not.toHaveBeenCalled();
  });

  // ────────────── logout() — Phase 1: يمسح الحالة المحلية حتى عند فشل نداء API ──────────────
  // كان clearSession() يُستدعى فقط ضمن tap (مسار النجاح)، فبقيت الحالة المحلية (التوكن،
  // كاش البروفايل) عالقة إن فشل POST /auth/logout — رغم أن navbar.component.ts يتنقّل بعيداً
  // بغضّ النظر عن النتيجة، فيبدو الأمر للمستخدم كتسجيل خروج ناجح بينما الحالة لم تُمسح فعلاً.
  describe('logout()', () => {
    it('✅ عند نجاح نداء API: يمسح التوكن وحالة المستخدم', () => {
      const token = makeJwt({ sub: 'u1', exp: Math.floor(Date.now() / 1000) + 3600 });
      tokenStorage.setAccessToken(token);
      authApiSpy.logout.and.returnValue(of(undefined));
      service = TestBed.inject(AuthService);

      service.logout().subscribe();

      expect(service.currentUserSnapshot).toBeNull();
      expect(tokenStorage.getAccessToken()).toBeNull();
    });

    it('✅ عند فشل نداء API: يمسح التوكن وحالة المستخدم محلياً رغم ذلك، ويُعيد بثّ الخطأ', () => {
      const token = makeJwt({ sub: 'u1', exp: Math.floor(Date.now() / 1000) + 3600 });
      tokenStorage.setAccessToken(token);
      authApiSpy.logout.and.returnValue(throwError(() => new Error('network down')));
      service = TestBed.inject(AuthService);
      expect(service.currentUserSnapshot).not.toBeNull();

      let receivedError: unknown;
      service.logout().subscribe({ error: err => (receivedError = err) });

      // ✅ الأهم: الحالة المحلية تُمسح حتى مع فشل الـ API — لا تبقى جلسة "شبه منتهية" عالقة.
      expect(service.currentUserSnapshot).toBeNull();
      expect(tokenStorage.getAccessToken()).toBeNull();
      expect(receivedError).toBeTruthy();
    });
  });

  // ────────────── updateCurrentUser ──────────────

  it('✅ updateCurrentUser(null) يعيد الحالة لمجهول', () => {
    const token = makeJwt({ sub: 'u1', exp: Math.floor(Date.now() / 1000) + 3600 });
    tokenStorage.setAccessToken(token);
    service = TestBed.inject(AuthService);

    service.updateCurrentUser(null);

    expect(service.currentUserSnapshot).toBeNull();
  });

  it('✅ updateCurrentUser() بتحديث جزئي يحافظ على الحقول غير المُرسَلة', () => {
    const token = makeJwt({
      sub: 'u1',
      email: 'old@example.com',
      name: 'Old Name',
      exp: Math.floor(Date.now() / 1000) + 3600
    });
    tokenStorage.setAccessToken(token);
    service = TestBed.inject(AuthService);

    service.updateCurrentUser({ displayName: 'New Name' });

    const user = service.currentUserSnapshot;
    expect(user?.displayName).toBe('New Name');
    // ✅ الإيميل ما انبعث بالتحديث الجزئي، لازم يضل محفوظ من الحالة السابقة
    expect(user?.email).toBe('old@example.com');
  });

  // ────────────── getCurrentUserId ──────────────

  it('✅ getCurrentUserId() يُرجع null إذا لا يوجد مستخدم حالي', () => {
    service = TestBed.inject(AuthService);
    expect(service.getCurrentUserId()).toBeNull();
  });

  it('✅ getCurrentUserId() يُرجع id المستخدم الحالي', () => {
    const token = makeJwt({ sub: 'u123', exp: Math.floor(Date.now() / 1000) + 3600 });
    tokenStorage.setAccessToken(token);
    service = TestBed.inject(AuthService);

    expect(service.getCurrentUserId()).toBe('u123');
  });

  // ────────────── hydrateProfile — إصلاح: DisplayName/ImageUrl لا يرتدّان لقيم التوكن ──────────────
  // التوكن نفسه لا يحمل رابط صورة إطلاقاً، ويحمل بحقل "name" اسم المستخدم
  // (Identity UserName) لا "الاسم المعروض" الفعلي. validateSession() كانت
  // تبني الحالة من هذه القيم فقط وتتجاهل GET /users/me بالكامل، فيظهر أي
  // تعديل في صفحة البروفايل وكأنه "لم يُحفَظ" بعد أي إعادة تحميل/تجديد جلسة.
  describe('hydrateProfile (تصحيح DisplayName/ImageUrl من GET /users/me)', () => {
    let httpMock: HttpTestingController;

    beforeEach(() => {
      httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => httpMock.verify());

    it('✅ يستبدل الاسم المؤقت من التوكن ويضيف رابط الصورة من /users/me', () => {
      const token = makeJwt({
        sub: 'u1',
        email: 'naeem@example.com',
        name: 'naeem@example.com', // Identity UserName — placeholder فقط
        exp: Math.floor(Date.now() / 1000) + 3600
      });
      tokenStorage.setAccessToken(token);
      service = TestBed.inject(AuthService);

      // فورًا بعد الحقن: القيمة المؤقتة من التوكن فقط، بلا صورة.
      expect(service.currentUserSnapshot?.displayName).toBe('naeem@example.com');
      expect(service.currentUserSnapshot?.ImageUrl).toBeUndefined();

      httpMock.expectOne(`${environment.apiUrl}/users/me`).flush({
        id: 'u1',
        displayName: 'نعيم الحقيقي',
        email: 'naeem@example.com',
        imageUrl: 'https://cdn.example.com/avatar.png'
      });

      // ✅ بعد وصول الاستجابة: الاسم الحقيقي المحفوظ + رابط الصورة، بلا ارتداد.
      expect(service.currentUserSnapshot?.displayName).toBe('نعيم الحقيقي');
      expect(service.currentUserSnapshot?.ImageUrl).toBe('https://cdn.example.com/avatar.png');
      // id/email/roles تبقى كما بُنيت من التوكن — لا تُستبدَل بهذا الإثراء.
      expect(service.currentUserSnapshot?.id).toBe('u1');
    });

    it('✅ فشل GET /users/me لا يعطّل تسجيل الدخول — يبقى الاسم المؤقت من التوكن', () => {
      const token = makeJwt({
        sub: 'u2',
        email: 'x@example.com',
        name: 'x@example.com',
        exp: Math.floor(Date.now() / 1000) + 3600
      });
      tokenStorage.setAccessToken(token);
      service = TestBed.inject(AuthService);

      httpMock
        .expectOne(`${environment.apiUrl}/users/me`)
        .flush({ message: 'error' }, { status: 500, statusText: 'Server Error' });

      expect(service.currentUserSnapshot?.displayName).toBe('x@example.com');
      let loggedIn: boolean | undefined;
      service.isLoggedIn$.subscribe(v => (loggedIn = v));
      expect(loggedIn).toBeTrue();
    });

    // AuthGuard يستدعي validateSession() في كل تنقّل محمي؛ كانت تُعيد بناء المستخدم من
    // التوكن وحده فتختفي الصورة (وتظهر الحروف مكانها) حتى يصل /users/me التالي.
    it('✅ validateSession() لنفس المستخدم يُبقي الصورة والاسم المعروض حتى يصل الجلب الجديد', () => {
      const token = makeJwt({
        sub: 'u5',
        email: 'img@example.com',
        name: 'img@example.com',
        exp: Math.floor(Date.now() / 1000) + 3600
      });
      tokenStorage.setAccessToken(token);
      service = TestBed.inject(AuthService);

      httpMock.expectOne(`${environment.apiUrl}/users/me`).flush({
        id: 'u5',
        displayName: 'صاحب الصورة',
        imageUrl: 'https://cdn.example.com/u5.png'
      });

      const seen: (string | null | undefined)[] = [];
      service.currentUser$.subscribe(u => seen.push(u?.ImageUrl));

      service.validateSession(); // ما يفعله AuthGuard عند كل تنقّل

      // لا توجد لحظة بلا صورة قبل وصول الجلب الجديد.
      expect(seen.every(url => url === 'https://cdn.example.com/u5.png')).toBeTrue();
      expect(service.currentUserSnapshot?.displayName).toBe('صاحب الصورة');

      httpMock.expectOne(`${environment.apiUrl}/users/me`).flush({
        id: 'u5',
        displayName: 'صاحب الصورة',
        imageUrl: 'https://cdn.example.com/u5-new.png'
      });
      expect(service.currentUserSnapshot?.ImageUrl).toBe('https://cdn.example.com/u5-new.png');
    });

    it('✅ مستخدم مختلف في نفس التبويب لا يرث صورة/اسم المستخدم السابق', () => {
      tokenStorage.setAccessToken(makeJwt({ sub: 'a1', email: 'a@example.com', exp: Math.floor(Date.now() / 1000) + 3600 }));
      service = TestBed.inject(AuthService);
      httpMock.expectOne(`${environment.apiUrl}/users/me`).flush({ id: 'a1', displayName: 'A', imageUrl: 'https://cdn.example.com/a.png' });

      tokenStorage.setAccessToken(makeJwt({ sub: 'b2', email: 'b@example.com', exp: Math.floor(Date.now() / 1000) + 3600 }));
      service.validateSession();

      expect(service.currentUserSnapshot?.id).toBe('b2');
      expect(service.currentUserSnapshot?.ImageUrl).toBeUndefined();
      expect(service.currentUserSnapshot?.displayName).toBe('b@example.com');
      httpMock.expectOne(`${environment.apiUrl}/users/me`).flush({ id: 'b2', displayName: 'B' });
    });
  });

  // ────────────── طريقة تسجيل الدخول (بريد/هاتف) لعرض المعرّف الصحيح في القائمة ──────────────
  describe('rememberLoginMethod / loginMethod', () => {
    afterEach(() => localStorage.removeItem('auth.loginMethod'));

    it('✅ تُحفَظ الطريقة وتبقى بعد إعادة بناء الخدمة (إعادة تحميل الصفحة)', () => {
      service = TestBed.inject(AuthService);
      service.rememberLoginMethod('phone');

      expect(service.loginMethod).toBe('phone');
      expect(localStorage.getItem('auth.loginMethod')).toBe('phone');
    });

    it('✅ قيمة غير معروفة في التخزين تُعامَل كغير محدَّدة', () => {
      localStorage.setItem('auth.loginMethod', 'fax');
      service = TestBed.inject(AuthService);

      expect(service.loginMethod).toBeNull();
    });

    it('✅ تسجيل الخروج يمسح الطريقة المحفوظة', () => {
      service = TestBed.inject(AuthService);
      service.rememberLoginMethod('email');

      service.logoutLocal();

      expect(service.loginMethod).toBeNull();
    });
  });

  // ────────────── authStatus$ / sessionExpired$ ──────────────
  // إضافية فوق isLoggedIn$/currentUser$ الحاليين (لا تُغيّرهما) — راجع تعليق
  // AuthStatus في auth.service.ts لسبب وجودها.
  describe('authStatus$ و sessionExpired$', () => {
    it('✅ بلا توكن: authStatus$ يبدأ بـ anonymous', () => {
      service = TestBed.inject(AuthService);

      let status: string | undefined;
      service.authStatus$.subscribe(v => (status = v));

      expect(status).toBe('anonymous');
    });

    it('✅ beginSessionRefresh يجعل authStatus$ يصير sessionRefreshing حتى مع توكن صالح', () => {
      const token = makeJwt({ sub: 'u3', email: 'r@example.com', exp: Math.floor(Date.now() / 1000) + 3600 });
      tokenStorage.setAccessToken(token);
      service = TestBed.inject(AuthService);
      TestBed.inject(HttpTestingController).match(`${environment.apiUrl}/users/me`)
        .forEach(r => r.flush({}, { status: 500, statusText: 'Server Error' }));

      let status: string | undefined;
      service.authStatus$.subscribe(v => (status = v));
      expect(status).toBe('authenticated');

      service.beginSessionRefresh();
      expect(status).toBe('sessionRefreshing');

      service.endSessionRefresh();
      expect(status).toBe('authenticated');
    });

    it('✅ notifySessionExpired يطلق sessionExpired$ مرة واحدة ويعيد authStatus$ إلى anonymous', () => {
      const token = makeJwt({ sub: 'u4', email: 'e@example.com', exp: Math.floor(Date.now() / 1000) + 3600 });
      tokenStorage.setAccessToken(token);
      service = TestBed.inject(AuthService);
      TestBed.inject(HttpTestingController).match(`${environment.apiUrl}/users/me`)
        .forEach(r => r.flush({}, { status: 500, statusText: 'Server Error' }));

      let expiredCount = 0;
      service.sessionExpired$.subscribe(() => expiredCount++);
      service.beginSessionRefresh();

      service.notifySessionExpired();

      expect(expiredCount).toBe(1);
      let status: string | undefined;
      service.authStatus$.subscribe(v => (status = v));
      // notifySessionExpired لا يُنهي الجلسة بنفسها (ذاك عمل clearAndRedirect/logout)،
      // فقط توقف علم "جارٍ التجديد" وتُطلق الحدث — الحالة المستقرة تعتمد على
      // isLoggedIn$ كما هي.
      expect(status).toBe('authenticated');
    });
  });
});
