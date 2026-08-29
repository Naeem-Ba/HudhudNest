import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { OtpApiService } from '../../../core/api/otp-api.service';
import { FormErrorComponent } from '../../../shared/ui/form-error.component';
import { ToastService } from '../../../shared/services/toast.service';

const PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;
const OTP_CODE_PATTERN = /^\d{6}$/;

@Component({
  selector: 'app-verify-otp-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, TranslateModule, FormErrorComponent],
  template: `
    <section class="auth-page">
      <form class="auth-card" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <h1>{{ 'AUTH.VERIFY_OTP_TITLE' | translate }}</h1>

        <label>{{ 'AUTH.PHONE' | translate }}</label>
        <input
          formControlName="phoneNumber"
          type="tel"
          [placeholder]="'AUTH.PHONE_PLACEHOLDER' | translate"
          autocomplete="tel"
          inputmode="tel"
          dir="ltr"
        >
        <app-form-error
          [control]="form.controls.phoneNumber"
          [submitted]="submitted()"
          [messages]="{
            required: 'AUTH.ERRORS.PHONE_REQUIRED' | translate,
            pattern: 'AUTH.ERRORS.PHONE_INVALID' | translate
          }"
        ></app-form-error>

        <label>{{ 'AUTH.OTP_CODE' | translate }}</label>
        <input
          formControlName="code"
          [placeholder]="'AUTH.OTP_CODE' | translate"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="6"
          dir="ltr"
        >
        <app-form-error
          [control]="form.controls.code"
          [submitted]="submitted()"
          [messages]="{
            required: 'AUTH.ERRORS.OTP_REQUIRED' | translate,
            minlength: 'AUTH.ERRORS.OTP_INVALID' | translate,
            maxlength: 'AUTH.ERRORS.OTP_INVALID' | translate,
            pattern: 'AUTH.ERRORS.OTP_INVALID' | translate
          }"
        ></app-form-error>

        <button [disabled]="form.invalid || loading()">
          <ng-container *ngIf="loading(); else verifyText">⏳ {{ 'AUTH.LOADING' | translate }}</ng-container>
          <ng-template #verifyText>{{ 'AUTH.VERIFY_OTP_BUTTON' | translate }}</ng-template>
        </button>

        <p class="error" *ngIf="error()">⚠️ {{ error() }}</p>
      </form>
    </section>
  `,
  styles: [`
    .auth-page{min-height:70vh;display:grid;place-items:center;background:var(--page-bg);padding:2rem}.auth-card{width:min(450px,100%);background:var(--surface);padding:2rem;border-radius:16px;box-shadow:var(--shadow-lg);display:grid;gap:.55rem}h1,p{margin:0}label{font-weight:700;margin-top:.5rem}input,button{width:100%;box-sizing:border-box;padding:.85rem 1rem;border-radius:10px}input{border:1px solid var(--border);background:var(--surface)}button{margin-top:1rem;border:0;background:var(--gray-800);color:white;font-weight:700;cursor:pointer}button:disabled{opacity:.6;cursor:not-allowed}.error{color:var(--danger)}
  `]
})
export class VerifyOtpPage {
  private readonly fb = inject(FormBuilder);
  private readonly otpApi = inject(OtpApiService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(false);
  readonly submitted = signal(false);
  readonly error = signal('');

  readonly form = this.fb.nonNullable.group({
    phoneNumber: ['', [Validators.required, Validators.pattern(PHONE_PATTERN)]],
    code: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(6), Validators.pattern(OTP_CODE_PATTERN)]]
  });

  submit(): void {
    this.submitted.set(true);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.error.set('');

    const raw = this.form.getRawValue();

    this.otpApi.verifyOtp({
      phoneNumber: raw.phoneNumber.trim(),
      code: raw.code.trim()
    }).subscribe({
      next: () => {
        this.toast.success(this.translate.instant('AUTH.VERIFY_OTP_SUCCESS'));
        this.router.navigate(['/home']);
      },
      error: () => {
        this.loading.set(false);
        this.error.set(this.translate.instant('AUTH.ERRORS.VERIFY_OTP_FAILED'));
      }
    });
  }
}
