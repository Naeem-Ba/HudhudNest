import { Component, OnDestroy } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { AuthApiService } from '../../../core/auth/auth-api.service';
import { SocialAuthService } from '../../../core/auth/social-auth.service';
import { PhoneAuthApiService } from '../../../core/auth/phone-auth-api.service';
import { AuthTokenResponse, TokenStorageService } from '../../../core/services/token-storage.service';
import { AuthService } from '../../../core/auth/auth.service';
import { OtpApiService } from '../../../core/api/otp-api.service';
import {
  LOGIN_ERROR_CODES,
  LoginFailure,
  OtpPurpose,
  VerifyOtpRequest,
  lockoutMinutesRemaining,
  parseLoginFailure
} from '../../../core/models/auth.model';
import { ToastService } from '../../../shared/services/toast.service';
import { ImageFallbackDirective } from '../../../shared/directives/image-fallback.directive';
import { PasswordStrengthIndicatorComponent } from '../../../shared/ui/password-strength-indicator.component';

interface LoginFormModel {
  Email: string;
  Password: string;
}

interface RegisterFormModel {
  FirstName: string;
  LastName: string;
  Email: string;
  Password: string;
}

type AuthMode = 'email' | 'phone';
type PhoneStep = 'phone' | 'otp';

/**
 * أكواد الأخطاء القادمة من PhoneAuthController.
 * ملاحظة توثيقية: ErrorResponse هو DTO مسمّى وليس كائناً مجهولاً، لذا
 * وفق اتفاقية التسمية الموثّقة في PROJECT-REFERENCE.md (قسم 7)، من
 * المتوقع أن يُسلسَل بصيغة PascalCase ("Code"/"Message") وليس camelCase،
 * على عكس أخطاء AuthController الأصلية (كائنات مجهولة → camelCase).
 * getOtpErrorCode() أدناه يقرأ كلا الشكلين دفاعياً حتى يتم تأكيد
 * الشكل الفعلي من الشبكة.
 */
const OTP_ERROR_CODES = {
  RATE_LIMITED: 'RATE_LIMITED',
  SMS_FAILED: 'SMS_FAILED',
  OTP_STORE_FAILED: 'OTP_STORE_FAILED',
  OTP_NOT_FOUND: 'OTP_NOT_FOUND',
  OTP_INVALID: 'OTP_INVALID',
  OTP_WRONG: 'OTP_WRONG',
  OTP_ALREADY_USED: 'OTP_ALREADY_USED',
  ROLE_ASSIGNMENT_FAILED: 'ROLE_ASSIGNMENT_FAILED',
  USER_CREATE_FAILED: 'USER_CREATE_FAILED',
  PHONE_AUTH_FAILED: 'PHONE_AUTH_FAILED',
  // NEW — يتطلب endpoint /auth/phone/verify المُعاد تصميمه (راجع phone-auth-backend-design.md)
  PHONE_ALREADY_REGISTERED: 'PHONE_ALREADY_REGISTERED'
} as const;

