import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { AuthApiService } from '../../../core/auth/auth-api.service';
import { ConsentApiService } from '../../../core/api/consent-api.service';
import { PRIVACY_POLICY_VERSION, TERMS_OF_SERVICE_VERSION } from '../../../core/models/consent-versions';
import { passwordPolicyValidator } from '../../../core/auth/password-policy';
import { AuthErrorFocusService } from '../../../core/auth/auth-error-focus.service';
import { applyAuthFieldErrors, resolveAuthError } from '../auth-error';
import { PasswordRulesComponent } from '../../../shared/ui/password-rules.component';
import { FormErrorComponent } from '../../../shared/ui/form-error.component';
import { ConsentCheckboxComponent } from '../../../shared/components/consent-checkbox/consent-checkbox.component';
import { ToastService } from '../../../shared/services/toast.service';

@Component({
  selector: 'app-register-page',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    TranslateModule,
    FormErrorComponent,
    PasswordRulesComponent,
    ConsentCheckboxComponent
  ],
  template: `
    <section class="auth-page">
      <!-- ✅ B-15 (RELEASE-BLOCKERS-AR.md): قبل هذا كانت الرسالة تظهر توستاً عابراً ثم
           تنتقل الصفحة فوراً لتسجيل الدخول -- فلا مخرج لمن لم يصله الرابط. الآن تبقى
           الصفحة على حالة "أُرسل" مع زرّ إعادة إرسال فعلي. -->
      <div class="auth-card" *ngIf="registered(); else registerForm">
        <h1>{{ 'AUTH.REGISTER_TITLE' | translate }}</h1>
        <!-- 2026-10-06: كان النص "أرسلنا رابط تأكيد" يظهر لكل تسجيل ناجح، حتى حين فشل الخادم
             في الإرسال (Production بلا مضيف SMTP). الآن يقول الخادم صراحةً هل أُرسلت. -->
        <p>{{ (confirmationEmailSent() ? 'AUTH.REGISTER_SUCCESS' : 'AUTH.REGISTER_SUCCESS_MAIL_FAILED') | translate }}</p>
        <p class="hint" *ngIf="confirmationEmailSent()">{{ 'AUTH.CONFIRMATION_SPAM_HINT' | translate }}</p>

        <button
          type="button"
          [disabled]="resendDisabled"
          (click)="resendConfirmation()">
          <ng-container *ngIf="resendCooldown() > 0; else resendReady">
            {{ 'AUTH.RESEND_CONFIRMATION.COOLDOWN' | translate: { seconds: resendCooldown() } }}
          </ng-container>
          <ng-template #resendReady>
            {{ 'AUTH.RESEND_CONFIRMATION.BUTTON' | translate }}
          </ng-template>
        </button>

        <!-- نصّ الخادم كما هو، بلا تخصيص -- شرط التقرير الصريح كي لا تنكسر مقاومة
             التعداد المبنية في نقطة resend-confirmation. -->
        <p class="hint" *ngIf="resendMessage()" aria-live="polite">{{ resendMessage() }}</p>

        <a routerLink="/auth/login">{{ 'AUTH.GO_LOGIN' | translate }}</a>
      </div>

      <ng-template #registerForm>
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
          [submitted]="submitted()"
          [messages]="emailMessages">
        </app-form-error>

        <label for="password">{{ 'AUTH.PASSWORD' | translate }}</label>
        <input
          id="password"
          type="password"
          formControlName="password"
          placeholder="••••••••"
          autocomplete="new-password"
          aria-describedby="register-password-rules"
          [attr.aria-invalid]="form.controls.password.invalid && (form.controls.password.touched || submitted()) ? true : null"
        />
        <app-form-error
          [control]="form.controls.password"
          [submitted]="submitted()"
          [messages]="passwordMessages">
        </app-form-error>

        <app-password-rules
          listId="register-password-rules"
          [password]="form.controls.password.value"
          [context]="personalContext()"
          [personal]="true">
        </app-password-rules>

        <app-consent-checkbox
          [checked]="privacyConsentAccepted()"
          [error]="consentError()"
          (checkedChange)="privacyConsentAccepted.set($event); consentError.set('')">
        </app-consent-checkbox>

        <label class="newsletter-opt-in">
          <input
            type="checkbox"
            data-testid="newsletter-opt-in"
            [checked]="newsletterOptIn()"
            (change)="newsletterOptIn.set($any($event.target).checked)" />
          <span>{{ 'NEWSLETTER.OPT_IN_LABEL' | translate }}</span>
        </label>

        <button type="submit" [disabled]="loading()">
          <ng-container *ngIf="loading(); else registerText">
            ⏳ {{ 'AUTH.LOADING' | translate }}
          </ng-container>

          <ng-template #registerText>
            {{ 'AUTH.REGISTER_BUTTON' | translate }}
          </ng-template>
        </button>

        <p class="error" role="alert" data-auth-form-error *ngIf="error()">⚠️ {{ error() }}</p>

        <a routerLink="/auth/login">
          {{ 'AUTH.GO_LOGIN' | translate }}
        </a>
      </form>
      </ng-template>
    </section>
  `,
  styles: [`
    .newsletter-opt-in { display: flex; gap: 0.5rem; align-items: flex-start; margin: 0.5rem 0 1rem; font-size: 0.9rem; line-height: 1.5; cursor: pointer; }
    .newsletter-opt-in input { margin-top: 0.25rem; min-width: 18px; min-height: 18px; }
    .auth-page {
      min-height: 70vh;
      display: grid;
      place-items: center;
      background: var(--page-bg);
      padding: clamp(1rem, 3vw, 2rem);
    }

    .auth-card {
      width: min(460px, 100%);
      background: var(--surface);
      padding: clamp(1.25rem, 4vw, 2rem);
      border-radius: 16px;
      box-shadow: var(--shadow-lg);
      display: grid;
      gap: .45rem;
    }

    h1,
    p {
      margin: 0;
    }

    p {
      color: var(--gray-500);
      line-height: 1.7;
      margin-bottom: .75rem;
    }

    label {
      font-weight: 700;
      margin-top: .55rem;
      color: var(--gray-700);
    }

    input,
    button {
      width: 100%;
      box-sizing: border-box;
      padding: .85rem 1rem;
      border-radius: 10px;
    }

    input {
      border: 1px solid var(--border);
      background: var(--surface);
    }

    input:focus {
      outline: 0;
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(214,168,79,.12);
    }

    button {
      margin-top: 1rem;
      border: 0;
      background: var(--primary);
      color: var(--on-primary);
      font-weight: 700;
      cursor: pointer;
    }

    button:hover:not(:disabled) {
      background: var(--primary-dark);
    }

    button:disabled {
      opacity: .6;
      cursor: not-allowed;
    }

    .error {
      color: var(--danger-text);
    }

    .hint {
      color: var(--gray-500);
      font-size: var(--text-sm, .85rem);
      text-align: center;
    }

    a {
      color: var(--primary-text);
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
  private readonly errorFocus = inject(AuthErrorFocusService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(false);
  readonly submitted = signal(false);
  readonly error = signal('');
  readonly consentError = signal('');

  // مربّع الموافقة على سياسة الخصوصية وشروط الاستخدام — غير محدَّد افتراضياً،
  // ومطلوب فعلياً (الزر معطَّل بدونه)، انظر docs/privacy/privacy-gaps.md (P1).
  readonly privacyConsentAccepted = signal(false);

  // Newsletter: optional, separate from the box above, never pre-ticked and never required. Ticking it only asks the
  // API to send the double opt-in mail; nothing marketing goes out until its link is opened.
  readonly newsletterOptIn = signal(false);

  // ✅ B-15 (RELEASE-BLOCKERS-AR.md): حالة "أُرسل رابط التأكيد" + إعادة الإرسال.
  readonly registered = signal(false);
  readonly registeredEmail = signal('');
  // false فقط حين يقول الخادم صراحةً إنه لم يستطع إرسال الرسالة؛ غيابه (خادم أقدم) يعني "أُرسلت".
  readonly confirmationEmailSent = signal(true);
  readonly resendCooldown = signal(0);
  readonly resendMessage = signal('');
  private resendTimer: ReturnType<typeof setInterval> | null = null;

  readonly form = this.fb.nonNullable.group({
    firstName: ['', [Validators.required, Validators.minLength(2)]],
    lastName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],

    // The length rule lives inside passwordPolicyValidator (PASSWORD_TOO_SHORT), so there is no
    // separate minLength(8): two validators would mean two messages for one cause. The validator also
    // knows the name and e-mail typed above, because the server refuses a password built from them.
    password: ['', [Validators.required, passwordPolicyValidator(() => this.personalContext())]]
  });

  constructor() {
    // The password rule "not your name / e-mail" depends on the other fields, so it is re-checked when
    // they change. A message about the previous attempt is no longer true once anything is edited.
    const { firstName, lastName, email, password } = this.form.controls;
    [firstName, lastName, email].forEach(control =>
      control.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
        password.updateValueAndValidity({ emitEvent: false });
      })
    );

    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (this.error()) {
        this.error.set('');
      }
    });
  }

  personalContext(): { firstName: string; lastName: string; email: string } {
    const { firstName, lastName, email } = this.form?.getRawValue() ?? { firstName: '', lastName: '', email: '' };
    return { firstName, lastName, email };
  }

  get emailMessages(): Record<string, string> {
    return {
      required: this.translate.instant('AUTH.ERRORS.EMAIL_REQUIRED'),
      email: this.translate.instant('AUTH.ERRORS.INVALID_EMAIL')
    };
  }

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
      passwordPolicy: this.translate.instant('AUTH.ERRORS.PASSWORD_POLICY_UNMET')
    };
  }

  submit(): void {
    if (this.loading()) {
      return;
    }

    this.submitted.set(true);
    this.consentError.set('');
    this.error.set('');
    this.form.markAllAsTouched();

    if (!this.privacyConsentAccepted()) {
      this.consentError.set(this.translate.instant('AUTH.ERRORS.CONSENT_REQUIRED'));
    }

    // Nothing is sent, and nothing the person typed is touched: the first problem is scrolled into
    // view with its own message, instead of one generic "fix the fields" line at the bottom.
    if (this.form.invalid || this.consentError()) {
      this.errorFocus.request();
      return;
    }

    this.loading.set(true);

    const raw = this.form.getRawValue();

    const request = {
      firstName: raw.firstName.trim(),
      lastName: raw.lastName.trim(),
      email: raw.email.trim().toLowerCase(),
      password: raw.password,
      privacyPolicyAccepted: this.privacyConsentAccepted(),
      privacyPolicyVersion: PRIVACY_POLICY_VERSION,
      termsAccepted: this.privacyConsentAccepted(),
      termsVersion: TERMS_OF_SERVICE_VERSION,
      consentSource: ConsentApiService.currentSource(),
      ...(this.newsletterOptIn() ? { newsletterOptIn: true } : {})
    };

    this.auth.register(request).subscribe({
      next: response => {
        const sent = response?.confirmationEmailSent !== false;
        this.loading.set(false);
        this.registeredEmail.set(request.email);
        this.confirmationEmailSent.set(sent);
        this.registered.set(true);
        this.toast.success(
          this.translate.instant(sent ? 'AUTH.REGISTER_SUCCESS' : 'AUTH.REGISTER_SUCCESS_MAIL_FAILED')
        );
      },
      error: error => {
        this.loading.set(false);
        this.handleFailure(error);
      }
    });
  }

  get resendDisabled(): boolean {
    return this.resendCooldown() > 0;
  }

  resendConfirmation(): void {
    if (this.resendDisabled) {
      return;
    }

    this.auth.resendConfirmationEmail(this.registeredEmail()).subscribe({
      // نصّ الخادم كما هو -- شرط التقرير الصريح، لأنه مصمَّم ليكون نفسه بصرف النظر
      // عن كون البريد موجوداً أو مؤكَّداً أو أُرسل له للتوّ.
      next: result => this.resendMessage.set(result.message),
      error: error =>
        this.resendMessage.set(
          this.translate.instant(
            (error as { status?: number } | null)?.status === 429
              ? 'AUTH.RESEND_CONFIRMATION.TOO_MANY'
              : 'AUTH.ERRORS.SERVER_ERROR'
          )
        )
    });

    this.startResendCooldown(60);
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
  }

  /** Each reason on the field it belongs to; what belongs to no field goes under the button. */
  private handleFailure(error: unknown): void {
    const resolved = resolveAuthError(this.translate, error, {
      conflictMeansEmailTaken: true,
      allowServerMessage: true,
      fallbackKey: 'AUTH.ERRORS.REGISTER_FAILED'
    });
    const { firstName, lastName, email, password } = this.form.controls;

    if (resolved.fields.some(item => item.field === 'consent')) {
      this.consentError.set(this.translate.instant('AUTH.ERRORS.CONSENT_REQUIRED'));
    }

    const leftovers = applyAuthFieldErrors(
      { ...resolved, fields: resolved.fields.filter(item => item.field !== 'consent') },
      { firstName, lastName, email, password }
    );

    this.error.set(leftovers.join(' '));
    this.errorFocus.request();
  }
}
