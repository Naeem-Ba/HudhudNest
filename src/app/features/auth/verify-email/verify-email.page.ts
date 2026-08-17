import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

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
  imports: [CommonModule, RouterModule, TranslateModule],
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
  `]
})
export class VerifyEmailPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly phoneAuth = inject(PhoneAuthApiService);
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<VerifyState>('verifying');
  readonly errorMessage = signal('');

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
}
