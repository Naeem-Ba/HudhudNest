import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { PhoneAuthApiService } from '../../../core/auth/phone-auth-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ConsentApiService } from '../../../core/api/consent-api.service';
import { PRIVACY_POLICY_VERSION, TERMS_OF_SERVICE_VERSION } from '../../../core/models/consent-versions';
import { ToastService } from '../../../shared/services/toast.service';
import { FormErrorComponent } from '../../../shared/ui/form-error.component';
import { ConsentCheckboxComponent } from '../../../shared/components/consent-checkbox/consent-checkbox.component';
import { AuthErrorFocusService } from '../../../core/auth/auth-error-focus.service';
import { passwordPolicyValidator } from '../../../core/auth/password-policy';
import { PasswordRulesComponent } from '../../../shared/ui/password-rules.component';
import { AuthField, applyAuthFieldErrors, resolveAuthError } from '../auth-error';
import { phoneNumberValidator } from '../../../core/auth/phone-number';
import { OtpChannelState } from '../../../core/auth/otp-channel-state';
import { OtpChannel } from '../../../core/models/auth.model';
import { OtpChannelFallbackComponent } from '../../../shared/components/otp-channel-picker/otp-channel-fallback.component';
import { OtpChannelPickerComponent } from '../../../shared/components/otp-channel-picker/otp-channel-picker.component';
import { otpCodeValidator } from '../../../core/auth/otp-code';

type Step = 'phone' | 'details';

/**
 * تسجيل حساب جديد عبر PhonePasswordAuthController
 * (registration/send-otp → registration/verify).
 * راجع: HudhudNestApi/Controllers/PhonePasswordAuthController.cs
 */
