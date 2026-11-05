import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators
} from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { isRateLimited } from '../../../core/api/rate-limited';
import { AuthApiService } from '../../../core/auth/auth-api.service';
import { AuthErrorFocusService } from '../../../core/auth/auth-error-focus.service';
import { passwordPolicyValidator } from '../../../core/auth/password-policy';
import { PasswordRulesComponent } from '../../../shared/ui/password-rules.component';
import { applyAuthFieldErrors, resolveAuthError } from '../auth-error';
import { FormErrorComponent } from '../../../shared/ui/form-error.component';
import { ToastService } from '../../../shared/services/toast.service';

/** Sets `mismatch` on the confirmation control when it differs from the new password. */
function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const newPassword = group.get('newPassword');
  const confirm = group.get('confirmPassword');
  if (!newPassword || !confirm) {
    return null;
  }

  const mismatch = !!confirm.value && newPassword.value !== confirm.value;
  const errors = { ...(confirm.errors ?? {}) };
  if (mismatch) {
    errors['mismatch'] = true;
  } else {
    delete errors['mismatch'];
  }
  confirm.setErrors(Object.keys(errors).length ? errors : null);
  return null;
}

/**
 * The password-reset email carries `?email=..&token=..` (PasswordResetUrlBuilder in the API).
 * Both come from the link, so the user only types and confirms the new password; the token is
 * never shown. A link missing either value gets a "request a new link" prompt instead of a form
 * that asks for a code the user does not have.
 */
