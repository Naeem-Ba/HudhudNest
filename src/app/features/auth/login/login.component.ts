import { Component, OnDestroy } from '@angular/core';
import { AbstractControl, FormsModule, NgForm } from '@angular/forms';
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
import { PRIVACY_POLICY_VERSION, TERMS_OF_SERVICE_VERSION } from '../../../core/models/consent-versions';
import { ConsentCheckboxComponent } from '../../../shared/components/consent-checkbox/consent-checkbox.component';
import {
  LOGIN_ERROR_CODES,
  LoginFailure,
  lockoutMinutesRemaining,
  parseLoginFailure
} from '../../../core/models/auth.model';
import { translatePasswordViolations } from '../password-errors';
import { AuthField, applyAuthFieldErrors, resolveAuthError } from '../auth-error';
import { AuthErrorFocusService } from '../../../core/auth/auth-error-focus.service';
import { getPasswordPolicyViolations } from '../../../core/auth/password-policy';
import { ToastService } from '../../../shared/services/toast.service';
import { ImageFallbackDirective } from '../../../shared/directives/image-fallback.directive';
import { PasswordRulesComponent } from '../../../shared/ui/password-rules.component';

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
    PasswordRulesComponent,
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
  /**
   * true after a rejected e-mail/phone + password: the alert is followed by what the person can do next
   * (reset the password, create an account). The sentence itself stays the same whether or not the
   * account exists, so this does not tell an attacker which addresses are registered.
   */
  credentialsFailed = false;
  /** كلمة السر صحيحة لكن البريد غير مؤكَّد: يظهر زر إعادة إرسال الرابط (P4-D11). */
  emailNotConfirmed = false;
  resendingConfirmation = false;
  private unconfirmedEmail = '';
  consentError = '';
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
    private readonly toast: ToastService,
    private readonly errorFocus: AuthErrorFocusService,
    private readonly consentApi: ConsentApiService
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
    if (this.loading) {
      return;
    }

    this.submitted = true;
    form.control.markAllAsTouched();

    if (this.isLockedOut) {
      return;
    }

    // Length is deliberately NOT checked here: the server decides whether a password is right, and an
    // account created under an older rule must still be able to sign in.
    if (form.invalid) {
      this.message = '';
      this.credentialsFailed = false;
      this.loginAttemptWarning = '';
      this.errorFocus.request();
      return;
    }

    this.loading = true;
    this.message = '';
    this.credentialsFailed = false;
    this.emailNotConfirmed = false;

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
        this.handleLoginFailure(error);
      }
    });
  }

  /** يعيد إرسال رابط تأكيد البريد (الخادم يطبّق حدّ 3 رسائل/24 ساعة ويردّ بالرد نفسه دائمًا). */
  resendConfirmation(): void {
    if (this.resendingConfirmation || !this.unconfirmedEmail) {
      return;
    }

    this.resendingConfirmation = true;
    this.authApi.resendConfirmationEmail(this.unconfirmedEmail).subscribe({
      next: () => {
        this.resendingConfirmation = false;
        this.emailNotConfirmed = false;
        this.message = this.t('AUTH.CONFIRMATION_RESENT');
        this.success = true;
      },
      error: error => {
        this.resendingConfirmation = false;
        this.setError(
          this.t((error as { status?: number } | null)?.status === 429
            ? 'AUTH.RESEND_CONFIRMATION.TOO_MANY'
            : 'AUTH.ERRORS.SERVER_ERROR')
        );
        this.emailNotConfirmed = true;
      }
    });
  }

  /** Called when the person edits a field: the message about the previous attempt is no longer true. */
  clearFormMessage(): void {
    if (this.success || this.isLockedOut || (!this.message && !this.loginAttemptWarning)) {
      return;
    }

    this.emailNotConfirmed = false;
    this.message = '';
    this.credentialsFailed = false;
    this.loginAttemptWarning = '';
  }

  /**
   * يترجم عقد فشل /auth/login إلى حالة واجهة. المصدر الوحيد للتفرّع هو
   * errorCode (نص ثابت من الباك) وليس نص الرسالة الإنجليزي.
   */
  private handleLoginFailure(error: unknown): void {
    const failure = parseLoginFailure(error);
    this.loginAttemptWarning = '';

    // Not an answer about the credentials at all: the request never arrived (status 0), took too long, or
    // the server/proxy failed (502/503/504 while the host wakes up used to fall through to "wrong password").
    const resolved = resolveAuthError(this.translate, error);
    if (resolved.kind === 'network' || resolved.kind === 'timeout' || resolved.kind === 'server') {
      this.setError(resolved.message ?? this.t('AUTH.ERRORS.SERVER_ERROR'));
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

      case LOGIN_ERROR_CODES.EMAIL_NOT_CONFIRMED:
        // The server already sent a fresh link (within its 3-per-24h limit); say so and offer one more.
        this.setError(this.t('AUTH.ERRORS.EMAIL_NOT_CONFIRMED'));
        this.emailNotConfirmed = true;
        this.unconfirmedEmail = this.loginData.Email.trim().toLowerCase();
        return;

      default:
        // INVALID_CREDENTIALS and any unknown code: one sentence for "wrong password" and "no such
        // account", so the form never tells a stranger which addresses are registered (the server's
        // answer is identical for both). The help line below it says what to do next.
        this.setError(this.t('AUTH.ERRORS.INVALID_CREDENTIALS'));
        this.credentialsFailed = true;
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
    this.errorFocus.request();
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
    if (this.loading) {
      return;
    }

    this.submitted = true;
    this.consentError = '';
    form.control.markAllAsTouched();
    this.message = '';

    const firstName = this.registerData.FirstName.trim();
    const lastName = this.registerData.LastName.trim();
    const email = this.registerData.Email.trim().toLowerCase();
    const password = this.registerData.Password;

    // The rules the server enforces, checked here first so the person learns about them before the
    // round trip. The server stays the reference: if it disagrees (the breached-password list), its
    // answer is shown the same way below.
    const passwordControl = form.controls['passReg'];
    const policyBroken = !!password && getPasswordPolicyViolations(password, { firstName, lastName, email }).length > 0;
    if (policyBroken) {
      passwordControl?.setErrors({ server: this.t('AUTH.ERRORS.PASSWORD_POLICY_UNMET') });
    }

    if (!this.privacyConsentAccepted) {
      this.consentError = this.t('AUTH.ERRORS.CONSENT_REQUIRED');
    }

    if (form.invalid || policyBroken || this.consentError) {
      this.errorFocus.request();
      return;
    }

    this.loading = true;

    this.authApi.register({
      firstName,
      lastName,
      email,
      password,
      privacyPolicyAccepted: this.privacyConsentAccepted,
      privacyPolicyVersion: PRIVACY_POLICY_VERSION,
      termsAccepted: this.privacyConsentAccepted,
      termsVersion: TERMS_OF_SERVICE_VERSION,
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
        this.errorFocus.request();
      },
      error: error => {
        this.loading = false;
        this.handleRegisterFailure(form, error);
      }
    });
  }

  /**
   * Puts each reason on the field it belongs to (e-mail taken -> the e-mail field, a rejected password
   * -> the password field), keeps everything the person typed, and shows the rest (network, server,
   * rate limit) in the form-level alert.
   */
  private handleRegisterFailure(form: NgForm, error: unknown): void {
    const resolved = resolveAuthError(this.translate, error, {
      conflictMeansEmailTaken: true,
      allowServerMessage: true,
      fallbackKey: 'AUTH.ERRORS.REGISTER_FAILED'
    });

    const controls: Partial<Record<AuthField, AbstractControl | null>> = {
      firstName: form.controls['firstName'],
      lastName: form.controls['lastName'],
      email: form.controls['emailReg'],
      password: form.controls['passReg']
    };

    if (resolved.fields.some(item => item.field === 'consent')) {
      this.consentError = this.t('AUTH.ERRORS.CONSENT_REQUIRED');
    }

    const leftovers = applyAuthFieldErrors(
      { ...resolved, fields: resolved.fields.filter(item => item.field !== 'consent') },
      controls
    );

    if (leftovers.length > 0) {
      this.setError(leftovers.join(' '));
    } else {
      this.errorFocus.request();
    }
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
    if (this.loading) {
      return;
    }

    this.submitted = true;
    form.control.markAllAsTouched();
    this.message = '';
    this.credentialsFailed = false;

    const phone = normalizePhoneInput(this.phoneLoginNumber);
    const numberControl = form.controls['phoneLoginNumber'];

    // Required is handled by the template validator; a filled-in but malformed number is explained on
    // the field (it used to be a banner far from it, and only after the password had been typed too).
    const malformed = !!this.phoneLoginNumber.trim() && !PHONE_E164_PATTERN.test(phone);
    if (malformed) {
      numberControl?.setErrors({ server: this.t('AUTH.ERRORS.PHONE_INVALID') });
    }

    if (form.invalid || malformed) {
      this.errorFocus.request();
      return;
    }

    this.loading = true;

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
        const resolved = resolveAuthError(this.translate, err);
        const notCredentials =
          resolved.kind === 'network' || resolved.kind === 'timeout' || resolved.kind === 'server' ||
          resolved.kind === 'rate_limited';

        this.setError(notCredentials && resolved.message ? resolved.message : getPhoneLoginErrorMessage(this.translate, err));
        this.credentialsFailed =
          !notCredentials && this.message === this.t('AUTH.ERRORS.PHONE_INVALID_CREDENTIALS');
      }
    });
  }

  private resetPhoneFlow(): void {
    this.phoneLoginPassword = '';
  }

  // ================= مشتركات =================

  private completeSocialLogin(response: AuthTokenResponse): void {
    this.tokenStorage.storeTokens(response);
    // The notice under the social buttons is the consent on this path; keep the proof (best-effort).
    this.consentApi.ensureCurrentAcceptance().subscribe({ error: () => undefined });
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

  private setError(message: string): void {
    this.loading = false;
    this.success = false;
    this.credentialsFailed = false;
    this.emailNotConfirmed = false;
    this.message = message;
    // No toast here: the alert in the template is the one place the message is shown. The page then
    // scrolls to it (or to the field it belongs to) so it is never left below the fold or the keyboard.
    this.errorFocus.request();
  }

  private t(key: string): string {
    return this.translate.instant(key);
  }

  ngOnDestroy(): void {
    this.clearLockoutTimer();
  }
}
