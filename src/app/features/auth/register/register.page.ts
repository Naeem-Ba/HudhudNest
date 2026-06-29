import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { AuthApiService } from '../../../core/auth/auth-api.service';
import { FormErrorComponent } from '../../../shared/ui/form-error.component';
import { ToastService } from '../../../shared/services/toast.service';

@Component({
  selector: 'app-register-page',
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
        <h1>{{ 'AUTH.REGISTER_TITLE' | translate }}</h1>
        <p>{{ 'AUTH.REGISTER_SUBTITLE' | translate }}</p>

        <label for="firstName">{{ 'AUTH.FIRST_NAME' | translate }}</label>
        <input
          id="firstName"
          type="text"
          formControlName="firstName"
          [placeholder]="'AUTH.FIRST_NAME_PLACEHOLDER' | translate"
          autocomplete="given-name"
        />
        <app-form-error
          [control]="form.controls.firstName"
          [submitted]="submitted()"
          [messages]="firstNameMessages">
        </app-form-error>

        <label for="lastName">{{ 'AUTH.LAST_NAME' | translate }}</label>
        <input
          id="lastName"
          type="text"
          formControlName="lastName"
          [placeholder]="'AUTH.LAST_NAME_PLACEHOLDER' | translate"
          autocomplete="family-name"
        />
        <app-form-error
          [control]="form.controls.lastName"
          [submitted]="submitted()"
          [messages]="lastNameMessages">
        </app-form-error>

        <label for="email">{{ 'AUTH.EMAIL' | translate }}</label>
        <input
          id="email"
          type="email"
          formControlName="email"
          [placeholder]="'AUTH.EMAIL_PLACEHOLDER' | translate"
          autocomplete="email"
        />
        <app-form-error
          [control]="form.controls.email"
          [submitted]="submitted()">
        </app-form-error>

        <label for="password">{{ 'AUTH.PASSWORD' | translate }}</label>
        <input
          id="password"
          type="password"
          formControlName="password"
          placeholder="••••••••"
          autocomplete="new-password"
        />
        <app-form-error
          [control]="form.controls.password"
          [submitted]="submitted()"
          [messages]="passwordMessages">
        </app-form-error>

        <button type="submit" [disabled]="form.invalid || loading()">
          <ng-container *ngIf="loading(); else registerText">
            ⏳ {{ 'AUTH.LOADING' | translate }}
          </ng-container>

          <ng-template #registerText>
            {{ 'AUTH.REGISTER_BUTTON' | translate }}
          </ng-template>
        </button>

        <p class="error" *ngIf="error()">⚠️ {{ error() }}</p>

        <a routerLink="/auth/login">
          {{ 'AUTH.GO_LOGIN' | translate }}
        </a>
      </form>
    </section>
  `,
  styles: [`
    .auth-page {
      min-height: 70vh;
      display: grid;
      place-items: center;
      background: #f7f7f7;
      padding: clamp(1rem, 3vw, 2rem);
    }

    .auth-card {
      width: min(460px, 100%);
      background: #fff;
      padding: clamp(1.25rem, 4vw, 2rem);
      border-radius: 16px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, .08);
      display: grid;
      gap: .45rem;
    }

    h1,
    p {
      margin: 0;
    }

    p {
      color: #64748b;
      line-height: 1.7;
      margin-bottom: .75rem;
    }

    label {
      font-weight: 700;
      margin-top: .55rem;
      color: #334155;
    }

    input,
    button {
      width: 100%;
      box-sizing: border-box;
      padding: .85rem 1rem;
      border-radius: 10px;
    }

    input {
      border: 1px solid #cbd5e1;
    }

    input:focus {
      outline: 0;
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, .12);
    }

    button {
      margin-top: 1rem;
      border: 0;
      background: #1e3a5f;
      color: white;
      font-weight: 700;
      cursor: pointer;
    }

    button:disabled {
      opacity: .6;
      cursor: not-allowed;
    }

    .error {
      color: #b00020;
    }

    a {
      color: #2563eb;
      text-decoration: none;
      font-weight: 700;
      text-align: center;
      margin-top: .5rem;
    }
  `]
})
export class RegisterPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthApiService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(false);
  readonly submitted = signal(false);
  readonly error = signal('');

  readonly form = this.fb.nonNullable.group({
    firstName: ['', [Validators.required, Validators.minLength(2)]],
    lastName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]]
  });

  get firstNameMessages(): Record<string, string> {
    return {
      required: this.translate.instant('AUTH.ERRORS.FIRST_NAME_REQUIRED'),
      minlength: this.translate.instant('AUTH.ERRORS.FIRST_NAME_MIN')
    };
  }

  get lastNameMessages(): Record<string, string> {
    return {
      required: this.translate.instant('AUTH.ERRORS.LAST_NAME_REQUIRED'),
      minlength: this.translate.instant('AUTH.ERRORS.LAST_NAME_MIN')
    };
  }

  get passwordMessages(): Record<string, string> {
    return {
      required: this.translate.instant('AUTH.ERRORS.PASSWORD_REQUIRED'),
      minlength: this.translate.instant('AUTH.ERRORS.PASSWORD_MIN')
    };
  }

  submit(): void {
    this.submitted.set(true);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set(this.translate.instant('AUTH.ERRORS.FIX_FIELDS'));
      return;
    }

    this.loading.set(true);
    this.error.set('');

    const raw = this.form.getRawValue();

    const request = {
      firstName: raw.firstName.trim(),
      lastName: raw.lastName.trim(),
      email: raw.email.trim().toLowerCase(),
      password: raw.password
    };

    this.auth.register(request).subscribe({
      next: () => {
        this.loading.set(false);
        this.toast.success(this.translate.instant('AUTH.REGISTER_SUCCESS'));
        void this.router.navigate(['/auth/login']);
      },
      error: error => {
        this.loading.set(false);
        this.error.set(this.getRegisterErrorMessage(error));
      }
    });
  }

  private getRegisterErrorMessage(error: unknown): string {
    const response = error as {
      error?: {
        message?: string;
        title?: string;
        detail?: string;
        errors?: Record<string, string[]>;
      } | string;
      status?: number;
    };

    if (typeof response.error === 'string' && response.error.trim()) {
      return response.error;
    }

    if (typeof response.error === 'object') {
      if (response.error?.message) {
        return response.error.message;
      }

      if (response.error?.detail) {
        return response.error.detail;
      }

      if (response.error?.title) {
        return response.error.title;
      }

      if (response.error?.errors) {
        const messages = Object.values(response.error.errors).flat();

        if (messages.length > 0) {
          return messages.join(' ');
        }
      }
    }

    if (response.status === 409) {
      return this.translate.instant('AUTH.ERRORS.EMAIL_ALREADY_EXISTS');
    }

    if (response.status === 500) {
      return this.translate.instant('AUTH.ERRORS.SERVER_ERROR');
    }

    return this.translate.instant('AUTH.ERRORS.REGISTER_FAILED');
  }
}