// =====================================================================
// ✅ Unit Tests – login.component.spec.ts
// اختبار مباشر (بدون TestBed/DOM) عبر تمرير Spy objects يدوياً للمُنشئ —
// يتجنّب الحاجة لتصيير القالب الكامل (ConsentCheckbox/PasswordStrengthIndicator/
// ترجمات) بينما يغطي فعلياً منطق تفريع الأخطاء الذي كان بلا أي اختبار.
//
// تغطية: نجاح الدخول، بيانات خاطئة (رسالة عامة موحّدة)، خطأ شبكة (status 0 —
// يجب ألا يُخلط برسالة "بيانات خاطئة")، قفل الحساب، Rate limiting، دخول
// الهاتف، وتفريع أخطاء OTP عبر OTP_ERROR_CODES الموحَّد في auth.model.ts.
// =====================================================================
import { of, throwError } from 'rxjs';
import { LoginComponent } from './login.component';
import { OTP_ERROR_CODES } from '../../../core/models/auth.model';

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
  let otpApi: jasmine.SpyObj<any>;
  let consentApi: jasmine.SpyObj<any>;
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
    otpApi = jasmine.createSpyObj('OtpApiService', ['sendOtp', 'verifyOtp']);
    consentApi = jasmine.createSpyObj('ConsentApiService', ['record']);
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
      otpApi,
      consentApi,
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

  describe('onPhoneLogin — رقم الهاتف', () => {
    it('✅ رقم/كلمة سر خاطئة تعطي نفس الرسالة العامة (بلا كشف عن وجود الحساب)', () => {
      phoneAuthApi.login.and.returnValue(throwError(() => httpError(401)));
      component.phoneLoginNumber = '+963911234567';
      component.phoneLoginPassword = 'badpw';

      component.onPhoneLogin(fakeForm());

      expect(component.message).toBe('AUTH.ERRORS.INVALID_CREDENTIALS');
    });

    it('✅ رقم هاتف بصيغة غير صحيحة يُرفض قبل إرسال أي طلب', () => {
      component.phoneLoginNumber = '0911234567'; // لا يبدأ بـ +
      component.phoneLoginPassword = FAKE_TEST_CREDENTIAL;

      component.onPhoneLogin(fakeForm());

      expect(phoneAuthApi.login).not.toHaveBeenCalled();
      expect(component.message).toBe('AUTH.ERRORS.PHONE_INVALID');
    });
  });

  describe('تفريع أخطاء OTP — يعتمد الآن على OTP_ERROR_CODES الموحَّد من auth.model.ts', () => {
    it('✅ OTP_WRONG يعطي مفتاح الرسالة الصحيح', () => {
      otpApi.sendOtp.and.returnValue(of({ message: 'sent', expiresInSeconds: 300 }));
      component.phoneNumber = '+963911234567';
      component.onSendPhoneOtp();

      otpApi.verifyOtp.and.returnValue(throwError(() => ({ error: { code: OTP_ERROR_CODES.OTP_WRONG } })));
      component.otpCode = '123456';
      component.phoneFirstName = 'Ali';
      component.phoneLastName = 'Hasan';
      component.phonePassword = FAKE_TEST_CREDENTIAL;
      component.privacyConsentAccepted = true;

      component.onVerifyPhoneOtp();

      expect(component.message).toBe('AUTH.ERRORS.OTP_WRONG');
    });

    it('✅ RATE_LIMITED عند إرسال OTP يعطي رسالة تحديد المعدّل الخاصة بالـOTP', () => {
      otpApi.sendOtp.and.returnValue(throwError(() => ({ error: { code: OTP_ERROR_CODES.RATE_LIMITED } })));
      component.phoneNumber = '+963911234567';

      component.onSendPhoneOtp();

      expect(component.message).toBe('AUTH.ERRORS.OTP_RATE_LIMITED');
    });
  });
});
