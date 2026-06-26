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
const PHONE_PATTERN = /^\+?[0-9]{7,15}$/;

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
      background: #f7f7f7;
      padding: 2rem;
    }
    .auth-card {
      width: min(450px, 100%);
      background: #fff;
      padding: 2rem;
      border-radius: 16px;
      box-shadow: 0 10px 30px rgba(0,0,0,.08);
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
    input { border: 1px solid #cbd5e1; font-size: 1rem; }
    input:focus { outline: 2px solid #2563eb; border-color: #2563eb; }
    button {
      margin-top: 1rem;
      border: 0;
      background: #1e3a5f;
      color: white;
      font-weight: 700;
      cursor: pointer;
      font-size: 1rem;
    }
    button:disabled { opacity: .6; cursor: not-allowed; }
    .hint { color: #64748b; font-size: .8rem; }
    .error { color: #b00020; }
    .success { color: #137333; }
    .back-link { text-align: center; }
    .back-link a { color: #2563eb; }
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

    this.otpApi.sendOtp(this.form.getRawValue()).subscribe({
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
