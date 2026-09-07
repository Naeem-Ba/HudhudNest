import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { PhoneAuthApiService } from '../../../core/auth/phone-auth-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ConsentApiService } from '../../../core/api/consent-api.service';
import { PRIVACY_POLICY_VERSION } from '../../../core/models/consent-versions';
import { ToastService } from '../../../shared/services/toast.service';
import { FormErrorComponent } from '../../../shared/ui/form-error.component';
import { ConsentCheckboxComponent } from '../../../shared/components/consent-checkbox/consent-checkbox.component';
import { getPhoneWorkflowErrorMessage, PHONE_E164_PATTERN } from '../phone-auth-errors';

type Step = 'phone' | 'details';

/**
 * تسجيل حساب جديد عبر PhonePasswordAuthController
 * (registration/send-otp → registration/verify).
 * راجع: PropertyApi/Controllers/PhonePasswordAuthController.cs
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
    ConsentCheckboxComponent
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

  readonly step = signal<Step>('phone');
  readonly loading = signal(false);
  readonly submitted = signal(false);
  readonly error = signal('');

  // مربّع الموافقة على سياسة الخصوصية وشروط الاستخدام — غير محدَّد افتراضياً،
  // ومطلوب فعلياً، انظر docs/privacy/privacy-gaps.md (P1).
  readonly privacyConsentAccepted = signal(false);
  readonly resendCooldown = signal(0);
  private resendTimer: ReturnType<typeof setInterval> | null = null;
  private challengeId = '';

  readonly phoneForm = this.fb.nonNullable.group({
    phoneNumber: ['', [Validators.required, Validators.pattern(PHONE_E164_PATTERN)]]
  });

  readonly detailsForm = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
    firstName: ['', [Validators.required, Validators.minLength(2)]],
    lastName: ['', [Validators.required, Validators.minLength(2)]],
    password: ['', [Validators.required, Validators.minLength(8)]]
  });

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

    const phoneNumber = this.phoneForm.controls.phoneNumber.value.trim();

    this.phoneAuth
      .sendRegistrationOtp(phoneNumber)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.loading.set(false);

          if (!result.succeeded || !result.challengeId) {
            this.setError(getPhoneWorkflowErrorMessage(this.translate, result.errorCode, 'AUTH.ERRORS.SEND_OTP_FAILED'));
            return;
          }

          this.challengeId = result.challengeId;
          this.step.set('details');
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
    this.detailsForm.reset();
  }

  submitDetails(): void {
    this.submitted.set(true);

    if (this.detailsForm.invalid || this.loading()) {
      this.detailsForm.markAllAsTouched();
      return;
    }

    // دفاع إضافي: زر الإرسال معطَّل بدون الموافقة أصلاً، لكن Enter داخل حقل النموذج
    // قد يُطلق (ngSubmit) في بعض المتصفحات حتى مع تعطيل الزر.
    if (!this.privacyConsentAccepted()) {
      return;
    }

    this.loading.set(true);
    this.error.set('');

    const { code, firstName, lastName, password } = this.detailsForm.getRawValue();

    this.phoneAuth
      .register({ challengeId: this.challengeId, code, firstName, lastName, password })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.loading.set(false);

          if (!result.succeeded || !result.accessToken) {
            this.setError(getPhoneWorkflowErrorMessage(this.translate, result.errorCode, 'AUTH.ERRORS.VERIFY_OTP_FAILED'));
            return;
          }

          this.clearResendTimer();
          this.authService.restoreSession();
          this.authService.validateSession();
          this.toast.success(this.translate.instant('AUTH.REGISTER_SUCCESS'));

          // بخلاف التسجيل بالبريد، تسجيل الدخول بالهاتف يُصدر رمز وصول فوراً — لذلك
          // نسجّل الموافقة الآن عبر النقطة العامة الموثَّقة بدل تمريرها ضمن نموذج
          // التسجيل نفسه. فشل هذا النداء لا يوقف تسجيل الدخول (best-effort).
          this.consentApi.record('PrivacyPolicy', PRIVACY_POLICY_VERSION).subscribe({
            error: () => { /* غير حرج — انظر التعليق أعلاه. */ }
          });

          const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/home';
          void this.router.navigateByUrl(returnUrl);
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
