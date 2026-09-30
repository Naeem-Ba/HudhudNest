import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { PhoneAuthApiService } from '../../../core/auth/phone-auth-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/services/toast.service';
import { FormErrorComponent } from '../../../shared/ui/form-error.component';
import { getPhoneWorkflowErrorMessage } from '../phone-auth-errors';
import { phoneNumberValidator } from '../../../core/auth/phone-number';
import { OtpChannelState } from '../../../core/auth/otp-channel-state';
import { OtpChannel } from '../../../core/models/auth.model';
import { OtpChannelFallbackComponent } from '../../../shared/components/otp-channel-picker/otp-channel-fallback.component';
import { OtpChannelPickerComponent } from '../../../shared/components/otp-channel-picker/otp-channel-picker.component';

type Step = 'phone' | 'verify' | 'done';

/**
 * تغيير رقم الهاتف من داخل البروفايل —
 * change/send-otp (للرقم الجديد) → change/verify (كود + كلمة السر الحالية).
 * يُبطل الجلسات النشطة الأخرى على الباك عند النجاح.
 */
@Component({
  selector: 'app-phone-change-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, TranslateModule, FormErrorComponent, OtpChannelPickerComponent, OtpChannelFallbackComponent],
  templateUrl: './phone-change.page.html',
  styleUrls: ['./phone-change.page.scss']
})
export class PhoneChangePage {
  private readonly fb = inject(FormBuilder);
  private readonly phoneAuth = inject(PhoneAuthApiService);
  private readonly authService = inject(AuthService);
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
  readonly channels = new OtpChannelState(this.phoneAuth, this.destroyRef);
  readonly sentChannel = signal<OtpChannel>('Sms');

  readonly phoneForm = this.fb.nonNullable.group({
    phoneNumber: ['', [Validators.required, phoneNumberValidator]]
  });

  readonly verifyForm = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
    currentPassword: ['', [Validators.required]]
  });

  constructor() {
    this.channels.watch(this.phoneForm.controls.phoneNumber);
  }

  get maskedPhone(): string {
    const phone = this.phoneForm.controls.phoneNumber.value;
    return phone.length > 4 ? phone.slice(0, -4).replace(/\d/g, '•') + phone.slice(-4) : phone;
  }

  get resendDisabled(): boolean {
    return this.resendCooldown() > 0 || this.loading();
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
      .sendPhoneChangeOtp(this.phoneForm.controls.phoneNumber.value.trim(), this.channels.selected())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.loading.set(false);

          if (!result.succeeded || !result.challengeId) {
            this.setError(getPhoneWorkflowErrorMessage(this.translate, result.errorCode, 'AUTH.ERRORS.SEND_OTP_FAILED'));
            return;
          }

          this.challengeId = result.challengeId;
          this.sentChannel.set(result.channel ?? this.channels.selected());
          this.step.set('verify');
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
    this.verifyForm.reset();
  }

  submitVerify(): void {
    this.submitted.set(true);

    if (this.verifyForm.invalid || this.loading()) {
      this.verifyForm.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.error.set('');

    const { code, currentPassword } = this.verifyForm.getRawValue();

    this.phoneAuth
      .verifyPhoneChange({ challengeId: this.challengeId, code, currentPassword, channel: this.sentChannel() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.loading.set(false);

          if (!result.succeeded) {
            this.setError(getPhoneWorkflowErrorMessage(this.translate, result.errorCode, 'AUTH.ERRORS.VERIFY_OTP_FAILED'));
            return;
          }

          this.clearResendTimer();

          // الباك يُبطل الجلسات النشطة الأخرى؛ إن أعاد زوجًا جديدًا من
          // الرموز (مخزَّن تلقائيًا داخل الخدمة) تبقى الجلسة الحالية سارية.
          if (result.accessToken) {
            this.authService.restoreSession();
            this.authService.validateSession();
          }

          this.step.set('done');
          this.toast.success(this.translate.instant('AUTH.PHONE_CHANGE.SUCCESS'));
        },
        error: error => {
          this.loading.set(false);
          this.setError(getPhoneWorkflowErrorMessage(this.translate, this.readErrorCode(error), 'AUTH.ERRORS.VERIFY_OTP_FAILED', error));
        }
      });
  }

  goToProfile(): void {
    void this.router.navigateByUrl('/profile');
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
    // toast.error() removed on purpose — the inline error() signal below is already
    // rendered in the template, and ApiErrorInterceptor no longer auto-toasts /auth/
    // requests either (see its isAuthFlowRequest), so this was showing the same
    // message twice for every failure on this page.
    this.error.set(message);
  }
}