const PHONE_E164_PATTERN = /^\+[1-9]\d{7,14}$/;
const OTP_CODE_PATTERN = /^\d{6}$/;

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    TranslateModule,
    ImageFallbackDirective,
    PasswordStrengthIndicatorComponent // ✨ جديد: عرض قوة كلمة المرور
  ],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnDestroy {
  loginData: LoginFormModel = {
    Email: '',
    Password: ''
  };

  registerData: RegisterFormModel = {
    FirstName: '',
    LastName: '',
    Email: '',
    Password: ''
  };

  showRegister = false;
  message = '';

  // ================= عرض تعليمات كلمة المرور =================
  /** ✨ عرض مؤشر قوة كلمة المرور عند التسجيل — يظهر عند التركيز على الحقل */
  showPasswordStrengthReg = false;
  showPasswordStrengthPhone = false;

  // ================= قفل الحساب بعد محاولات فاشلة =================
  /** تحذير "تبقّت N محاولة" — يُعرض تحت رسالة الخطأ، فارغ إن لم يرسله الخادم. */
  loginAttemptWarning = '';
  /** لحظة فك القفل بصيغة ISO؛ غير null يعني أن نموذج الدخول معطَّل. */
  lockoutEndsAt: string | null = null;
  lockoutMinutesLeft = 0;
  private lockoutTimerHandle: ReturnType<typeof setInterval> | null = null;
  success = false;
  showPass = false;
  showPassReg = false;
  loading = false;
  submitted = false;

  // ================= اختيار القناة: بريد / هاتف =================
  authMode: AuthMode = 'email';

  // ================= تسجيل الدخول بالهاتف (رقم + كلمة سر، بدون OTP) =================
  phoneLoginNumber = '';
  phoneLoginPassword = '';
  showPhoneLoginPass = false;

  // ================= إنشاء حساب بالهاتف (OTP مرة واحدة، ثم كلمة سر + اسم) =================
  phoneStep: PhoneStep = 'phone';

  phoneNumber = '';
  otpCode = '';
  otpSubmitted = false;

  /** كلمة سر الحساب الجديد — تُرسَل مع طلب التحقق نفسه (verify) لإنشاء الحساب دفعة واحدة. */
  phonePassword = '';
  showPhoneRegPass = false;

  phoneFirstName = '';
  phoneLastName = '';

  otpExpiresInSeconds = 0;
  resendCooldown = 0;
  private resendTimerHandle: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly authApi: AuthApiService,
    private readonly authState: AuthService,
    private readonly socialAuth: SocialAuthService,
    private readonly phoneAuthApi: PhoneAuthApiService,
    private readonly tokenStorage: TokenStorageService,
    private readonly otpApi: OtpApiService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly translate: TranslateService,
    private readonly toast: ToastService
  ) {}

  get googleAvailable(): boolean {
    return this.socialAuth.isGoogleAvailable;
  }

  get appleAvailable(): boolean {
    return this.socialAuth.isAppleAvailable;
  }

  get resendDisabled(): boolean {
    return this.resendCooldown > 0 || this.loading;
  }

  // ================= البريد الإلكتروني =================

  /** true بينما الحساب مقفول — يعطّل زر الدخول. */
  get isLockedOut(): boolean {
    return this.lockoutEndsAt !== null && this.lockoutMinutesLeft > 0;
  }

  onLogin(form: NgForm): void {
    this.submitted = true;
    form.control.markAllAsTouched();

    if (this.isLockedOut) {
      return;
    }

    if (form.invalid || this.loading) {
      this.setError(this.t('AUTH.ERRORS.FIX_FIELDS'));
      return;
    }

    this.loading = true;
    this.message = '';

    const request = {
      email: this.loginData.Email.trim().toLowerCase(),
      password: this.loginData.Password
    };

    this.authApi.login(request).subscribe({
      next: () => {
        this.clearLockout();
        this.refreshAuthState();
        this.completeLoginSuccess();
      },
      error: error => {
        this.loading = false;
        this.handleLoginFailure(parseLoginFailure(error));
      }
    });
  }

  /**
   * يترجم عقد فشل /auth/login إلى حالة واجهة. المصدر الوحيد للتفرّع هو
   * errorCode (نص ثابت من الباك) وليس نص الرسالة الإنجليزي.
   */
  private handleLoginFailure(failure: LoginFailure): void {
    this.loginAttemptWarning = '';

    switch (failure.errorCode) {
      case LOGIN_ERROR_CODES.ACCOUNT_LOCKED:
        this.startLockout(failure);
        return;

      case LOGIN_ERROR_CODES.RATE_LIMITED:
        this.setError(this.t('AUTH.ERRORS.RATE_LIMITED'));
        return;

      case LOGIN_ERROR_CODES.ACCOUNT_DISABLED:
        this.setError(this.t('AUTH.ERRORS.ACCOUNT_DISABLED'));
        return;

      case LOGIN_ERROR_CODES.SERVER_ERROR:
        this.setError(this.t('AUTH.ERRORS.SERVER_ERROR'));
        return;

      default:
        // INVALID_CREDENTIALS وأي رمز غير معروف: رسالة عامة موحّدة حتى لا
        // نكشف إن كان البريد مسجَّلاً أم لا.
        this.setError(this.t('AUTH.ERRORS.INVALID_CREDENTIALS'));
        this.showRemainingAttempts(failure);
    }
  }

  /**
   * عدّاد المحاولات المتبقية. يظهر فقط عندما يرسله الخادم — لو غاب الحقل
   * لا نخمّن رقماً، لأن عدّاداً خاطئاً أسوأ من غيابه.
   *
   * ⚠️ تم التصحيح: يظهر فقط إذا كانت هناك محاولات متبقية فعلاً (> 0)
   */
  private showRemainingAttempts(failure: LoginFailure): void {
    const remaining = failure.remainingAttemptsBeforeLockout;

    // لا تظهر إذا لم يرسل الخادم عدداً أو إذا كان الرقم 0 أو أقل
    if (!remaining || remaining <= 0) {
      this.loginAttemptWarning = '';
      return;
    }

    // عرض الرسالة فقط إذا كانت هناك محاولات متبقية
    this.loginAttemptWarning =
      remaining === 1
        ? this.t('AUTH.ERRORS.LAST_ATTEMPT_BEFORE_LOCKOUT')
        : this.translate.instant('AUTH.ERRORS.ATTEMPTS_REMAINING', { count: remaining });
  }

  /** يعطّل النموذج ويشغّل عدّاً تنازلياً حتى لحظة فك القفل. */
  private startLockout(failure: LoginFailure): void {
    this.clearLockoutTimer();
    this.lockoutEndsAt = failure.lockoutEndTimeUtc;

    const tick = (): void => {
      const minutes = lockoutMinutesRemaining(failure);
      this.lockoutMinutesLeft = minutes;

      if (minutes <= 0) {
        this.clearLockout();
        this.message = '';
        this.success = false;
        return;
      }

      this.message = this.translate.instant('AUTH.ERRORS.ACCOUNT_LOCKED', { minutes });
      this.success = false;
    };

    tick();
    this.toast.error(this.message);

    // بدون طابع زمني مطلق لا يمكن العدّ؛ يبقى النموذج معطّلاً حتى إعادة التحميل.
    if (this.lockoutEndsAt) {
      this.lockoutTimerHandle = setInterval(tick, 1000);
    }
  }

  private clearLockout(): void {
    this.clearLockoutTimer();
    this.lockoutEndsAt = null;
    this.lockoutMinutesLeft = 0;
  }

  private clearLockoutTimer(): void {
    if (this.lockoutTimerHandle) {
      clearInterval(this.lockoutTimerHandle);
      this.lockoutTimerHandle = null;
    }
  }

  onGoogleLogin(): void {
    if (this.loading || !this.googleAvailable) {
      return;
    }

    this.loading = true;
    this.message = '';

    this.socialAuth.loginWithGoogle().subscribe({
      next: response => this.completeSocialLogin(response),
      error: error => {
        this.loading = false;
        this.setError(this.socialAuth.getSocialErrorMessage(error));
      }
    });
  }

  onAppleLogin(): void {
    if (this.loading || !this.appleAvailable) {
      return;
    }

    this.loading = true;
    this.message = '';

    this.socialAuth.loginWithApple().subscribe({
      next: response => this.completeSocialLogin(response),
      error: error => {
        this.loading = false;
        this.setError(this.socialAuth.getSocialErrorMessage(error));
      }
    });
  }

  onRegister(form: NgForm): void {
    this.submitted = true;
    form.control.markAllAsTouched();

    if (form.invalid || this.loading) {
      this.setError(this.t('AUTH.ERRORS.FIX_FIELDS'));
      return;
    }

    this.loading = true;
    this.message = '';

    const firstName = this.registerData.FirstName.trim();
    const lastName = this.registerData.LastName.trim();
    const email = this.registerData.Email.trim().toLowerCase();
    const password = this.registerData.Password;

    const validationMessage = this.validateRegisterForm(firstName, lastName, email, password);
    if (validationMessage) {
      this.loading = false;
      this.setError(validationMessage);
      return;
    }

    this.authApi.register({ firstName, lastName, email, password }).subscribe({
      next: () => {
        this.loading = false;
        this.success = true;
        this.message = this.t('AUTH.REGISTER_SUCCESS');
        this.toast.success(this.message);
        this.showRegister = false;
        this.submitted = false;

        this.loginData.Email = email;
        this.loginData.Password = '';
        this.registerData = {
          FirstName: '',
          LastName: '',
          Email: '',
          Password: ''
        };
      },
      error: error => {
        this.loading = false;
        this.setError(this.getRegisterErrorMessage(error));
      }
    });
  }

  toggleRegister(): void {
    this.showRegister = !this.showRegister;
    this.message = '';
    this.success = false;
    this.submitted = false;
    this.resetPhoneFlow();
  }

  // ================= عرض تعليمات كلمة المرور =================
  onRegisterPasswordFocus(): void {
    this.showPasswordStrengthReg = true;
  }

  onRegisterPasswordBlur(): void {
    // أخفِ المؤشر عند مغادرة الحقل (اختياري)
    // this.showPasswordStrengthReg = false;
  }

  onPhonePasswordFocus(): void {
    this.showPasswordStrengthPhone = true;
  }

  onPhonePasswordBlur(): void {
    // أخفِ المؤشر عند مغادرة الحقل (اختياري)
    // this.showPasswordStrengthPhone = false;
  }

  // ================= اختيار القناة =================
  // ملاحظة معمارية: authMode يحدد القناة (بريد/هاتف) بينما showRegister
  // يحدد النية (دخول/تسجيل) — نفس showRegister يُستخدم للقناتين معاً،
  // تماماً كما يحكم عنوان الصفحة (AUTH.LOGIN_TITLE / REGISTER_TITLE)
  // بلا تمييز بين القناتين.

  switchAuthMode(mode: AuthMode): void {
    if (this.loading) {
      return;
    }

    this.authMode = mode;
    this.message = '';
    this.success = false;
    this.submitted = false;
    this.resetPhoneFlow();
  }

  // ================= تسجيل الدخول بالهاتف (رقم + كلمة سر، بدون OTP) =================

  onPhoneLogin(form: NgForm): void {
    this.submitted = true;
    form.control.markAllAsTouched();

    const phone = this.phoneLoginNumber.trim();

    if (!PHONE_E164_PATTERN.test(phone)) {
      this.setError(this.t('AUTH.ERRORS.PHONE_INVALID'));
      return;
    }

    if (!this.phoneLoginPassword) {
      this.setError(this.t('AUTH.ERRORS.PASSWORD_REQUIRED'));
      return;
    }

    if (this.loading) {
      return;
    }

    this.loading = true;
    this.message = '';

    this.phoneAuthApi.login({ phoneNumber: phone, password: this.phoneLoginPassword }).subscribe({
      next: () => {
        this.refreshAuthState();
        this.completeLoginSuccess();
      },
      error: () => {
        this.loading = false;
        // رسالة عامة موحّدة مع تسجيل الدخول بالبريد — لا نكشف إن كان
        // الرقم مسجَّلاً أم لا (نفس مبدأ حماية تعداد البريد الإلكتروني
        // الموثّق للـForgotPassword، مطبَّق هنا على الهاتف).
        this.setError(this.t('AUTH.ERRORS.INVALID_CREDENTIALS'));
      }
    });
  }

  // ================= إنشاء حساب بالهاتف (OTP مرة واحدة → كلمة سر + اسم) =================

  onSendPhoneOtp(): void {
    const phone = this.phoneNumber.trim();

    if (!PHONE_E164_PATTERN.test(phone)) {
      this.setError(this.t('AUTH.ERRORS.PHONE_INVALID'));
      return;
    }

    if (this.loading) {
      return;
    }

    this.loading = true;
    this.message = '';

    this.otpApi.sendOtp({ phoneNumber: phone, purpose: OtpPurpose.PhoneRegistration }).subscribe({
      next: response => {
        this.loading = false;
        this.phoneStep = 'otp';
        this.otpSubmitted = false;
        this.otpExpiresInSeconds = response.expiresInSeconds;
        this.toast.success(this.t('AUTH.SEND_OTP_SUCCESS'));
        this.startResendCooldown(60);
      },
      error: error => {
        this.loading = false;
        this.setError(this.getOtpErrorMessage(error, 'AUTH.ERRORS.SEND_OTP_FAILED'));
      }
    });
  }

  onResendOtp(): void {
    if (this.resendDisabled) {
      return;
    }

    this.onSendPhoneOtp();
  }

  onChangePhoneNumber(): void {
    if (this.loading) {
      return;
    }

    this.resetPhoneFlow();
  }

  onVerifyPhoneOtp(): void {
    this.otpSubmitted = true;

    const phone = this.phoneNumber.trim();
    const code = this.otpCode.trim();
    const firstName = this.phoneFirstName.trim();
    const lastName = this.phoneLastName.trim();

    if (!OTP_CODE_PATTERN.test(code)) {
      this.setError(this.t('AUTH.ERRORS.VERIFY_OTP_FAILED'));
      return;
    }

    if (!firstName || !lastName) {
      this.setError(this.t('AUTH.ERRORS.FULL_NAME_REQUIRED'));
      return;
    }

    if (!this.phonePassword || this.phonePassword.length < 8) {
      this.setError(this.t('AUTH.ERRORS.PASSWORD_MIN'));
      return;
    }

    if (this.loading) {
      return;
    }

    this.loading = true;
    this.message = '';

    // هذا الطلب ينشئ الحساب مباشرة (رقم + كلمة سر + اسم) بعد نجاح
    // التحقق من الـOTP — راجع تصميم /auth/phone/verify المُعاد
    // تعريفه في phone-auth-backend-design.md. لا مزيد من "المستخدم
    // الحالي بلا اسم" لأن الاسم وكلمة السر إلزاميان دائماً هنا.
    const request: VerifyOtpRequest = {
      phoneNumber: phone,
      code,
      purpose: OtpPurpose.PhoneRegistration,
      password: this.phonePassword,
      firstName,
      lastName
    };

    this.otpApi.verifyOtp(request).subscribe({
      next: () => {
        this.clearResendTimer();
        this.refreshAuthState();
        this.completeLoginSuccess();
      },
      error: error => {
        this.loading = false;
        this.setError(this.getOtpErrorMessage(error, 'AUTH.ERRORS.VERIFY_OTP_FAILED'));
      }
    });
  }

  private resetPhoneFlow(): void {
    this.phoneStep = 'phone';
    this.otpCode = '';
    this.otpSubmitted = false;
    this.phonePassword = '';
    this.phoneFirstName = '';
    this.phoneLastName = '';
    this.otpExpiresInSeconds = 0;
    this.phoneLoginPassword = '';
    this.clearResendTimer();
  }

  private startResendCooldown(seconds: number): void {
    this.resendCooldown = seconds;
    this.clearResendTimer();

    this.resendTimerHandle = setInterval(() => {
      this.resendCooldown -= 1;

      if (this.resendCooldown <= 0) {
        this.clearResendTimer();
      }
    }, 1000);
  }

  private clearResendTimer(): void {
    if (this.resendTimerHandle) {
      clearInterval(this.resendTimerHandle);
      this.resendTimerHandle = null;
    }

    this.resendCooldown = 0;
  }

  /**
   * قراءة دفاعية لكود الخطأ تدعم PascalCase وcamelCase معاً، إلى حين
   * التحقق الفعلي من شكل استجابة ErrorResponse على الشبكة (راجع الملاحظة
   * أعلى الملف).
   */
  private getOtpErrorCode(error: unknown): string | undefined {
    const response = error as { error?: { code?: string; Code?: string } };
    return response.error?.code ?? response.error?.Code;
  }

  private getOtpErrorMessage(error: unknown, fallbackKey: string): string {
    const code = this.getOtpErrorCode(error);

    const codeToKey: Record<string, string> = {
      [OTP_ERROR_CODES.RATE_LIMITED]: 'AUTH.ERRORS.OTP_RATE_LIMITED',
      [OTP_ERROR_CODES.SMS_FAILED]: 'AUTH.ERRORS.OTP_SMS_FAILED',
      [OTP_ERROR_CODES.OTP_STORE_FAILED]: 'AUTH.ERRORS.OTP_STORE_FAILED',
      [OTP_ERROR_CODES.OTP_NOT_FOUND]: 'AUTH.ERRORS.OTP_NOT_FOUND',
      [OTP_ERROR_CODES.OTP_INVALID]: 'AUTH.ERRORS.OTP_INVALID',
      [OTP_ERROR_CODES.OTP_WRONG]: 'AUTH.ERRORS.OTP_WRONG',
      [OTP_ERROR_CODES.OTP_ALREADY_USED]: 'AUTH.ERRORS.OTP_ALREADY_USED',
      [OTP_ERROR_CODES.ROLE_ASSIGNMENT_FAILED]: 'AUTH.ERRORS.PHONE_AUTH_FAILED',
      [OTP_ERROR_CODES.USER_CREATE_FAILED]: 'AUTH.ERRORS.PHONE_AUTH_FAILED',
      [OTP_ERROR_CODES.PHONE_AUTH_FAILED]: 'AUTH.ERRORS.PHONE_AUTH_FAILED',
      // الرقم مسجَّل مسبقاً أثناء محاولة تسجيل — وجّهه لتبويب الدخول
      // برسالة PHONE_AUTH_FAILED العامة (لا مفتاح مخصص جديد بعد).
      [OTP_ERROR_CODES.PHONE_ALREADY_REGISTERED]: 'AUTH.ERRORS.PHONE_AUTH_FAILED'
    };

    if (code && codeToKey[code]) {
      return this.t(codeToKey[code]);
    }

    const response = error as { error?: { message?: string; Message?: string } };
    const backendMessage = response.error?.message ?? response.error?.Message;

    return backendMessage ?? this.t(fallbackKey);
  }

  // ================= مشتركات =================

  private completeSocialLogin(response: AuthTokenResponse): void {
    this.tokenStorage.storeTokens(response);
    this.refreshAuthState();
    this.completeLoginSuccess();
  }

  private completeLoginSuccess(): void {
    this.loading = false;
    this.success = true;
    this.message = this.t('AUTH.LOGIN_SUCCESS');
    this.toast.success(this.message);

    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/home';
    void this.router.navigateByUrl(returnUrl);
  }

  private refreshAuthState(): void {
    const authState = this.authState as unknown as {
      restoreSession?: () => void;
      validateSession?: () => void;
    };

    authState.restoreSession?.();
    authState.validateSession?.();
  }

  private validateRegisterForm(firstName: string, lastName: string, email: string, password: string): string | null {
    if (!firstName || !lastName) {
      return this.t('AUTH.ERRORS.FULL_NAME_REQUIRED');
    }

    if (!email) {
      return this.t('AUTH.ERRORS.EMAIL_REQUIRED');
    }

    if (/\s/.test(email)) {
      return this.t('AUTH.ERRORS.EMAIL_NO_SPACES');
    }

    if (!this.isValidEmail(email)) {
      return this.t('AUTH.ERRORS.INVALID_EMAIL');
    }

    if (!password) {
      return this.t('AUTH.ERRORS.PASSWORD_REQUIRED');
    }

    if (password.length < 8) {
      return this.t('AUTH.ERRORS.PASSWORD_MIN');
    }

    return null;
  }

  private setError(message: string): void {
    this.loading = false;
    this.success = false;
    this.message = message;
    // ⚠️ تم إزالة toast.error هنا لتجنب عرض الرسالة مرتين
    // الرسالة تُعرض مرة واحدة عبر alert في القالب (div.auth-alert)
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private getRegisterErrorMessage(error: unknown): string {
    const response = error as {
      error?: {
        message?: string;
        errors?: Record<string, string[]>;
      };
    };

    const backendMessage = response.error?.message;
    if (backendMessage) {
      return backendMessage;
    }

    const backendErrors = response.error?.errors;
    if (backendErrors) {
      const messages = Object.values(backendErrors).flat();
      if (messages.length > 0) {
        return messages.join(' ');
      }
    }

    return this.t('AUTH.ERRORS.REGISTER_FAILED');
  }

  private t(key: string): string {
    return this.translate.instant(key);
  }

  ngOnDestroy(): void {
    this.clearResendTimer();
    this.clearLockoutTimer();
  }
}
