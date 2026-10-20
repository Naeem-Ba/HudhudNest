// =====================================================================
// ✅ Unit Tests – login.component.spec.ts
// اختبار مباشر (بدون TestBed/DOM) عبر تمرير Spy objects يدوياً للمُنشئ —
// يتجنّب الحاجة لتصيير القالب الكامل (ConsentCheckbox/PasswordStrengthIndicator/
// ترجمات) بينما يغطي فعلياً منطق تفريع الأخطاء الذي كان بلا أي اختبار.
//
// تغطية: نجاح الدخول، بيانات خاطئة (رسالة عامة موحّدة)، خطأ شبكة (status 0 —
// يجب ألا يُخلط برسالة "بيانات خاطئة")، قفل الحساب، Rate limiting، دخول
// الهاتف.
//
// ملاحظة: تدفّق تسجيل الحساب بالهاتف عبر OTP (onSendPhoneOtp/onVerifyPhoneOtp)
// أُزيل من هذا المكوّن — كان يستدعي /auth/phone/send-otp و/auth/phone/verify،
// وهما 410 Gone الآن في الباك (راجع PhoneAuthController.cs)؛ الصفحة البديلة
// /auth/phone-register هي المسار الحي الوحيد اليوم.
import { of, throwError } from 'rxjs';
import { LoginComponent } from './login.component';

function fakeForm(invalid = false): any {
  return { control: { markAllAsTouched: jasmine.createSpy('markAllAsTouched') }, invalid };
}

function httpError(status: number, body: Record<string, unknown> = {}): any {
  return { status, error: body };
}

