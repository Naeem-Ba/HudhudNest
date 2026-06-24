import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AuthApiService } from '../../../core/services/auth-api.service';
import { FormErrorComponent } from '../../../shared/ui/form-error.component';
import { ToastService } from '../../../shared/services/toast.service';

@Component({
  selector: 'app-reset-password-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, TranslateModule, FormErrorComponent],
  template: `
    <section class="auth-page">
      <form class="auth-card" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <h1>{{ 'AUTH.RESET_TITLE' | translate }}</h1>

        <label>{{ 'AUTH.EMAIL' | translate }}</label>
        <input formControlName="email" [placeholder]="'AUTH.EMAIL_PLACEHOLDER' | translate" autocomplete="email">
        <app-form-error [control]="form.controls.email" [submitted]="submitted()"></app-form-error>

        <label>{{ 'AUTH.RESET_TOKEN' | translate }}</label>
        <input formControlName="token" [placeholder]="'AUTH.RESET_TOKEN' | translate">
        <app-form-error [control]="form.controls.token" [submitted]="submitted()"></app-form-error>

        <label>{{ 'AUTH.NEW_PASSWORD' | translate }}</label>
        <input type="password" formControlName="newPassword" placeholder="••••••••" autocomplete="new-password">
        <app-form-error [control]="form.controls.newPassword" [submitted]="submitted()" [messages]="passwordMessages"></app-form-error>

        <button [disabled]="form.invalid || loading()">
          <ng-container *ngIf="loading(); else resetText">⏳ {{ 'AUTH.LOADING' | translate }}</ng-container>
          <ng-template #resetText>{{ 'AUTH.RESET_BUTTON' | translate }}</ng-template>
        </button>

        <p class="success" *ngIf="success()">✅ {{ success() }}</p>
        <p class="error" *ngIf="error()">⚠️ {{ error() }}</p>
      </form>
    </section>
  `,
  styles: [`
    .auth-page{min-height:70vh;display:grid;place-items:center;background:#f7f7f7;padding:2rem}.auth-card{width:min(450px,100%);background:#fff;padding:2rem;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.08);display:grid;gap:.55rem}h1,p{margin:0}label{font-weight:700;margin-top:.5rem}input,button{width:100%;box-sizing:border-box;padding:.85rem 1rem;border-radius:10px}input{border:1px solid #cbd5e1}button{margin-top:1rem;border:0;background:#1e3a5f;color:white;font-weight:700;cursor:pointer}button:disabled{opacity:.6;cursor:not-allowed}.error{color:#b00020}.success{color:#137333}
  `]
})
export class ResetPasswordPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthApiService);
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(false);
  readonly submitted = signal(false);
  readonly error = signal('');
  readonly success = signal('');

  get passwordMessages(): Record<string, string> {
    return {
      minlength: this.translate.instant('AUTH.ERRORS.PASSWORD_MIN')
    };
  }

 readonly form = this.fb.nonNullable.group({
  email: ['', [Validators.required, Validators.email]],
  token: ['', Validators.required],
  newPassword: ['', [Validators.required, Validators.minLength(8)]],
  confirmPassword: ['', [Validators.required, Validators.minLength(8)]]
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

    const raw = this.form.getRawValue();

    if (raw.newPassword !== raw.confirmPassword) {
      const message = this.translate.instant('AUTH.ERRORS.PASSWORD_MISMATCH');
      this.error.set(message);
      this.toast.error(message);
      return;
    }

    this.auth.resetPassword({
      email: raw.email,
      token: raw.token,
      newPassword: raw.newPassword,
      confirmPassword: raw.confirmPassword
    }).subscribe({
      next: () => {
        this.loading.set(false);
        const message = this.translate.instant('AUTH.RESET_SUCCESS');
        this.success.set(message);
        this.toast.success(message);
      },
      error: () => {
        this.loading.set(false);
        this.error.set(this.translate.instant('AUTH.ERRORS.RESET_FAILED'));
      }
    });
  }
}
