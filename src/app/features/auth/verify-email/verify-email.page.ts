import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { AuthApiService } from '../../../core/auth/auth-api.service';
import { PhoneAuthApiService } from '../../../core/auth/phone-auth-api.service';
import { ToastService } from '../../../shared/services/toast.service';

type VerifyState = 'verifying' | 'success' | 'error';

/**
 * ✅ إضافة: صفحة تفعيل البريد الإلكتروني الثانوي — الوجه المقابل لـ
 * PhoneAuthController.AddEmail. الباك اند (EmailVerificationService) يُرسل
 * رابطًا بالشكل:
 *   {frontend}/auth/verify-email?userId=..&email=..&token=..
 * الصفحة تقرأ userId + token من الـ query params تلقائيًا عند التحميل
 * وتستدعي POST /auth/email/verify مباشرة دون تدخل يدوي من المستخدم —
 * على عكس نموذج auth/reset-password الذي يتطلّب كتابة الحقول يدويًا،
 * لأن هذا رابط بريد يُنقَر عليه مباشرة وليس كودًا يُدخَل.
 * الـ endpoint [AllowAnonymous] عمدًا بالباك اند، لذا لا حارس (Guard) هنا.
 */
@Component({
  selector: 'app-verify-email-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, TranslateModule],
  template: `
    <section class="verify-page">
      <div class="verify-card">
        <h1>{{ 'AUTH.VERIFY_EMAIL.TITLE' | translate }}</h1>

        <div class="state state--verifying" *ngIf="state() === 'verifying'">
          <span class="spinner" aria-hidden="true">⏳</span>
          <p>{{ 'AUTH.VERIFY_EMAIL.VERIFYING' | translate }}</p>
        </div>

        <div class="state state--success" *ngIf="state() === 'success'">
          <span aria-hidden="true">✅</span>
          <p>{{ 'AUTH.VERIFY_EMAIL.SUCCESS' | translate }}</p>
          <a routerLink="/profile" class="btn-primary">{{ 'AUTH.VERIFY_EMAIL.GO_TO_PROFILE' | translate }}</a>
        </div>

        <div class="state state--error" *ngIf="state() === 'error'">
          <span aria-hidden="true">⚠️</span>
          <p>{{ errorMessage() }}</p>

          <!-- ✅ B-15 (RELEASE-BLOCKERS-AR.md): هذه الصفحة تُفتح من رابط بريد فشل، أي أن
               المستخدم ليس بالضرورة مسجَّل دخوله -- ومسار resend-confirmation مجهول الهوية
               عمداً لهذا السبب بالذات. البريد ليس في الرابط (حُذف من الـ URL عمداً في
               الخلفية)، فيُطلَب هنا يدوياً. -->
          <div class="resend-form">
            <label for="resendEmail">{{ 'AUTH.EMAIL' | translate }}</label>
            <input
              id="resendEmail"
              type="email"
              [ngModel]="resendEmail()"
              (ngModelChange)="resendEmail.set($event)"
              [placeholder]="'AUTH.EMAIL_PLACEHOLDER' | translate"
              autocomplete="email"
            />
            <button type="button" [disabled]="resendDisabled" (click)="resendConfirmation()">
              <ng-container *ngIf="resendCooldown() > 0; else resendReady">
                {{ 'AUTH.RESEND_CONFIRMATION.COOLDOWN' | translate: { seconds: resendCooldown() } }}
              </ng-container>
              <ng-template #resendReady>{{ 'AUTH.RESEND_CONFIRMATION.BUTTON' | translate }}</ng-template>
            </button>
            <!-- نصّ الخادم كما هو، بلا تخصيص -- نفس شرط صفحة التسجيل. -->
            <p class="hint" *ngIf="resendMessage()" aria-live="polite">{{ resendMessage() }}</p>
          </div>

          <a routerLink="/profile" class="btn-secondary">{{ 'AUTH.VERIFY_EMAIL.BACK_TO_PROFILE' | translate }}</a>
        </div>
      </div>
    </section>
  `,
  styles: [`
    .verify-page{min-height:70vh;display:grid;place-items:center;background:#f7f7f7;padding:2rem}
    .verify-card{width:min(450px,100%);background:#fff;padding:2.5rem 2rem;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.08);text-align:center;display:grid;gap:1rem}
    h1{margin:0;font-size:1.3rem}
    .state{display:grid;gap:.75rem;justify-items:center}
    .spinner{font-size:1.8rem}
    .state--success span,.state--error span{font-size:2rem}
    p{margin:0;color:#334155;line-height:1.6}
    .btn-primary,.btn-secondary{display:inline-block;margin-top:.5rem;padding:.75rem 1.5rem;border-radius:10px;text-decoration:none;font-weight:700}
    .btn-primary{background:#1e3a5f;color:#fff}
    .btn-secondary{background:transparent;color:#1e3a5f;border:1px solid #1e3a5f}
    .resend-form{display:grid;gap:.5rem;text-align:start;width:100%}
    .resend-form label{font-weight:700;color:#334155;font-size:.85rem}
    .resend-form input,.resend-form button{width:100%;box-sizing:border-box;padding:.75rem 1rem;border-radius:10px}
    .resend-form input{border:1px solid #cbd5e1}
    .resend-form button{border:0;background:#1e3a5f;color:#fff;font-weight:700;cursor:pointer}
    .resend-form button:disabled{opacity:.6;cursor:not-allowed}
    .hint{color:#64748b;font-size:.85rem;margin:0}
  `]
})
export class VerifyEmailPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly phoneAuth = inject(PhoneAuthApiService);
  private readonly authApi = inject(AuthApiService);
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<VerifyState>('verifying');
  readonly errorMessage = signal('');

  // ✅ B-15 (RELEASE-BLOCKERS-AR.md): إعادة إرسال رابط التأكيد من هنا مباشرة.
  readonly resendEmail = signal('');
  readonly resendMessage = signal('');
  readonly resendCooldown = signal(0);
  private resendTimer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    const userId = params.get('userId');
    const token = params.get('token');

    if (!userId || !token) {
      this.state.set('error');
      this.errorMessage.set(this.translate.instant('AUTH.VERIFY_EMAIL.MISSING_PARAMS'));
      return;
    }

    this.phoneAuth
      .verifyEmail(userId, token)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.state.set('success');
          this.toast.success(this.translate.instant('AUTH.VERIFY_EMAIL.SUCCESS'));
        },
        error: () => {
          this.state.set('error');
          this.errorMessage.set(this.translate.instant('AUTH.VERIFY_EMAIL.FAILED'));
        }
      });
  }

  get resendDisabled(): boolean {
    return this.resendCooldown() > 0 || !this.resendEmail().trim();
  }

  resendConfirmation(): void {
    if (this.resendDisabled) {
      return;
    }

    this.authApi.resendConfirmationEmail(this.resendEmail()).subscribe({
      // نصّ الخادم كما هو -- نفس شرط صفحة التسجيل: لا تفرقة بين "موجود"/"غير موجود".
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
}
