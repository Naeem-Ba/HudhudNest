import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { AuthApiService } from '../../../core/auth/auth-api.service';
import {
  getPasswordPolicyViolations,
  passwordPolicyValidator,
  PASSWORD_POLICY_RULES
} from '../../../core/auth/password-policy';
import { getPasswordRejectionMessages } from '../password-errors';
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
      <!-- ✅ B-15 (RELEASE-BLOCKERS-AR.md): قبل هذا كانت الرسالة تظهر توستاً عابراً ثم
           تنتقل الصفحة فوراً لتسجيل الدخول -- فلا مخرج لمن لم يصله الرابط. الآن تبقى
           الصفحة على حالة "أُرسل" مع زرّ إعادة إرسال فعلي. -->
      <div class="auth-card" *ngIf="registered(); else registerForm">
        <h1>{{ 'AUTH.REGISTER_TITLE' | translate }}</h1>
        <p>{{ 'AUTH.REGISTER_SUCCESS' | translate }}</p>

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
          [submitted]="submitted()">
        </app-form-error>

        <label for="password">{{ 'AUTH.PASSWORD' | translate }}</label>
        <input
          id="password"
          type="password"
          formControlName="password"
          placeholder="••••••••"
          autocomplete="new-password"
          (input)="syncPasswordRules()"
        />
        <app-form-error
          [control]="form.controls.password"
          [submitted]="submitted()"
          [messages]="passwordMessages">
        </app-form-error>

        <ul class="password-rules" aria-live="polite">
          <li
            *ngFor="let rule of passwordRules"
            [class.is-met]="isRuleMet(rule)">
            <span class="mark" aria-hidden="true">{{ isRuleMet(rule) ? '✓' : '•' }}</span>
            {{ 'AUTH.PASSWORD_RULES.' + rule | translate }}
          </li>
        </ul>

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
      </ng-template>
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

    .hint {
      color: #64748b;
      font-size: var(--text-sm, .85rem);
      text-align: center;
    }

    /* القواعد كانت غير معروفة للمستخدم إطلاقاً: النموذج يفرض 8 أحرف والخادم يفرض ثمانياً
       من القواعد. عرضها أثناء الكتابة يحوّل الرفض بعد الإرسال إلى إرشاد قبله. */
    .password-rules {
      list-style: none;
      margin: .5rem 0 0;
      padding: 0;
      display: grid;
      gap: .2rem;
      font-size: var(--text-xs, .75rem);
      color: var(--gray-500, #64748b);
    }

    .password-rules li {
      display: flex;
      align-items: center;
      gap: .4rem;
    }

    .password-rules .mark {
      flex: 0 0 auto;
      width: 1em;
      text-align: center;
    }

    .password-rules li.is-met {
      color: var(--success, #16a34a);
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

  // ✅ B-15 (RELEASE-BLOCKERS-AR.md): حالة "أُرسل رابط التأكيد" + إعادة الإرسال.
  readonly registered = signal(false);
  readonly registeredEmail = signal('');
  readonly resendCooldown = signal(0);
  readonly resendMessage = signal('');
  private resendTimer: ReturnType<typeof setInterval> | null = null;

  readonly passwordRules = PASSWORD_POLICY_RULES;

  /**
   * القواعد غير المستوفاة. تبدأ بالقائمة كاملة لأن حقلاً فارغاً لم يستوفِ شيئاً --
   * getPasswordPolicyViolations('') يُعيد PASSWORD_REQUIRED وحده، ولو استُخدم كما هو
   * لظهرت كل القواعد «مستوفاة» قبل أن يكتب المستخدم حرفاً.
   */
  private readonly passwordViolations = signal<readonly string[]>(PASSWORD_POLICY_RULES);

  readonly form = this.fb.nonNullable.group({
    firstName: ['', [Validators.required, Validators.minLength(2)]],
    lastName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],

    // minLength(8) سقط لأن passwordPolicyValidator يغطّي الطول ضمن PASSWORD_TOO_SHORT،
    // وإبقاؤهما معاً يعني رسالتين لسببٍ واحد.
    password: ['', [Validators.required, passwordPolicyValidator()]]
  });

  syncPasswordRules(): void {
    const value = this.form.controls.password.value;
    this.passwordViolations.set(value ? getPasswordPolicyViolations(value) : PASSWORD_POLICY_RULES);
  }

  isRuleMet(rule: string): boolean {
    return !this.passwordViolations().includes(rule);
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
        this.registeredEmail.set(request.email);
        this.registered.set(true);
        this.toast.success(this.translate.instant('AUTH.REGISTER_SUCCESS'));
      },
      error: error => {
        this.loading.set(false);
        this.error.set(this.getRegisterErrorMessage(error));
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
      error: () => this.resendMessage.set(this.translate.instant('AUTH.ERRORS.SERVER_ERROR'))
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

    // كلمة المرور أولاً: هي السبب الوحيد الذي لا يستطيع النموذج توقّعه محلياً (فحص
    // التسريبات يجري على الخادم)، وهي التي كانت تصل بالإنجليزية.
    const passwordReasons = getPasswordRejectionMessages(this.translate, error);

    if (passwordReasons.length > 0) {
      return passwordReasons.join(' ');
    }

    if (typeof response.error === 'object') {
      if (response.error?.message) {
        return response.error.message;
      }

      if (response.error?.detail) {
        return response.error.detail;
      }

      // أخطاء الحقول تسبق title: جسم 422 يحمل title = "Validation Error" دائماً، وفحصه
      // أولاً كان يحجب السبب الفعلي خلف عنوان عام لا يقول للمستخدم شيئاً.
      if (response.error?.errors) {
        const messages = Object.values(response.error.errors).flat();

        if (messages.length > 0) {
          return messages.join(' ');
        }
      }

      if (response.error?.title) {
        return response.error.title;
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