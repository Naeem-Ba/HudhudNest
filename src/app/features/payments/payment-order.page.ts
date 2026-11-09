// One order (/payments/orders/:id): the page a customer lands on after the provider's hosted checkout (?result=return|cancel)
// and the detail page from the history list.
//
// The query string is NEVER read as an outcome. "?result=return" only means the browser came back; the state shown is always the
// one the server holds, learnt from the provider's signed webhook or a status query. While that is still open the page says
// "waiting for confirmation" (never "paid") and re-reads the order.

import { ChangeDetectionStrategy, Component, DestroyRef, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { PaymentsApiService } from '../../core/api/payments-api.service';
import { PaymentOrder } from '../../core/models/payments.model';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner.component';
import { LocalizedDatePipe } from '../../shared/pipes/localized-date.pipe';
import { formatMoney, intlLocale, orderTone } from './payments-format';

const POLL_MS = 3000;
const POLL_MAX = 40; // two minutes, then the customer is told it may take longer and can refresh

@Component({
  selector: 'app-payment-order',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule, TranslateModule, LoadingSpinnerComponent, LocalizedDatePipe],
  styleUrls: ['./payments.scss'],
  template: `
    <section class="pay-page">
      <app-loading-spinner *ngIf="loading()" [label]="'COMMON.LOADING' | translate" />

      <div class="pay-card pay-state" *ngIf="notFound()">
        <div class="pay-state__icon" aria-hidden="true">❓</div>
        <p>{{ 'PAYMENTS.ORDER.NOT_FOUND' | translate }}</p>
        <a class="btn btn--outline" routerLink="/payments">{{ 'PAYMENTS.HISTORY.TITLE' | translate }}</a>
      </div>

      <ng-container *ngIf="order() as o">
        <div class="pay-card pay-state" [attr.data-state]="view()" data-testid="pay-result">
          <ng-container [ngSwitch]="view()">
            <ng-container *ngSwitchCase="'success'">
              <div class="pay-state__icon" aria-hidden="true">✅</div>
              <h1>{{ 'PAYMENTS.RESULT.SUCCESS_TITLE' | translate }}</h1>
              <p>{{ 'PAYMENTS.RESULT.SUCCESS_BODY' | translate }}</p>
            </ng-container>
            <ng-container *ngSwitchCase="'delivering'">
              <div class="pay-state__icon" aria-hidden="true">⏳</div>
              <h1>{{ 'PAYMENTS.RESULT.DELIVERING_TITLE' | translate }}</h1>
              <p>{{ 'PAYMENTS.RESULT.DELIVERING_BODY' | translate }}</p>
            </ng-container>
            <ng-container *ngSwitchCase="'delivery-failed'">
              <div class="pay-state__icon" aria-hidden="true">⚠️</div>
              <h1>{{ 'PAYMENTS.RESULT.DELIVERY_FAILED_TITLE' | translate }}</h1>
              <p>{{ 'PAYMENTS.RESULT.DELIVERY_FAILED_BODY' | translate }}</p>
            </ng-container>
            <ng-container *ngSwitchCase="'pending'">
              <div class="pay-state__icon" aria-hidden="true">⏳</div>
              <h1>{{ 'PAYMENTS.RESULT.PENDING_TITLE' | translate }}</h1>
              <p>{{ 'PAYMENTS.RESULT.PENDING_BODY' | translate }}</p>
              <app-loading-spinner *ngIf="polling()" [label]="'PAYMENTS.RESULT.CHECKING' | translate" />
              <p class="pay-note" *ngIf="!polling()">{{ 'PAYMENTS.RESULT.TAKING_LONGER' | translate }}</p>
            </ng-container>
            <ng-container *ngSwitchCase="'failed'">
              <div class="pay-state__icon" aria-hidden="true">❌</div>
              <h1>{{ 'PAYMENTS.RESULT.FAILED_TITLE' | translate }}</h1>
              <p>{{ 'PAYMENTS.RESULT.FAILED_BODY' | translate }}</p>
            </ng-container>
            <ng-container *ngSwitchCase="'cancelled'">
              <div class="pay-state__icon" aria-hidden="true">🚫</div>
              <h1>{{ 'PAYMENTS.RESULT.CANCELLED_TITLE' | translate }}</h1>
              <p>{{ 'PAYMENTS.RESULT.CANCELLED_BODY' | translate }}</p>
            </ng-container>
            <ng-container *ngSwitchCase="'expired'">
              <div class="pay-state__icon" aria-hidden="true">⌛</div>
              <h1>{{ 'PAYMENTS.RESULT.EXPIRED_TITLE' | translate }}</h1>
              <p>{{ 'PAYMENTS.RESULT.EXPIRED_BODY' | translate }}</p>
            </ng-container>
            <ng-container *ngSwitchDefault>
              <div class="pay-state__icon" aria-hidden="true">↩️</div>
              <h1>{{ 'PAYMENTS.RESULT.REFUND_TITLE' | translate }}</h1>
              <p>{{ 'PAYMENTS.RESULT.REFUND_BODY' | translate }}</p>
            </ng-container>
          </ng-container>
        </div>

        <div class="pay-card">
          <h2>{{ 'PAYMENTS.ORDER.DETAILS' | translate }}</h2>
          <div class="pay-row"><span>{{ 'PAYMENTS.ORDER.NUMBER' | translate }}</span><bdi>{{ o.orderNumber }}</bdi></div>
          <div class="pay-row"><span>{{ 'PAYMENTS.ORDER.WHAT' | translate }}</span><strong>{{ o.description }}</strong></div>
          <div class="pay-row">
            <span>{{ 'PAYMENTS.ORDER.STATUS' | translate }}</span>
            <span class="pay-badge" [ngClass]="tone()">{{ 'PAYMENTS.STATUS.' + o.status | translate }}</span>
          </div>
          <div class="pay-row" *ngIf="o.isSandbox"><span>{{ 'PAYMENTS.ORDER.MODE' | translate }}</span><span class="pay-badge sandbox">{{ 'PAYMENTS.SANDBOX_BADGE' | translate }}</span></div>
          <div class="pay-row"><span>{{ 'PAYMENTS.AMOUNT' | translate }}</span><bdi>{{ money(o.unitAmount) }}</bdi></div>
          <div class="pay-row" *ngIf="o.taxAmount > 0"><span>{{ 'PAYMENTS.TAX' | translate }} ({{ o.taxRatePercent }}%)</span><bdi>{{ money(o.taxAmount) }}</bdi></div>
          <div class="pay-row pay-total"><span>{{ 'PAYMENTS.TOTAL' | translate }}</span><bdi>{{ money(o.totalAmount) }}</bdi></div>
          <div class="pay-row" *ngIf="o.refundedAmount > 0"><span>{{ 'PAYMENTS.REFUNDED' | translate }}</span><bdi>{{ money(o.refundedAmount) }}</bdi></div>
          <div class="pay-row"><span>{{ 'PAYMENTS.ORDER.CREATED' | translate }}</span><bdi>{{ o.createdAt | localDate: 'medium' }}</bdi></div>
          <div class="pay-row" *ngIf="o.paidAt"><span>{{ 'PAYMENTS.ORDER.PAID_AT' | translate }}</span><bdi>{{ o.paidAt | localDate: 'medium' }}</bdi></div>

          <p class="pay-error" role="alert" *ngIf="error() as e">{{ e | translate }}</p>

          <div class="pay-actions">
            <a class="btn btn--gold" *ngIf="o.invoiceId" [routerLink]="['/payments/invoices', o.invoiceId]">{{ 'PAYMENTS.ORDER.VIEW_INVOICE' | translate }}</a>
            <button type="button" class="btn btn--outline" *ngIf="o.canCancel" [disabled]="busy()" (click)="cancel()">{{ 'PAYMENTS.ORDER.CANCEL' | translate }}</button>
            <button type="button" class="btn btn--outline" *ngIf="o.canRequestRefund && !refundOpen()" (click)="refundOpen.set(true)">{{ 'PAYMENTS.ORDER.REQUEST_REFUND' | translate }}</button>
            <a class="btn btn--outline" routerLink="/payments">{{ 'PAYMENTS.HISTORY.TITLE' | translate }}</a>
            <a class="btn btn--outline" routerLink="/kontakt">{{ 'PAYMENTS.CONTACT_US' | translate }}</a>
          </div>

          <form *ngIf="refundOpen()" class="pay-note" (submit)="$event.preventDefault(); sendRefund()">
            <label class="pay-field">
              <span>{{ 'PAYMENTS.REFUND.REASON' | translate }}</span>
              <textarea rows="3" maxlength="500" [value]="refundReason()" (input)="refundReason.set($any($event.target).value)"></textarea>
            </label>
            <div class="pay-actions">
              <button type="submit" class="btn btn--gold" [disabled]="busy() || refundReason().trim().length < 3">{{ 'PAYMENTS.REFUND.SEND' | translate }}</button>
              <button type="button" class="btn btn--outline" (click)="refundOpen.set(false)">{{ 'COMMON.CANCEL' | translate }}</button>
            </div>
          </form>
          <p class="pay-note" *ngIf="refundSent()">{{ 'PAYMENTS.REFUND.SENT' | translate }}</p>
        </div>
      </ng-container>
    </section>
  `
})
export class PaymentOrderPage implements OnInit, OnDestroy {
  private readonly api = inject(PaymentsApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  readonly order = signal<PaymentOrder | null>(null);
  readonly loading = signal(true);
  readonly notFound = signal(false);
  readonly polling = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly refundOpen = signal(false);
  readonly refundReason = signal('');
  readonly refundSent = signal(false);

  private timer: ReturnType<typeof setTimeout> | null = null;
  private polls = 0;
  private id = '';

  readonly tone = computed(() => orderTone(this.order()?.status ?? ''));

  /** What the customer is shown. Derived only from server state. */
  readonly view = computed<'success' | 'delivering' | 'delivery-failed' | 'pending' | 'failed' | 'cancelled' | 'expired' | 'refund'>(() => {
    const o = this.order();
    switch (o?.status) {
      case 'Succeeded':
        if (o.entitlementStatus === 'Failed') return 'delivery-failed';
        if (o.entitlementStatus === 'Pending') return 'delivering';
        return 'success';
      case 'Failed': return 'failed';
      case 'Cancelled': return 'cancelled';
      case 'Expired': return 'expired';
      case 'Created': case 'Pending': case 'Processing': return 'pending';
      default: return 'refund';
    }
  });

  ngOnInit(): void {
    this.id = this.route.snapshot.paramMap.get('id') ?? '';
    this.load();
  }

  ngOnDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  money(amount: number): string {
    return formatMoney(amount, this.order()?.currencyCode, intlLocale(this.translate.currentLang));
  }

  private load(): void {
    this.api.order(this.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: order => {
        this.order.set(order);
        this.loading.set(false);
        this.schedulePoll();
      },
      error: () => { this.loading.set(false); this.notFound.set(true); }
    });
  }

  private schedulePoll(): void {
    const view = this.view();
    const open = view === 'pending' || view === 'delivering';
    if (!open || this.polls >= POLL_MAX) { this.polling.set(false); return; }
    this.polling.set(true);
    this.polls++;
    this.timer = setTimeout(() => this.load(), POLL_MS);
  }

  cancel(): void {
    this.busy.set(true);
    this.error.set(null);
    this.api.cancelOrder(this.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: order => { this.order.set(order); this.busy.set(false); },
      error: () => { this.busy.set(false); this.error.set('PAYMENTS.ERRORS.GENERIC'); this.load(); }
    });
  }

  sendRefund(): void {
    this.busy.set(true);
    this.error.set(null);
    this.api.requestRefund(this.id, this.refundReason().trim()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.busy.set(false); this.refundOpen.set(false); this.refundSent.set(true); this.load(); },
      error: () => { this.busy.set(false); this.error.set('PAYMENTS.ERRORS.GENERIC'); }
    });
  }
}