@Component({
  selector: 'app-reset-password-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, TranslateModule, FormErrorComponent, PasswordRulesComponent],
  template: `
    <section class="auth-page">
      <div class="auth-card" *ngIf="!linkValid">
        <h1>{{ 'AUTH.RESET_TITLE' | translate }}</h1>
        <p class="error">⚠️ {{ 'AUTH.RESET_LINK_INVALID' | translate }}</p>
        <a routerLink="/auth/forgot-password" class="link-button">{{ 'AUTH.REQUEST_NEW_LINK' | translate }}</a>
      </div>

      <form class="auth-card" *ngIf="linkValid" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <h1>{{ 'AUTH.RESET_TITLE' | translate }}</h1>
        <p class="account" dir="ltr">{{ email }}</p>

        <label for="newPassword">{{ 'AUTH.NEW_PASSWORD' | translate }}</label>
        <input id="newPassword" type="password" formControlName="newPassword" placeholder="••••••••" autocomplete="new-password" aria-describedby="reset-password-rules">
        <app-form-error [control]="form.controls.newPassword" [submitted]="submitted()" [messages]="passwordMessages"></app-form-error>
        <app-password-rules
          listId="reset-password-rules"
          [password]="form.controls.newPassword.value"
          [context]="{ email: email }"
          [personal]="true"
        ></app-password-rules>

        <label for="confirmPassword">{{ 'AUTH.RESET_CONFIRM_PASSWORD' | translate }}</label>
        <input id="confirmPassword" type="password" formControlName="confirmPassword" placeholder="••••••••" autocomplete="new-password">
        <app-form-error [control]="form.controls.confirmPassword" [submitted]="submitted()" [messages]="passwordMessages"></app-form-error>

        <button [disabled]="loading() || !!success()">
          <ng-container *ngIf="loading(); else resetText">⏳ {{ 'AUTH.LOADING' | translate }}</ng-container>
          <ng-template #resetText>{{ 'AUTH.RESET_BUTTON' | translate }}</ng-template>
        </button>

        <p class="success" *ngIf="success()">✅ {{ success() }}</p>
        <p class="error" role="alert" data-auth-form-error *ngIf="error()">⚠️ {{ error() }}</p>
        <a *ngIf="linkExpired()" routerLink="/auth/forgot-password" class="link-button">{{ 'AUTH.REQUEST_NEW_LINK' | translate }}</a>
        <a *ngIf="success()" routerLink="/auth/login" class="link-button">{{ 'AUTH.LOGIN_BUTTON' | translate }}</a>
      </form>
    </section>
  `,
  styles: [`
    .auth-page{min-height:70vh;display:grid;place-items:center;background:var(--page-bg);padding:2rem}.auth-card{width:min(450px,100%);background:var(--surface);padding:2rem;border-radius:16px;box-shadow:var(--shadow-lg);display:grid;gap:.55rem}h1,p{margin:0}label{font-weight:700;margin-top:.5rem}input,button,.link-button{width:100%;box-sizing:border-box;padding:.85rem 1rem;border-radius:10px}input{border:1px solid var(--border);background:var(--surface)}button,.link-button{margin-top:1rem;border:0;background:var(--primary);color:var(--on-primary);font-weight:700;cursor:pointer;text-align:center;text-decoration:none}button:hover:not(:disabled),.link-button:hover{background:var(--primary-dark)}button:disabled{opacity:.6;cursor:not-allowed}.account{color:var(--gray-600);overflow-wrap:anywhere}.error{color:var(--danger-text)}.success{color:var(--success-text)}
  `]
})
export class ResetPasswordPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthApiService);
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);

  readonly loading = signal(false);
  readonly submitted = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  /** The server said the link itself is no good (used, expired): the way out is a new link. */
  readonly linkExpired = signal(false);
  private readonly errorFocus = inject(AuthErrorFocusService);

  readonly email: string;
  private readonly token: string;

  get linkValid(): boolean {
    return !!this.email && !!this.token;
  }

  get passwordMessages(): Record<string, string> {
    return {
      required: this.translate.instant('AUTH.ERRORS.PASSWORD_REQUIRED'),
      passwordPolicy: this.translate.instant('AUTH.ERRORS.PASSWORD_POLICY_UNMET'),
      mismatch: this.translate.instant('AUTH.ERRORS.PASSWORD_MISMATCH')
    };
  }

  readonly form = this.fb.nonNullable.group(
    {
      newPassword: ['', [Validators.required, passwordPolicyValidator(() => ({ email: this.email }))]],
      confirmPassword: ['', [Validators.required]]
    },
    { validators: passwordsMatch }
  );

  constructor() {
    const params = this.route.snapshot.queryParamMap;
    this.email = (params.get('email') ?? '').trim();
    this.token = params.get('token') ?? '';

    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      if (this.error()) {
        this.error.set('');
      }
    });
  }

  submit(): void {
    if (this.loading()) {
      return;
    }

    this.submitted.set(true);

    if (!this.linkValid || this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorFocus.request();
      return;
    }

    this.loading.set(true);
    this.error.set('');
    this.success.set('');
    this.linkExpired.set(false);

    const raw = this.form.getRawValue();

    this.auth.resetPassword({
      email: this.email,
      token: this.token,
      newPassword: raw.newPassword,
      confirmPassword: raw.confirmPassword
    }).subscribe({
      next: () => {
        this.loading.set(false);
        const message = this.translate.instant('AUTH.RESET_SUCCESS');
        this.success.set(message);
        this.toast.success(message);
      },
      error: error => {
        this.loading.set(false);
        this.handleFailure(error);
      }
    });
  }

  /** The password's own reasons under the field; a dead link says so and offers a new one. */
  private handleFailure(error: unknown): void {
    // 429: the reset limit (3 per hour, shared with "forgot password"), not a wrong link.
    if (isRateLimited(error)) {
      this.error.set(this.translate.instant('AUTH.ERRORS.PASSWORD_RESET_LIMIT'));
      this.errorFocus.request();
      return;
    }

    const codes = (error as { error?: { errorCodes?: unknown } } | null)?.error?.errorCodes;
    if (Array.isArray(codes) && codes.includes('InvalidToken')) {
      this.linkExpired.set(true);
      this.error.set(this.translate.instant('AUTH.RESET_LINK_INVALID'));
      this.errorFocus.request();
      return;
    }

    const resolved = resolveAuthError(this.translate, error, {
      passwordField: 'newPassword',
      fallbackKey: 'AUTH.ERRORS.RESET_FAILED'
    });
    const { newPassword } = this.form.controls;
    const leftovers = applyAuthFieldErrors(resolved, { newPassword, password: newPassword });

    this.error.set(leftovers.join(' '));
    this.errorFocus.request();
  }
}
