import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { OtpApiService } from '../../../core/services/otp-api.service';
import { FormErrorComponent } from '../../../shared/ui/form-error.component';
import { ToastService } from '../../../shared/services/toast.service';

@Component({
  selector: 'app-verify-otp-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, TranslateModule, FormErrorComponent],
  template: `
    <section class="auth-page">
      <form class="auth-card" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <h1>{{ 'AUTH.VERIFY_OTP_TITLE' | translate }}</h1>

        <label>{{ 'AUTH.PHONE' | translate }}</label>
        <input formControlName="phoneNumber" [placeholder]="'AUTH.PHONE_PLACEHOLDER' | translate" autocomplete="tel">
        <app-form-error [control]="form.controls.phoneNumber" [submitted]="submitted()"></app-form-error>

        <label>{{ 'AUTH.OTP_CODE' | translate }}</label>
        <input formControlName="code" [placeholder]="'AUTH.OTP_CODE' | translate" inputmode="numeric">
        <app-form-error [control]="form.controls.code" [submitted]="submitted()"></app-form-error>

        <button [disabled]="form.invalid || loading()">
          <ng-container *ngIf="loading(); else verifyText">⏳ {{ 'AUTH.LOADING' | translate }}</ng-container>
          <ng-template #verifyText>{{ 'AUTH.VERIFY_OTP_BUTTON' | translate }}</ng-template>
        </button>

        <p class="error" *ngIf="error()">⚠️ {{ error() }}</p>
      </form>
    </section>
  `,
  styles: [`
    .auth-page{min-height:70vh;display:grid;place-items:center;background:#f7f7f7;padding:2rem}.auth-card{width:min(450px,100%);background:#fff;padding:2rem;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.08);display:grid;gap:.55rem}h1,p{margin:0}label{font-weight:700;margin-top:.5rem}input,button{width:100%;box-sizing:border-box;padding:.85rem 1rem;border-radius:10px}input{border:1px solid #cbd5e1}button{margin-top:1rem;border:0;background:#1e3a5f;color:white;font-weight:700;cursor:pointer}button:disabled{opacity:.6;cursor:not-allowed}.error{color:#b00020}
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
    phoneNumber: ['', Validators.required],
    code: ['', Validators.required]
  });

  submit(): void {
    this.submitted.set(true);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.error.set('');

    this.otpApi.verifyOtp(this.form.getRawValue()).subscribe({
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
