import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { PhoneAuthApiService } from '../../../core/auth/phone-auth-api.service';
import { PhoneVerificationState } from '../../../core/models/auth.model';
import { ToastService } from '../../../shared/services/toast.service';
import { FormErrorComponent } from '../../../shared/ui/form-error.component';
import { getPhoneWorkflowErrorMessage, PHONE_E164_PATTERN } from '../phone-auth-errors';

type Step = 'status' | 'phone' | 'otp' | 'done';

/**
 * إعادة تحقق الهوية لحساب "مستحق قريبًا/في فترة سماح/مقيَّد" —
 * GET reverification/status → POST reverification/send-otp → reverification/verify.
 * راجع مخطط الحالة (state machine) في phone-password-authentication-and-reverification.md.
 */
@Component({
  selector: 'app-phone-reverify-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, TranslateModule, FormErrorComponent],
  templateUrl: './phone-reverify.page.html',
  styleUrls: ['./phone-reverify.page.scss']
})
export class PhoneReverifyPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly phoneAuth = inject(PhoneAuthApiService);
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly VerificationState = PhoneVerificationState;

  readonly step = signal<Step>('status');
  readonly loadingStatus = signal(true);
  readonly loading = signal(false);
  readonly submitted = signal(false);
  readonly error = signal('');
  readonly resendCooldown = signal(0);
  private resendTimer: ReturnType<typeof setInterval> | null = null;
  private challengeId = '';

  readonly verificationState = signal<PhoneVerificationState | null>(null);
  readonly dueAtUtc = signal<string | null>(null);
  readonly graceEndsAtUtc = signal<string | null>(null);

  readonly phoneForm = this.fb.nonNullable.group({
    phoneNumber: ['', [Validators.required, Validators.pattern(PHONE_E164_PATTERN)]]
  });

  readonly otpForm = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]]
  });

  ngOnInit(): void {
    this.loadStatus();
  }

  get needsAction(): boolean {
    const state = this.verificationState();
    return (
      state === PhoneVerificationState.DueSoon ||
      state === PhoneVerificationState.GracePeriod ||
      state === PhoneVerificationState.Restricted
    );
  }

  get resendDisabled(): boolean {
    return this.resendCooldown() > 0 || this.loading();
  }

  loadStatus(): void {
    this.loadingStatus.set(true);
    this.error.set('');

    this.phoneAuth
      .getReverificationStatus()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.loadingStatus.set(false);

          if (!result.succeeded) {
            this.setError(getPhoneWorkflowErrorMessage(this.translate, result.errorCode, 'AUTH.ERRORS.STATUS_FAILED'));
            return;
          }

          this.verificationState.set(result.verificationState ?? null);
          this.dueAtUtc.set(result.dueAtUtc ?? null);
          this.graceEndsAtUtc.set(result.graceEndsAtUtc ?? null);
        },
        error: error => {
          this.loadingStatus.set(false);
          this.setError(getPhoneWorkflowErrorMessage(this.translate, this.readErrorCode(error), 'AUTH.ERRORS.STATUS_FAILED', error));
        }
      });
  }

  startReverification(): void {
    this.step.set('phone');
    this.error.set('');
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
      .sendReverificationOtp(this.phoneForm.controls.phoneNumber.value.trim())
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

  verifyOtp(): void {
    this.submitted.set(true);

    if (this.otpForm.invalid || this.loading()) {
      this.otpForm.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.error.set('');

    this.phoneAuth
      .verifyReverification(this.challengeId, this.otpForm.controls.code.value)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.loading.set(false);

          if (!result.succeeded) {
            this.setError(getPhoneWorkflowErrorMessage(this.translate, result.errorCode, 'AUTH.ERRORS.VERIFY_OTP_FAILED'));
            return;
          }

          this.clearResendTimer();
          this.verificationState.set(PhoneVerificationState.Verified);
          this.step.set('done');
          this.toast.success(this.translate.instant('AUTH.PHONE_REVERIFY.SUCCESS'));
        },
        error: error => {
          this.loading.set(false);
          this.setError(getPhoneWorkflowErrorMessage(this.translate, this.readErrorCode(error), 'AUTH.ERRORS.VERIFY_OTP_FAILED', error));
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

  private readErrorCode(error: unknown): string | undefined {
    const response = error as { status?: number; error?: { code?: string; Code?: string } };
    if (response.status === 429) {
      return 'RATE_LIMITED';
    }
    return response.error?.code ?? response.error?.Code;
  }

  private setError(message: string): void {
    this.error.set(message);
    this.toast.error(message);
  }
}
