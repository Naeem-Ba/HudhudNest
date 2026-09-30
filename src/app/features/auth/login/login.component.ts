import { Component, OnDestroy } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { AuthApiService } from '../../../core/auth/auth-api.service';
import { SocialAuthService } from '../../../core/auth/social-auth.service';
import { PhoneAuthApiService } from '../../../core/auth/phone-auth-api.service';
import { PHONE_E164_PATTERN, normalizePhoneInput } from '../../../core/auth/phone-number';
import { getPhoneLoginErrorMessage } from '../phone-auth-errors';
import { AuthTokenResponse, TokenStorageService } from '../../../core/services/token-storage.service';
import { AuthService } from '../../../core/auth/auth.service';
import { LoginMethod } from '../../../core/auth/login-identifier';
import { ConsentApiService } from '../../../core/api/consent-api.service';
import { PRIVACY_POLICY_VERSION } from '../../../core/models/consent-versions';
import { ConsentCheckboxComponent } from '../../../shared/components/consent-checkbox/consent-checkbox.component';
import {
  LOGIN_ERROR_CODES,
  LoginFailure,
  lockoutMinutesRemaining,
  parseLoginFailure
} from '../../../core/models/auth.model';
import { getPasswordRejectionMessages } from '../password-errors';
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


@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    TranslateModule,
    ImageFallbackDirective,
    PasswordStrengthIndicatorComponent, // ✨ جديد: عرض قوة كلمة المرور
    ConsentCheckboxComponent
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

  // مربّع الموافقة على سياسة الخصوصية وشروط الاستخدام — مشترك بين تبويبي التسجيل
  // (بريد/هاتف)، غير محدَّد افتراضياً، ومطلوب فعلياً. انظر docs/privacy/privacy-gaps.md (P1).
  privacyConsentAccepted = false;

  constructor(
    private readonly authApi: AuthApiService,
    private readonly authState: AuthService,
    private readonly socialAuth: SocialAuthService,
    private readonly phoneAuthApi: PhoneAuthApiService,
    private readonly tokenStorage: TokenStorageService,
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
        this.refreshAuthState('email');
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

    // status 0 يعني أن الطلب لم يصل إلى الخادم إطلاقاً (انقطاع اتصال، CORS،
    // أو الخادم متوقف) — لا علاقة له ببيانات الدخول، فيجب عدم خلطه برسالة
    // "بيانات الدخول غير صحيحة" التي يوحي بها inferErrorCodeFromStatus حين
    // لا يجد حالة مطابقة لـ 0 ويترك errorCode كـ null.
    if (failure.status === 0) {
      this.setError(this.t('AUTH.ERRORS.NETWORK_ERROR'));
      return;
    }

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
    // toast.error() أُزيلت من هنا — كانت تكرّر رسالة auth-alert (القالب) نفسها، ونفس
    // السبب الموثَّق في setError() أعلاه؛ ApiErrorInterceptor أيضاً لم يعد يعرض toast
    // تلقائياً لأي طلب /auth/ (راجع isAuthFlowRequest هناك).

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

    // زر الإرسال معطَّل بدون الموافقة أصلاً (انظر القالب) — هذا دفاع إضافي فقط.
    if (!this.privacyConsentAccepted) {
      this.loading = false;
      this.setError(this.t('AUTH.ERRORS.FIX_FIELDS'));
      return;
    }

    this.authApi.register({
      firstName,
      lastName,
      email,
      password,
      privacyPolicyAccepted: this.privacyConsentAccepted,
      privacyPolicyVersion: PRIVACY_POLICY_VERSION,
      consentSource: ConsentApiService.currentSource()
    }).subscribe({
      next: () => {
        this.loading = false;
        this.success = true;
        this.message = this.t('AUTH.REGISTER_SUCCESS');
        this.toast.success(this.message);
        this.showRegister = false;
        this.submitted = false;
        this.privacyConsentAccepted = false;

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
    this.privacyConsentAccepted = false;
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

    const phone = normalizePhoneInput(this.phoneLoginNumber);

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
        this.refreshAuthState('phone');
        this.completeLoginSuccess();
      },
      error: err => {
        this.loading = false;
        // رقم/كلمة سر خاطئة وحساب مقفل ورقم غير مسجَّل كلها 400 PHONE_AUTH_FAILED بنص واحد (لا كشف
        // عن وجود الحساب)؛ أما تجاوز المعدّل وانقطاع الشبكة وخطأ الخادم والحساب غير المتاح فتُعرض
        // كما هي كي لا تُقرأ كأن كلمة السر خاطئة.
        this.setError(getPhoneLoginErrorMessage(this.translate, err));
      }
    });
  }

  private resetPhoneFlow(): void {
    this.phoneLoginPassword = '';
  }

  // ================= مشتركات =================

  private completeSocialLogin(response: AuthTokenResponse): void {
    this.tokenStorage.storeTokens(response);
    this.refreshAuthState('email');
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

  /** Google/Apple sign in with the account's e-mail, so they count as 'email'. */
  private refreshAuthState(method: LoginMethod): void {
    const authState = this.authState as unknown as {
      rememberLoginMethod?: (method: LoginMethod) => void;
      restoreSession?: () => void;
      validateSession?: () => void;
    };

    // Before validateSession(): the navbar reads the method on the first user emission.
    authState.rememberLoginMethod?.(method);
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
    // كود PASSWORD_BREACHED وأخواته يُترجَمان أولاً — نفس الأداة المشتركة التي
    // يستخدمها register.page.ts، بدل عرض نص الخادم الإنجليزي الخام لمستخدم
    // عربي أو ألماني (كان هذا النموذج المدمج ينفرد بتجاوز الترجمة هنا).
    const passwordReasons = getPasswordRejectionMessages(this.translate, error);
    if (passwordReasons.length > 0) {
      return passwordReasons.join(' ');
    }

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
    this.clearLockoutTimer();
  }
}
