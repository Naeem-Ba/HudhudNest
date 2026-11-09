// Stand-in for a provider's hosted checkout (/payments/sandbox/:orderId). Development and staging ONLY: the server answers 404
// in Production and the sandbox provider is refused there, so this page can never take, or pretend to take, real money.
// It plays the provider's part by calling the sandbox simulator, which then sends a properly signed webhook to the API —
// the same path a real provider uses. Nothing here marks an order paid directly.

import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule } from '@ngx-translate/core';

import { PaymentsApiService } from '../../core/api/payments-api.service';

@Component({
  selector: 'app-payment-sandbox',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule, TranslateModule],
  styleUrls: ['./payments.scss'],
  template: `
    <section class="pay-page">
      <div class="pay-card pay-state" data-testid="sandbox">
        <div class="pay-state__icon" aria-hidden="true">🧪</div>
        <h1>{{ 'PAYMENTS.SANDBOX.TITLE' | translate }}</h1>
        <p>{{ 'PAYMENTS.SANDBOX.BODY' | translate }}</p>
        <p class="pay-error" role="alert" *ngIf="error() as e">{{ e | translate }}</p>
        <div class="pay-actions" style="justify-content:center">
          <button type="button" class="btn btn--gold" [disabled]="busy()" (click)="run('succeeded')">{{ 'PAYMENTS.SANDBOX.SUCCEED' | translate }}</button>
          <button type="button" class="btn btn--outline" [disabled]="busy()" (click)="run('failed')">{{ 'PAYMENTS.SANDBOX.FAIL' | translate }}</button>
          <button type="button" class="btn btn--outline" [disabled]="busy()" (click)="run('cancelled')">{{ 'PAYMENTS.SANDBOX.CANCEL' | translate }}</button>
        </div>
      </div>
    </section>
  `
})
export class PaymentSandboxPage {
  private readonly api = inject(PaymentsApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  run(outcome: 'succeeded' | 'failed' | 'cancelled'): void {
    const id = this.route.snapshot.paramMap.get('orderId') ?? '';
    this.busy.set(true);
    this.error.set(null);
    this.api.sandboxSimulate(id, outcome).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => void this.router.navigate(['/payments/orders', id], { queryParams: { result: 'return' } }),
      error: () => { this.busy.set(false); this.error.set('PAYMENTS.SANDBOX.UNAVAILABLE'); }
    });
  }
}
