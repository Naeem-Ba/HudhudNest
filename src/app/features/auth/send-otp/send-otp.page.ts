import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { OtpApiService } from '../../../core/services/otp-api.service';

@Component({
  selector: 'app-send-otp-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  template: `
    <section class="auth-page" dir="rtl">
      <form class="auth-card" [formGroup]="form" (ngSubmit)="submit()">
        <h1>&#1573;&#1585;&#1587;&#1575;&#1604; &#1585;&#1605;&#1586; &#1575;&#1604;&#1578;&#1581;&#1602;&#1602;</h1>

        <input formControlName="phoneNumber" placeholder="&#1585;&#1602;&#1605; &#1575;&#1604;&#1607;&#1575;&#1578;&#1601;">

        <button [disabled]="form.invalid || loading()">
          <ng-container *ngIf="loading(); else sendText">
            &#1580;&#1575;&#1585;&#1613; &#1575;&#1604;&#1573;&#1585;&#1587;&#1575;&#1604;...
          </ng-container>
          <ng-template #sendText>
            &#1573;&#1585;&#1587;&#1575;&#1604; &#1575;&#1604;&#1585;&#1605;&#1586;
          </ng-template>
        </button>

        <p class="success" *ngIf="success()">{{ success() }}</p>
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
    .success{color:#137333}
  `]
})
export class SendOtpPage {
  private readonly fb = inject(FormBuilder);
  private readonly otpApi = inject(OtpApiService);

  readonly loading = signal(false);
  readonly error = signal('');
  readonly success = signal('');

  readonly form = this.fb.nonNullable.group({
    phoneNumber: ['', Validators.required]
  });

  submit(): void {
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
        this.success.set('\u062A\u0645 \u0625\u0631\u0633\u0627\u0644 \u0631\u0645\u0632 \u0627\u0644\u062A\u062D\u0642\u0642.');
      },
      error: () => {
        this.loading.set(false);
        this.error.set('\u062A\u0639\u0630\u0631 \u0625\u0631\u0633\u0627\u0644 \u0631\u0645\u0632 \u0627\u0644\u062A\u062D\u0642\u0642.');
      }
    });
  }
}
