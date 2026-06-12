import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { OtpApiService } from '../../../core/services/otp-api.service';

@Component({
  selector: 'app-verify-otp-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  template: `
    <section class="auth-page" dir="rtl">
      <form class="auth-card" [formGroup]="form" (ngSubmit)="submit()">
        <h1>&#1578;&#1581;&#1602;&#1602; &#1605;&#1606; &#1575;&#1604;&#1585;&#1605;&#1586;</h1>

        <input formControlName="phoneNumber" placeholder="&#1585;&#1602;&#1605; &#1575;&#1604;&#1607;&#1575;&#1578;&#1601;">
        <input formControlName="code" placeholder="&#1585;&#1605;&#1586; &#1575;&#1604;&#1578;&#1581;&#1602;&#1602;">

        <button [disabled]="form.invalid || loading()">
          <ng-container *ngIf="loading(); else verifyText">
            &#1580;&#1575;&#1585;&#1613; &#1575;&#1604;&#1578;&#1581;&#1602;&#1602;...
          </ng-container>
          <ng-template #verifyText>
            &#1578;&#1581;&#1602;&#1602;
          </ng-template>
        </button>

        <p class="error" *ngIf="error()">{{ error() }}</p>
      </form>
    </section>
  `,
  styles: [`
    .auth-page{min-height:70vh;display:grid;place-items:center;background:#f7f7f7;padding:2rem}
    .auth-card{width:min(450px,100%);background:#fff;padding:2rem;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.08)}
    input,button{width:100%;box-sizing:border-box;padding:.85rem 1rem;border-radius:10px;margin:.5rem 0}
    input{border:1px solid #ccc}
    button{border:0;background:#1e3a5f;color:white;font-weight:700;cursor:pointer}
    button:disabled{opacity:.6;cursor:not-allowed}
    .error{color:#b00020}
  `]
})
export class VerifyOtpPage {
  private readonly fb = inject(FormBuilder);
  private readonly otpApi = inject(OtpApiService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly error = signal('');

  readonly form = this.fb.nonNullable.group({
    phoneNumber: ['', Validators.required],
    code: ['', Validators.required]
  });

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.error.set('');

    this.otpApi.verifyOtp(this.form.getRawValue()).subscribe({
      next: () => this.router.navigate(['/home']),
      error: () => {
        this.loading.set(false);
        this.error.set('\u062A\u0639\u0630\u0631 \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u0627\u0644\u0631\u0645\u0632.');
      }
    });
  }
}
