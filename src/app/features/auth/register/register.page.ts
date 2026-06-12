import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthApiService } from '../../../core/services/auth-api.service';

@Component({
  selector: 'app-register-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  template: `
    <section class="auth-page" dir="rtl">
      <form class="auth-card" [formGroup]="form" (ngSubmit)="submit()">
        <h1>&#1573;&#1606;&#1588;&#1575;&#1569; &#1581;&#1587;&#1575;&#1576;</h1>

        <input formControlName="firstName" placeholder="&#1575;&#1604;&#1575;&#1587;&#1605;">
        <input formControlName="lastName" placeholder="&#1575;&#1604;&#1603;&#1606;&#1610;&#1577;">
        <input formControlName="email" placeholder="&#1575;&#1604;&#1576;&#1585;&#1610;&#1583; &#1575;&#1604;&#1573;&#1604;&#1603;&#1578;&#1585;&#1608;&#1606;&#1610;">
        <input formControlName="phoneNumber" placeholder="&#1575;&#1604;&#1607;&#1575;&#1578;&#1601; &#1575;&#1582;&#1578;&#1610;&#1575;&#1585;&#1610;">
        <input type="password" formControlName="password" placeholder="&#1603;&#1604;&#1605;&#1577; &#1575;&#1604;&#1605;&#1585;&#1608;&#1585;">

        <button [disabled]="form.invalid || loading()">
          <ng-container *ngIf="loading(); else registerText">
            &#1580;&#1575;&#1585;&#1613; &#1575;&#1604;&#1578;&#1587;&#1580;&#1610;&#1604;...
          </ng-container>

          <ng-template #registerText>
            &#1578;&#1587;&#1580;&#1610;&#1604;
          </ng-template>
        </button>

        <p class="error" *ngIf="error()">{{ error() }}</p>
      </form>
    </section>
  `,
  styles: [`
    .auth-page {
      min-height: 70vh;
      display: grid;
      place-items: center;
      background: #f7f7f7;
      padding: 2rem;
    }

    .auth-card {
      width: min(450px, 100%);
      background: #fff;
      padding: 2rem;
      border-radius: 16px;
      box-shadow: 0 10px 30px rgba(0,0,0,.08);
    }

    input,
    button {
      width: 100%;
      box-sizing: border-box;
      padding: .85rem 1rem;
      border-radius: 10px;
      margin: .5rem 0;
    }

    input {
      border: 1px solid #ccc;
    }

    button {
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
  `]
})
export class RegisterPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthApiService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly error = signal('');

  readonly form = this.fb.nonNullable.group({
    firstName: ['', Validators.required],
    lastName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    phoneNumber: [''],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.error.set('');

    this.auth.register({
      ...this.form.getRawValue(),
      preferredLanguage: 'ar'
    }).subscribe({
      next: () => this.router.navigate(['/auth/login']),
      error: () => {
        this.loading.set(false);
        this.error.set('\u062A\u0639\u0630\u0631 \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u062D\u0633\u0627\u0628.');
      }
    });
  }
}

