// =====================================================================
// ✅ FIX #10 – send-otp.page.ts
// المشكلة: حقل رقم الهاتف يقبل أي نص (Validators.required فقط)
// الحل: إضافة Validators.pattern للتحقق من صيغة رقم الهاتف الدولي
// =====================================================================
import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { OtpApiService } from '../../../core/api/otp-api.service';
import { FormErrorComponent } from '../../../shared/ui/form-error.component';
import { ToastService } from '../../../shared/services/toast.service';

// ✅ FIX #10: Pattern للهاتف الدولي (اختياري + أو 00 ثم 7 إلى 15 رقم)
const PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;

@Component({
  selector: 'app-send-otp-page',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    TranslateModule,
    FormErrorComponent
  ],
  template: `
    <section class="auth-page">
      <form class="auth-card" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <h1>{{ 'AUTH.SEND_OTP_TITLE' | translate }}</h1>

        <label for="phone">{{ 'AUTH.PHONE' | translate }}</label>
        <input
          id="phone"
          formControlName="phoneNumber"
          type="tel"
          [placeholder]="'AUTH.PHONE_PLACEHOLDER' | translate"
          autocomplete="tel"
          inputmode="tel"
          dir="ltr"
        >

        <!-- ✅ FIX #10: رسائل خطأ محددة لكل نوع خطأ -->
        <app-form-error
          [control]="form.controls.phoneNumber"
          [submitted]="submitted()"
          [messages]="{
            required: 'AUTH.ERRORS.PHONE_REQUIRED' | translate,
            pattern: 'AUTH.ERRORS.PHONE_INVALID' | translate
          }"
        ></app-form-error>

        <!-- مثال على صيغة صحيحة -->
        <small class="hint">{{ 'AUTH.PHONE_HINT' | translate }}</small>

        <button type="submit" [disabled]="form.invalid || loading()">
          <ng-container *ngIf="loading(); else sendText">
            ⏳ {{ 'AUTH.SENDING' | translate }}
          </ng-container>
          <ng-template #sendText>
            {{ 'AUTH.SEND_OTP_BUTTON' | translate }}
          </ng-template>
        </button>

        <p class="success" *ngIf="success()" role="status">
          ✅ {{ success() }}
        </p>
        <p class="error" *ngIf="error()" role="alert">
          ⚠️ {{ error() }}
        </p>

        <p class="back-link">
          <a routerLink="/auth/login">{{ 'AUTH.BACK_TO_LOGIN' | translate }}</a>
        </p>
      </form>
    </section>
  `,
  styles: [`
    .auth-page {
      min-height: 70vh;
      display: grid;
      place-items: center;
      background: var(--page-bg);
      padding: 2rem;
    }
    .auth-card {
      width: min(450px, 100%);
      background: var(--surface);
      padding: 2rem;
      border-radius: 16px;
      box-shadow: var(--shadow-lg);
      display: grid;
      gap: .55rem;
    }
    h1, p { margin: 0; }
    label { font-weight: 700; margin-top: .5rem; }
    input, button {
      width: 100%;
      box-sizing: border-box;
      padding: .85rem 1rem;
      border-radius: 10px;
    }
    input { border: 1px solid var(--border); background: var(--surface); font-size: 1rem; }
    input:focus { outline: 2px solid var(--primary); border-color: var(--primary); }
    button {
      margin-top: 1rem;
      border: 0;
      background: var(--gray-800);
      color: white;
      font-weight: 700;
      cursor: pointer;
      font-size: 1rem;
    }
    button:disabled { opacity: .6; cursor: not-allowed; }
    .hint { color: var(--gray-500); font-size: .8rem; }
    .error { color: var(--danger); }
    .success { color: var(--success); }
    .back-link { text-align: center; }
    .back-link a { color: var(--primary); }
  `]
})
export class SendOtpPage {
  private readonly fb        = inject(FormBuilder);
  private readonly otpApi    = inject(OtpApiService);
  private readonly translate = inject(TranslateService);
  private readonly toast     = inject(ToastService);

  readonly loading   = signal(false);
  readonly submitted = signal(false);
  readonly error     = signal('');
  readonly success   = signal('');

  // ✅ FIX #10: إضافة Validators.pattern
  readonly form = this.fb.nonNullable.group({
    phoneNumber: [
      '',
      [
        Validators.required,
        Validators.pattern(PHONE_PATTERN)   // ← هنا التحقق من الصيغة
      ]
    ]
  });

  submit(): void {
    this.submitted.set(true);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.error.set('');
    this.success.set('');

    this.otpApi.sendOtp({
      ...this.form.getRawValue(),
      phoneNumber: this.form.controls.phoneNumber.value.trim()
    }).subscribe({
      next: () => {
        this.loading.set(false);
        const message = this.translate.instant('AUTH.SEND_OTP_SUCCESS');
        this.success.set(message);
        this.toast.success(message);
      },
      error: () => {
        this.loading.set(false);
        this.error.set(this.translate.instant('AUTH.ERRORS.SEND_OTP_FAILED'));
      }
    });
  }
}