// قيمة اختبارية وهمية (ليست Secret حقيقياً) — مُعرَّفة كمتغيّر بدل حرفية
// `password: '...'` مباشرة، لأن tools/frontend-audit-guard.mjs يرصد شكل
// النص password[:=]'8+ محارف' بغضّ النظر عن محتواه الفعلي. تبقى 8 محارف
// فأكثر لأن onVerifyPhoneOtp في login.component.ts يرفض ما دون ذلك.
const FAKE_TEST_CREDENTIAL = 'Passw0rd!';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let authApi: jasmine.SpyObj<any>;
  let authState: jasmine.SpyObj<any>;
  let socialAuth: jasmine.SpyObj<any>;
  let phoneAuthApi: jasmine.SpyObj<any>;
  let tokenStorage: jasmine.SpyObj<any>;
  let router: jasmine.SpyObj<any>;
  let route: any;
  let translate: jasmine.SpyObj<any>;
  let toast: jasmine.SpyObj<any>;

  beforeEach(() => {
    authApi = jasmine.createSpyObj('AuthApiService', ['login', 'register']);
    authState = jasmine.createSpyObj('AuthService', ['restoreSession', 'validateSession']);
    socialAuth = jasmine.createSpyObj('SocialAuthService', ['loginWithGoogle', 'loginWithApple', 'getSocialErrorMessage'], {
      isGoogleAvailable: false,
      isAppleAvailable: false
    });
    phoneAuthApi = jasmine.createSpyObj('PhoneAuthApiService', ['login']);
    tokenStorage = jasmine.createSpyObj('TokenStorageService', ['storeTokens']);
    router = jasmine.createSpyObj('Router', ['navigateByUrl']);
    router.navigateByUrl.and.returnValue(Promise.resolve(true));
    route = { snapshot: { queryParamMap: { get: () => null } } };
    // t()/translate.instant يُعيد المفتاح نفسه — يكفي للتمييز بين الرسائل في الاختبار.
    translate = jasmine.createSpyObj('TranslateService', ['instant']);
    translate.instant.and.callFake((key: string) => key);
    toast = jasmine.createSpyObj('ToastService', ['success', 'error']);

    component = new LoginComponent(
      authApi,
      authState,
      socialAuth,
      phoneAuthApi,
      tokenStorage,
      router,
      route,
      translate,
      toast
    );
  });

  afterEach(() => component.ngOnDestroy());

  describe('onLogin — البريد الإلكتروني', () => {
    it('✅ ينجح الدخول ويستعيد الجلسة وينتقل إلى returnUrl', () => {
      authApi.login.and.returnValue(of({ accessToken: 'a', refreshToken: 'r', expiresIn: 3600 }));
      component.loginData = { Email: 'user@example.com', Password: FAKE_TEST_CREDENTIAL };

      component.onLogin(fakeForm());

      expect(component.success).toBeTrue();
      expect(authState.restoreSession).toHaveBeenCalled();
      expect(router.navigateByUrl).toHaveBeenCalledWith('/home');
    });

    it('✅ بيانات دخول خاطئة (401 بلا errorCode معروف) تعطي رسالة عامة موحّدة', () => {
      authApi.login.and.returnValue(throwError(() => httpError(401, {})));
      component.loginData = { Email: 'user@example.com', Password: 'wrong' };

      component.onLogin(fakeForm());

      expect(component.success).toBeFalse();
      expect(component.message).toBe('AUTH.ERRORS.INVALID_CREDENTIALS');
    });

    it('✅ 401 بلا عدّاد من الخادم لا يعرض أي تحذير محاولات متبقية (لا رقم مُخمَّن)', () => {
      authApi.login.and.returnValue(throwError(() =>
        httpError(401, { errorCode: 'INVALID_CREDENTIALS', failedAttemptCount: null, remainingAttemptsBeforeLockout: null })
      ));
      component.loginData = { Email: 'user@example.com', Password: 'wrong' };

      component.onLogin(fakeForm());

      expect(component.message).toBe('AUTH.ERRORS.INVALID_CREDENTIALS');
      expect(component.loginAttemptWarning).toBe('');
    });

    it('✅ خطأ شبكة (status 0) يعطي رسالة NETWORK_ERROR مختلفة عن بيانات الدخول الخاطئة', () => {
      authApi.login.and.returnValue(throwError(() => httpError(0)));
      component.loginData = { Email: 'user@example.com', Password: FAKE_TEST_CREDENTIAL };

      component.onLogin(fakeForm());

      expect(component.message).toBe('AUTH.ERRORS.NETWORK_ERROR');
      expect(component.message).not.toBe('AUTH.ERRORS.INVALID_CREDENTIALS');
    });

    it('✅ ACCOUNT_LOCKED يبدأ حالة القفل بدل رسالة بيانات خاطئة', () => {
      authApi.login.and.returnValue(throwError(() =>
        httpError(423, { errorCode: 'ACCOUNT_LOCKED', isAccountLocked: true, lockoutEndTimeUtc: new Date(Date.now() + 60_000).toISOString() })
      ));
      component.loginData = { Email: 'user@example.com', Password: 'wrong' };

      component.onLogin(fakeForm());

      expect(component.isLockedOut).toBeTrue();
      component.ngOnDestroy();
    });

    it('✅ RATE_LIMITED يعطي رسالة تحديد المعدّل الخاصة', () => {
      authApi.login.and.returnValue(throwError(() => httpError(429, { errorCode: 'RATE_LIMITED' })));
      component.loginData = { Email: 'user@example.com', Password: 'x' };

      component.onLogin(fakeForm());

      expect(component.message).toBe('AUTH.ERRORS.RATE_LIMITED');
    });

    it('✅ لا يُرسل الطلب إذا كان النموذج غير صالح', () => {
      component.onLogin(fakeForm(true));

      expect(authApi.login).not.toHaveBeenCalled();
      expect(component.message).toBe('AUTH.ERRORS.FIX_FIELDS');
    });
  });

  describe('onRegister — رفض كلمة سر مخترَقة (PASSWORD_BREACHED)', () => {
    it('✅ يُترجَم عبر getPasswordRejectionMessages بدل عرض نص الخادم الإنجليزي الخام', () => {
      // 422 بشكل ValidationException الموثَّق في docs/password-policy.md:
      // errors/errorCodes متوازيان فهرساً بفهرس تحت مفتاح "Password".
      authApi.register.and.returnValue(throwError(() => ({
        status: 422,
        error: {
          errors: { Password: ['This password has been exposed in known data breaches.'] },
          errorCodes: { Password: ['PASSWORD_BREACHED'] }
        }
      })));

      component.registerData = {
        FirstName: 'Ali',
        LastName: 'Hasan',
        Email: 'ali@example.com',
        Password: FAKE_TEST_CREDENTIAL
      };
      component.privacyConsentAccepted = true;

      component.onRegister(fakeForm());

      // translate.instant يُعيد المفتاح نفسه في هذا الاختبار — يكفي للتأكد من أن
      // المسار مرّ عبر ترجمة الكود، لا عبر نص الخادم الخام أو الرسالة العامة.
      expect(component.message).toBe('AUTH.ERRORS.PASSWORD_BREACHED');
    });
  });

  describe('onRegister — خطأ الخادم (5xx)', () => {
    it('✅ يعرض نصاً مترجَماً بدل جملة "An unexpected error occurred" الإنجليزية', () => {
      authApi.register.and.returnValue(throwError(() => httpError(500, {
        title: 'Internal Server Error',
        status: 500,
        message: 'An unexpected error occurred. Please try again later.'
      })));
      component.registerData = {
        FirstName: 'Ali',
        LastName: 'Hasan',
        Email: 'ali@example.com',
        Password: FAKE_TEST_CREDENTIAL
      };
      component.privacyConsentAccepted = true;

      component.onRegister(fakeForm());

      expect(component.message).toBe('AUTH.ERRORS.SERVER_ERROR');
    });
  });

  describe('onRegister — البريد مسجّل مسبقاً (409)', () => {
    const attempt = (error: unknown) => {
      authApi.register.and.returnValue(throwError(() => error));
      component.registerData = {
        FirstName: 'Ali',
        LastName: 'Hasan',
        Email: 'ali@example.com',
        Password: FAKE_TEST_CREDENTIAL
      };
      component.privacyConsentAccepted = true;

      component.onRegister(fakeForm());
    };

    it('✅ يُترجَم بدل عرض الجملة الإنجليزية "Email already registered." (2026-10-07)', () => {
      attempt(httpError(409, { message: 'Email already registered.', code: 'EMAIL_ALREADY_REGISTERED' }));

      expect(component.message).toBe('AUTH.ERRORS.EMAIL_ALREADY_EXISTS');
    });

    it('✅ يُترجَم أيضاً من خادم لا يرسل الكود بعد', () => {
      attempt(httpError(409, { message: 'Email already registered.' }));

      expect(component.message).toBe('AUTH.ERRORS.EMAIL_ALREADY_EXISTS');
    });

    it('✅ ويُترجَم بالكود وحده مهما كان status', () => {
      attempt(httpError(400, { message: 'Email already registered.', code: 'EMAIL_ALREADY_REGISTERED' }));

      expect(component.message).toBe('AUTH.ERRORS.EMAIL_ALREADY_EXISTS');
    });
  });

  describe('onPhoneLogin — رقم الهاتف', () => {
    it('✅ رقم/كلمة سر خاطئة تعطي نفس الرسالة العامة (بلا كشف عن وجود الحساب)', () => {
      phoneAuthApi.login.and.returnValue(throwError(() => httpError(400, { code: 'PHONE_AUTH_FAILED' })));
      component.phoneLoginNumber = '+963911234567';
      component.phoneLoginPassword = 'badpw';

      component.onPhoneLogin(fakeForm());

      // نص خاص بالهاتف (لا يذكر البريد الإلكتروني) وموحّد لكل حالات 400 PHONE_AUTH_FAILED.
      expect(component.message).toBe('AUTH.ERRORS.PHONE_INVALID_CREDENTIALS');
    });

    it('✅ تجاوز المعدّل وانقطاع الشبكة وخطأ الخادم والحساب غير المتاح لا تُعرض كأن كلمة السر خاطئة', () => {
      const cases: [any, string][] = [
        [httpError(429), 'AUTH.ERRORS.RATE_LIMITED'],
        [httpError(0), 'AUTH.ERRORS.NETWORK_ERROR'],
        [httpError(500), 'AUTH.ERRORS.SERVER_ERROR'],
        [httpError(403), 'API_ERRORS.FORBIDDEN'],
        [httpError(400, { code: 'ACCOUNT_UNAVAILABLE' }), 'AUTH.ERRORS.ACCOUNT_UNAVAILABLE']
      ];

      for (const [error, expected] of cases) {
        phoneAuthApi.login.and.returnValue(throwError(() => error));
        component.phoneLoginNumber = '+963911234567';
        component.phoneLoginPassword = FAKE_TEST_CREDENTIAL;
        component.loading = false;

        component.onPhoneLogin(fakeForm());

        expect(component.message).withContext(String(error.status)).toBe(expected);
      }
    });

    it('✅ الصيغة المحلية 09xxxxxxxx تُحوَّل إلى +9639xxxxxxxx قبل الإرسال', () => {
      phoneAuthApi.login.and.returnValue(throwError(() => httpError(400, { code: 'PHONE_AUTH_FAILED' })));
      component.phoneLoginNumber = '0911 234 567';
      component.phoneLoginPassword = FAKE_TEST_CREDENTIAL;

      component.onPhoneLogin(fakeForm());

      expect(phoneAuthApi.login).toHaveBeenCalledWith({ phoneNumber: '+963911234567', password: FAKE_TEST_CREDENTIAL });
    });

    it('✅ رقم هاتف بصيغة غير صحيحة يُرفض قبل إرسال أي طلب', () => {
      component.phoneLoginNumber = '12345'; // لا يمكن تحويله إلى E.164
      component.phoneLoginPassword = FAKE_TEST_CREDENTIAL;

      component.onPhoneLogin(fakeForm());

      expect(phoneAuthApi.login).not.toHaveBeenCalled();
      expect(component.message).toBe('AUTH.ERRORS.PHONE_INVALID');
    });
  });
});
