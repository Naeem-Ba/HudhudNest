import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthApiService } from '../../../core/services/auth-api.service';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  template: `
    <section class="auth-page" dir="rtl">
      <form class="auth-card" [formGroup]="form" (ngSubmit)="submit()">
        <h1>&#1578;&#1587;&#1580;&#1610;&#1604; &#1575;&#1604;&#1583;&#1582;&#1608;&#1604;</h1>

        <input formControlName="email" placeholder="&#1575;&#1604;&#1576;&#1585;&#1610;&#1583; &#1575;&#1604;&#1573;&#1604;&#1603;&#1578;&#1585;&#1608;&#1606;&#1610;">
        <input type="password" formControlName="password" placeholder="&#1603;&#1604;&#1605;&#1577; &#1575;&#1604;&#1605;&#1585;&#1608;&#1585;">

        <button [disabled]="form.invalid || loading()">
          <ng-container *ngIf="loading(); else loginText">
            &#1580;&#1575;&#1585;&#1613; &#1578;&#1587;&#1580;&#1610;&#1604; &#1575;&#1604;&#1583;&#1582;&#1608;&#1604;...
          </ng-container>
          <ng-template #loginText>
            &#1583;&#1582;&#1608;&#1604;
          </ng-template>
        </button>

        <p class="error" *ngIf="error()">{{ error() }}</p>

        <p class="links">
          <a routerLink="/auth/register">&#1573;&#1606;&#1588;&#1575;&#1569; &#1581;&#1587;&#1575;&#1576;</a>
          |
          <a routerLink="/auth/forgot-password">&#1606;&#1587;&#1610;&#1578; &#1603;&#1604;&#1605;&#1577; &#1575;&#1604;&#1605;&#1585;&#1608;&#1585;&#1567;</a>
        </p>
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
    .links{text-align:center;margin-top:1rem}
    a{color:#1e3a5f;font-weight:700;text-decoration:none}
  `]
})
export class LoginPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthApiService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly error = signal('');

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required]
  });

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.error.set('');

    this.auth.login(this.form.getRawValue()).subscribe({
      next: () => this.router.navigate(['/favorites']),
      error: () => {
        this.loading.set(false);
        this.error.set('\u062A\u0639\u0630\u0631 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644.');
      }
    });
  }
}
