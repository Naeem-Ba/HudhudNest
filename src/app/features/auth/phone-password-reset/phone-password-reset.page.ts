import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { PhoneAuthApiService } from '../../../core/auth/phone-auth-api.service';
import { ToastService } from '../../../shared/services/toast.service';
import { FormErrorComponent } from '../../../shared/ui/form-error.component';
import { getPhoneWorkflowErrorMessage } from '../phone-auth-errors';
import { phoneNumberValidator } from '../../../core/auth/phone-number';

type Step = 'phone' | 'otp' | 'newPassword' | 'done';

/**
 * استعادة كلمة السر عبر الهاتف — ثلاث خطوات فعلية على الباك:
 * password-reset/send-otp → password-reset/verify (يعيد ConfirmationToken)
 * → password-reset/confirm (يستهلك التوكن ويُبطل الجلسات).
 */
@Component({
  selector: 'app-phone-password-reset-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, TranslateModule, FormErrorComponent],
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

  readonly step = signal<Step>('phone');
  readonly loading = signal(false);
  readonly submitted = signal(false);
  readonly error = signal('');
  readonly resendCooldown = signal(0);
  private resendTimer: ReturnType<typeof setInterval> | null = null;
  private challengeId = '';
  private confirmationToken = '';

  readonly phoneForm = this.fb.nonNullable.group({
    phoneNumber: ['', [Validators.required, phoneNumberValidator]]
  });

  readonly otpForm = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]]
  });

  readonly passwordForm = this.fb.nonNullable.group({
    newPassword: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', [Validators.required]]
  });

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
    this.submitted.set(true);

    if (this.phoneForm.invalid || this.loading()) {
      this.phoneForm.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.error.set('');

    this.phoneAuth
      .sendPasswordResetOtp(this.phoneForm.controls.phoneNumber.value.trim())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.loading.set(false);

          if (!result.succeeded || !result.challengeId) {
            this.setError(getPhoneWorkflowErrorMessage(this.translate, result.errorCode, 'AUTH.ERRORS.SEND_OTP_FAILED'));
            return;
          }

          this.challengeId = result.challengeId;
          this.step.set('otp');
          this.submitted.set(false);
          this.toast.success(this.translate.instant('AUTH.SEND_OTP_SUCCESS'));
          this.startResendCooldown(60);
        },
        error: error => {
          this.loading.set(false);
          this.setError(getPhoneWorkflowErrorMessage(this.translate, this.readErrorCode(error), 'AUTH.ERRORS.SEND_OTP_FAILED', error));
        }
      });
  }

  resendOtp(): void {
    if (this.resendDisabled) {
      return;
    }
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
    this.submitted.set(true);

    if (this.otpForm.invalid || this.loading()) {
      this.otpForm.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.error.set('');

    this.phoneAuth
      .verifyPasswordReset(this.challengeId, this.otpForm.controls.code.value)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.loading.set(false);

          if (!result.succeeded || !result.confirmationToken) {
            this.setError(getPhoneWorkflowErrorMessage(this.translate, result.errorCode, 'AUTH.ERRORS.VERIFY_OTP_FAILED'));
            return;
          }

          this.confirmationToken = result.confirmationToken;
          this.clearResendTimer();
          this.step.set('newPassword');
          this.submitted.set(false);
        },
        error: error => {
          this.loading.set(false);
          this.setError(getPhoneWorkflowErrorMessage(this.translate, this.readErrorCode(error), 'AUTH.ERRORS.VERIFY_OTP_FAILED', error));
        }
      });
  }

  submitNewPassword(): void {
    this.submitted.set(true);

    if (this.passwordForm.invalid || this.loading() || this.passwordsMismatch) {
      this.passwordForm.markAllAsTouched();
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
            this.setError(getPhoneWorkflowErrorMessage(this.translate, result.errorCode, 'AUTH.ERRORS.PASSWORD_RESET_FAILED'));
            return;
          }

          this.step.set('done');
          this.toast.success(this.translate.instant('AUTH.PHONE_RESET.SUCCESS'));
        },
        error: error => {
          this.loading.set(false);
          this.setError(getPhoneWorkflowErrorMessage(this.translate, this.readErrorCode(error), 'AUTH.ERRORS.PASSWORD_RESET_FAILED', error));
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

  private readErrorCode(error: unknown): string | undefined {
    const response = error as { status?: number; error?: { code?: string; Code?: string } };
    if (response.status === 429) {
      return 'RATE_LIMITED';
    }
    return response.error?.code ?? response.error?.Code;
  }

  private setError(message: string): void {
    // toast.error() removed on purpose — see phone-change.page.ts's setError comment.
    this.error.set(message);
  }
}
