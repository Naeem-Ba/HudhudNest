import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { PhoneAuthApiService } from '../../../core/auth/phone-auth-api.service';
import { ToastService } from '../../../shared/services/toast.service';
import { FormErrorComponent } from '../../../shared/ui/form-error.component';
import { AuthErrorFocusService } from '../../../core/auth/auth-error-focus.service';
import { passwordPolicyValidator } from '../../../core/auth/password-policy';
import { PasswordRulesComponent } from '../../../shared/ui/password-rules.component';
import { AuthField, applyAuthFieldErrors, resolveAuthError } from '../auth-error';
import { phoneNumberValidator } from '../../../core/auth/phone-number';
import { OtpChannelState } from '../../../core/auth/otp-channel-state';
import { OtpChannel } from '../../../core/models/auth.model';
import { OtpChannelFallbackComponent } from '../../../shared/components/otp-channel-picker/otp-channel-fallback.component';
import { OtpChannelPickerComponent } from '../../../shared/components/otp-channel-picker/otp-channel-picker.component';

type Step = 'phone' | 'otp' | 'newPassword' | 'done';

/**
 * استعادة كلمة السر عبر الهاتف — ثلاث خطوات فعلية على الباك:
 * password-reset/send-otp → password-reset/verify (يعيد ConfirmationToken)
 * → password-reset/confirm (يستهلك التوكن ويُبطل الجلسات).
 */
@Component({
  selector: 'app-phone-password-reset-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, TranslateModule, FormErrorComponent, PasswordRulesComponent, OtpChannelPickerComponent, OtpChannelFallbackComponent],
  templateUrl: './phone-password-reset.page.html',
  styleUrls: ['./phone-password-reset.page.scss']
})
export class PhonePasswordResetPage {
  private readonly fb = inject(FormBuilder);
  private readonly phoneAuth = inject(PhoneAuthApiService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly errorFocus = inject(AuthErrorFocusService);

  readonly step = signal<Step>('phone');
  readonly loading = signal(false);
  readonly submitted = signal(false);
  readonly error = signal('');
  readonly resendCooldown = signal(0);
  private resendTimer: ReturnType<typeof setInterval> | null = null;
  private challengeId = '';
  readonly channels = new OtpChannelState(this.phoneAuth, this.destroyRef);
  readonly sentChannel = signal<OtpChannel>('Sms');
  private confirmationToken = '';

  readonly phoneForm = this.fb.nonNullable.group({
    phoneNumber: ['', [Validators.required, phoneNumberValidator]]
  });

  readonly otpForm = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]]
  });

  readonly passwordForm = this.fb.nonNullable.group({
    // The server's rules (the name is not on this page, so only the phone number could be compared and
    // the server does that check; the list shown below never promises a rule this page cannot test).
    newPassword: ['', [Validators.required, passwordPolicyValidator()]],
    confirmPassword: ['', [Validators.required]]
  });

  constructor() {
    this.channels.watch(this.phoneForm.controls.phoneNumber);

    // A message about the previous attempt stops being true as soon as something is edited.
    const clear = (): void => {
      if (this.error()) {
        this.error.set('');
      }
    };
    this.phoneForm.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(clear);
    this.otpForm.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(clear);
    this.passwordForm.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(clear);
  }

  get maskedPhone(): string {
    const phone = this.phoneForm.controls.phoneNumber.value;
    return phone.length > 4 ? phone.slice(0, -4).replace(/\d/g, '•') + phone.slice(-4) : phone;
  }

  get resendDisabled(): boolean {
    return this.resendCooldown() > 0 || this.loading();
  }

  get passwordsMismatch(): boolean {
    const { newPassword, confirmPassword } = this.passwordForm.getRawValue();
    return this.submitted() && !!confirmPassword && newPassword !== confirmPassword;
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

    this.phoneAuth
      .sendPasswordResetOtp(this.phoneForm.controls.phoneNumber.value.trim(), this.channels.selected())
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
          this.step.set('otp');
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
    this.otpForm.reset();
  }

  verifyOtp(): void {
    if (this.loading()) {
      return;
    }

    this.submitted.set(true);

    if (this.otpForm.invalid) {
      this.otpForm.markAllAsTouched();
      this.errorFocus.request();
      return;
    }

    this.loading.set(true);
    this.error.set('');

    this.phoneAuth
      .verifyPasswordReset(this.challengeId, this.otpForm.controls.code.value, this.sentChannel())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.loading.set(false);

          if (!result.succeeded || !result.confirmationToken) {
            this.handleFailure({ status: 400, error: { code: result.errorCode } }, 'AUTH.ERRORS.VERIFY_OTP_FAILED');
            return;
          }

          this.confirmationToken = result.confirmationToken;
          this.clearResendTimer();
          this.step.set('newPassword');
          this.submitted.set(false);
        },
        error: error => {
          this.loading.set(false);
          // Verify is limited by attempts (5 per 15 minutes), not by codes requested.
          this.handleFailure(error, 'AUTH.ERRORS.VERIFY_OTP_FAILED', 'OTP_RATE_LIMITED');
        }
      });
  }

  submitNewPassword(): void {
    if (this.loading()) {
      return;
    }

    this.submitted.set(true);

    if (this.passwordForm.invalid || this.passwordsMismatch) {
      this.passwordForm.markAllAsTouched();
      this.errorFocus.request();
      return;
    }

    this.loading.set(true);
    this.error.set('');

    this.phoneAuth
      .confirmPasswordReset({
        phoneNumber: this.phoneForm.controls.phoneNumber.value.trim(),
        confirmationToken: this.confirmationToken,
        newPassword: this.passwordForm.controls.newPassword.value
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.loading.set(false);

          if (!result.succeeded) {
            this.handleFailure({ status: 400, error: { code: result.errorCode } }, 'AUTH.ERRORS.PASSWORD_RESET_FAILED');
            return;
          }

          this.step.set('done');
          this.toast.success(this.translate.instant('AUTH.PHONE_RESET.SUCCESS'));
        },
        error: error => {
          this.loading.set(false);
          this.handleFailure(error, 'AUTH.ERRORS.PASSWORD_RESET_FAILED');
        }
      });
  }

  goToLogin(): void {
    void this.router.navigateByUrl('/auth/login');
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
   * The reason goes on the field it is about (a wrong code under the code box, a weak password under the
   * password), anything else in the alert; the page scrolls to the first. Nothing typed is cleared.
   * On the code step a 429 means "too many wrong codes", not "too many codes requested".
   */
  private handleFailure(error: unknown, fallbackKey: string, rateLimitedCode?: string): void {
    const status = (error as { status?: number } | null)?.status;
    const source = status === 429 && rateLimitedCode ? { status: 400, error: { code: rateLimitedCode } } : error;
    const resolved = resolveAuthError(this.translate, source, { fallbackKey, passwordField: 'newPassword' });

    const controls: Partial<Record<AuthField, AbstractControl | null>> = {
      phone: this.phoneForm.controls.phoneNumber,
      code: this.otpForm.controls.code,
      newPassword: this.passwordForm.controls.newPassword
    };
    // Only the form of the visible step takes field errors; a leftover goes to the alert.
    const step = this.step();
    const visible: Partial<Record<AuthField, AbstractControl | null>> = {
      phone: step === 'phone' ? controls.phone : null,
      code: step === 'otp' ? controls.code : null,
      newPassword: step === 'newPassword' ? controls.newPassword : null
    };

    this.error.set(applyAuthFieldErrors(resolved, visible).join(' '));
    this.errorFocus.request();
  }
}