@Component({
  selector: 'app-phone-register-page',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    TranslateModule,
    FormErrorComponent,
    PasswordRulesComponent,
    ConsentCheckboxComponent,
    OtpChannelPickerComponent,
    OtpChannelFallbackComponent
  ],
  templateUrl: './phone-register.page.html',
  styleUrls: ['./phone-register.page.scss']
})
export class PhoneRegisterPage {
  private readonly fb = inject(FormBuilder);
  private readonly phoneAuth = inject(PhoneAuthApiService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(ToastService);
  private readonly consentApi = inject(ConsentApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly errorFocus = inject(AuthErrorFocusService);

  readonly step = signal<Step>('phone');
  readonly loading = signal(false);
  readonly submitted = signal(false);
  readonly error = signal('');
  readonly consentError = signal('');

  // مربّع الموافقة على سياسة الخصوصية وشروط الاستخدام — غير محدَّد افتراضياً،
  // ومطلوب فعلياً، انظر docs/privacy/privacy-gaps.md (P1).
  readonly privacyConsentAccepted = signal(false);
  readonly resendCooldown = signal(0);
  private resendTimer: ReturnType<typeof setInterval> | null = null;
  private challengeId = '';
  readonly channels = new OtpChannelState(this.phoneAuth, this.destroyRef);
  readonly sentChannel = signal<OtpChannel>('Sms');

  readonly phoneForm = this.fb.nonNullable.group({
    phoneNumber: ['', [Validators.required, phoneNumberValidator]]
  });

  readonly detailsForm = this.fb.nonNullable.group({
    code: ['', [Validators.required, otpCodeValidator]],
    firstName: ['', [Validators.required, Validators.minLength(2)]],
    lastName: ['', [Validators.required, Validators.minLength(2)]],
    // Same rules as the server (length, character classes, common words, not built from the name or
    // the phone number); the length is part of the policy, so there is no separate minLength.
    password: ['', [Validators.required, passwordPolicyValidator(() => this.personalContext())]]
  });

  constructor() {
    this.channels.watch(this.phoneForm.controls.phoneNumber);

    const { firstName, lastName, password } = this.detailsForm.controls;
    [firstName, lastName].forEach(control =>
      control.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() =>
        password.updateValueAndValidity({ emitEvent: false })
      )
    );

    // A message about the previous attempt stops being true as soon as something is edited.
    const clear = (): void => {
      if (this.error()) {
        this.error.set('');
      }
    };
    this.detailsForm.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(clear);
    this.phoneForm.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(clear);
  }

  personalContext(): { firstName: string; lastName: string; phoneNumber: string } {
    const details = this.detailsForm?.getRawValue();
    return {
      firstName: details?.firstName ?? '',
      lastName: details?.lastName ?? '',
      phoneNumber: this.phoneForm?.controls.phoneNumber.value ?? ''
    };
  }

  get maskedPhone(): string {
    const phone = this.phoneForm.controls.phoneNumber.value;
    return phone.length > 4 ? phone.slice(0, -4).replace(/\d/g, '•') + phone.slice(-4) : phone;
  }

  get resendDisabled(): boolean {
    return this.resendCooldown() > 0 || this.loading();
  }

  sendOtp(): void {
    if (this.loading()) {
      return;
    }

    this.submitted.set(true);

    if (this.phoneForm.invalid) {
      this.phoneForm.markAllAsTouched();
      this.errorFocus.request();
      return;
    }

    this.loading.set(true);
    this.error.set('');

    const phoneNumber = this.phoneForm.controls.phoneNumber.value.trim();

    this.phoneAuth
      .sendRegistrationOtp(phoneNumber, this.channels.selected())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.loading.set(false);

          if (!result.succeeded || !result.challengeId) {
            this.handleFailure({ status: 400, error: { code: result.errorCode } }, 'AUTH.ERRORS.SEND_OTP_FAILED');
            return;
          }

          this.challengeId = result.challengeId;
          this.sentChannel.set(result.channel ?? this.channels.selected());
          this.step.set('details');
          this.submitted.set(false);
          this.toast.success(this.translate.instant('AUTH.SEND_OTP_SUCCESS'));
          this.startResendCooldown(60);
        },
        error: error => {
          this.loading.set(false);
          this.handleFailure(error, 'AUTH.ERRORS.SEND_OTP_FAILED');
        }
      });
  }

  resendOtp(): void {
    if (this.resendDisabled) {
      return;
    }
    this.sendOtp();
  }

  /** "لم يصلك الرمز؟" — يبدأ المستخدم الإرسال عبر وسيلة أخرى؛ الحدّ في الباك مشترك بين الوسائل. */
  resendVia(channel: OtpChannel): void {
    if (this.loading()) {
      return;
    }
    this.channels.select(channel);
    this.sendOtp();
  }

  changePhoneNumber(): void {
    if (this.loading()) {
      return;
    }
    this.step.set('phone');
    this.submitted.set(false);
    this.error.set('');
    this.clearResendTimer();
    this.detailsForm.reset();
  }

  submitDetails(): void {
    if (this.loading()) {
      return;
    }

    this.submitted.set(true);
    this.consentError.set('');
    this.error.set('');
    this.detailsForm.markAllAsTouched();

    if (!this.privacyConsentAccepted()) {
      this.consentError.set(this.translate.instant('AUTH.ERRORS.CONSENT_REQUIRED'));
    }

    // Nothing is sent and nothing typed is lost; the first problem is shown next to its field.
    if (this.detailsForm.invalid || this.consentError()) {
      this.errorFocus.request();
      return;
    }

    this.loading.set(true);

    const { code, firstName, lastName, password } = this.detailsForm.getRawValue();

    this.phoneAuth
      .register({ challengeId: this.challengeId, code, firstName, lastName, password, channel: this.sentChannel() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.loading.set(false);

          if (!result.succeeded || !result.accessToken) {
            this.handleFailure({ status: 400, error: { code: result.errorCode } }, 'AUTH.ERRORS.VERIFY_OTP_FAILED');
            return;
          }

          this.clearResendTimer();
          // A phone registration signs straight in with that number.
          this.authService.rememberLoginMethod('phone');
          this.authService.restoreSession();
          this.authService.validateSession();
          this.toast.success(this.translate.instant('AUTH.REGISTER_SUCCESS'));

          // بخلاف التسجيل بالبريد، تسجيل الدخول بالهاتف يُصدر رمز وصول فوراً — لذلك
          // نسجّل الموافقة الآن عبر النقطة العامة الموثَّقة بدل تمريرها ضمن نموذج
          // التسجيل نفسه. فشل هذا النداء لا يوقف تسجيل الدخول (best-effort).
          for (const [policy, version] of [['PrivacyPolicy', PRIVACY_POLICY_VERSION], ['TermsOfService', TERMS_OF_SERVICE_VERSION]] as const) {
            this.consentApi.record(policy, version).subscribe({
              error: () => { /* غير حرج — انظر التعليق أعلاه. */ }
            });
          }

          const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/home';
          void this.router.navigateByUrl(returnUrl);
        },
        error: error => {
          this.loading.set(false);
          this.handleFailure(error, 'AUTH.ERRORS.VERIFY_OTP_FAILED');
        }
      });
  }

  private startResendCooldown(seconds: number): void {
    this.resendCooldown.set(seconds);
    this.clearResendTimer();

    this.resendTimer = setInterval(() => {
      this.resendCooldown.update(value => Math.max(0, value - 1));
      if (this.resendCooldown() === 0) {
        this.clearResendTimer();
      }
    }, 1000);
  }

  private clearResendTimer(): void {
    if (this.resendTimer) {
      clearInterval(this.resendTimer);
      this.resendTimer = null;
    }
    this.resendCooldown.set(0);
  }

  /**
   * One routine for every failed step: the reason goes on the field it is about (a wrong code under the
   * code box, a weak password under the password), anything else in the alert, and the page scrolls to
   * whichever comes first. Nothing the person typed is cleared.
   */
  private handleFailure(error: unknown, fallbackKey: string): void {
    // A bare 429 here is the shared hourly limit on codes.
    const status = (error as { status?: number } | null)?.status;
    const source = status === 429 && !(error as { error?: { code?: string } }).error?.code
      ? { status: 429, error: { code: 'RATE_LIMITED' } }
      : error;
    const resolved = resolveAuthError(this.translate, source, { fallbackKey });
    const { code, firstName, lastName, password } = this.detailsForm.controls;
    const controls: Partial<Record<AuthField, AbstractControl | null>> =
      this.step() === 'phone'
        ? { phone: this.phoneForm.controls.phoneNumber }
        : { code, firstName, lastName, password, phone: null };

    const leftovers = applyAuthFieldErrors(resolved, controls);

    // toast.error() removed on purpose — see phone-change.page.ts's setError comment.
    this.error.set(leftovers.join(' '));
    this.errorFocus.request();
  }
}
