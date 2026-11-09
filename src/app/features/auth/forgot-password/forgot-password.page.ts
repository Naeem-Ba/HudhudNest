import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { isRateLimited } from '../../../core/api/rate-limited';
import { AuthApiService } from '../../../core/auth/auth-api.service';
import { AuthErrorFocusService } from '../../../core/auth/auth-error-focus.service';
import { resolveAuthError } from '../auth-error';
import { FormErrorComponent } from '../../../shared/ui/form-error.component';
import { ToastService } from '../../../shared/services/toast.service';

@Component({
  selector: 'app-forgot-password-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, TranslateModule, FormErrorComponent],
  template: `
    <section class="auth-page">
      <form class="auth-card" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <h1>{{ 'AUTH.FORGOT_TITLE' | translate }}</h1>
        <p>{{ 'AUTH.FORGOT_SUBTITLE' | translate }}</p>

        <label for="forgot-password-f1">{{ 'AUTH.EMAIL' | translate }}</label>
        <input id="forgot-password-f1" formControlName="email" [placeholder]="'AUTH.EMAIL_PLACEHOLDER' | translate" autocomplete="email">
        <app-form-error [control]="form.controls.email" [submitted]="submitted()" [messages]="emailMessages"></app-form-error>

        <button [disabled]="loading()">
          <ng-container *ngIf="loading(); else sendText">⏳ {{ 'AUTH.SENDING' | translate }}</ng-container>
          <ng-template #sendText>{{ 'AUTH.SEND_RESET_LINK' | translate }}</ng-template>
        </button>

        <p class="success" *ngIf="success()">✅ {{ success() }}</p>
        <p class="error" role="alert" data-auth-form-error *ngIf="error()">⚠️ {{ error() }}</p>
      </form>
    </section>
  `,
  styles: [`
    .auth-page{min-height:70vh;display:grid;place-items:center;background:var(--page-bg);padding:2rem}.auth-card{width:min(450px,100%);background:var(--surface);padding:2rem;border-radius:16px;box-shadow:var(--shadow-lg);display:grid;gap:.55rem}h1,p{margin:0}p{line-height:1.7}label{font-weight:700;margin-top:.5rem}input,button{width:100%;box-sizing:border-box;padding:.85rem 1rem;border-radius:10px}input{border:1px solid var(--border);background:var(--surface)}button{margin-top:1rem;border:0;background:var(--primary);color:var(--on-primary);font-weight:700;cursor:pointer}button:hover:not(:disabled){background:var(--primary-dark)}button:disabled{opacity:.6;cursor:not-allowed}.error{color:var(--danger-text)}.success{color:var(--success-text)}
  `]
})
export class ForgotPasswordPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthApiService);
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(false);
  readonly submitted = signal(false);
  readonly error = signal('');
  readonly success = signal('');

  private readonly errorFocus = inject(AuthErrorFocusService);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]]
  });

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      if (this.error()) {
        this.error.set('');
      }
    });
  }

  get emailMessages(): Record<string, string> {
    return {
      required: this.translate.instant('AUTH.ERRORS.EMAIL_REQUIRED'),
      email: this.translate.instant('AUTH.ERRORS.INVALID_EMAIL')
    };
  }

  submit(): void {
    if (this.loading()) {
      return;
    }

    this.submitted.set(true);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorFocus.request();
      return;
    }

    this.loading.set(true);
    this.error.set('');
    this.success.set('');

    this.auth.forgotPassword(this.form.getRawValue()).subscribe({
      next: () => {
        this.loading.set(false);
        const message = this.translate.instant('AUTH.FORGOT_SUCCESS');
        this.success.set(message);
        this.toast.success(message);
      },
      error: error => {
        this.loading.set(false);
        // 429: say it is the limit (3 requests per hour), not that sending failed.
        this.error.set(
          isRateLimited(error)
            ? this.translate.instant('AUTH.ERRORS.PASSWORD_RESET_LIMIT')
            : (resolveAuthError(this.translate, error, { fallbackKey: 'AUTH.ERRORS.FORGOT_FAILED' }).message ??
                this.translate.instant('AUTH.ERRORS.FORGOT_FAILED'))
        );
        this.errorFocus.request();
      }
    });
  }
}
