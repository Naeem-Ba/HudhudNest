import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AuthApiService } from '../../../core/services/auth-api.service';

@Component({
  selector: 'app-reset-password-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  template: `
    <section class="auth-page" dir="rtl">
      <form class="auth-card" [formGroup]="form" (ngSubmit)="submit()">
        <h1>&#1578;&#1593;&#1610;&#1610;&#1606; &#1603;&#1604;&#1605;&#1577; &#1605;&#1585;&#1608;&#1585; &#1580;&#1583;&#1610;&#1583;&#1577;</h1>

        <input formControlName="email" placeholder="&#1575;&#1604;&#1576;&#1585;&#1610;&#1583; &#1575;&#1604;&#1573;&#1604;&#1603;&#1578;&#1585;&#1608;&#1606;&#1610;">
        <input formControlName="token" placeholder="&#1585;&#1605;&#1586; &#1575;&#1604;&#1578;&#1581;&#1602;&#1602;">
        <input type="password" formControlName="newPassword" placeholder="&#1603;&#1604;&#1605;&#1577; &#1575;&#1604;&#1605;&#1585;&#1608;&#1585; &#1575;&#1604;&#1580;&#1583;&#1610;&#1583;&#1577;">

        <button [disabled]="form.invalid || loading()">
          <ng-container *ngIf="loading(); else resetText">
            &#1580;&#1575;&#1585;&#1613; &#1575;&#1604;&#1578;&#1593;&#1610;&#1610;&#1606;...
          </ng-container>
          <ng-template #resetText>
            &#1578;&#1593;&#1610;&#1610;&#1606; &#1603;&#1604;&#1605;&#1577; &#1575;&#1604;&#1605;&#1585;&#1608;&#1585;
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
export class ResetPasswordPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthApiService);

  readonly loading = signal(false);
  readonly error = signal('');
  readonly success = signal('');

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    token: ['', Validators.required],
    newPassword: ['', [Validators.required, Validators.minLength(6)]]
  });

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.error.set('');
    this.success.set('');

    this.auth.resetPassword(this.form.getRawValue()).subscribe({
      next: () => {
        this.loading.set(false);
        this.success.set('\u062A\u0645 \u062A\u0639\u064A\u064A\u0646 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0628\u0646\u062C\u0627\u062D.');
      },
      error: () => {
        this.loading.set(false);
        this.error.set('\u062A\u0639\u0630\u0631 \u062A\u0639\u064A\u064A\u0646 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631.');
      }
    });
  }
}
