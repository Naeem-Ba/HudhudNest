// Billing centre (/payments): the current subscription (cancel / resume / downgrade), order history, invoices and refunds.
// Cancelling a subscription stops renewal only; what was paid for keeps working until the period ends (the page says so).

import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { forkJoin, of, catchError } from 'rxjs';

import { PaymentsApiService } from '../../core/api/payments-api.service';
import { PaymentInvoice, PaymentOrder, PaymentRefund, PaymentSubscription } from '../../core/models/payments.model';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner.component';
import { LocalizedDatePipe } from '../../shared/pipes/localized-date.pipe';
import { formatMoney, intlLocale, orderTone } from './payments-format';

type Tab = 'orders' | 'invoices' | 'refunds';

@Component({
  selector: 'app-payment-history',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule, TranslateModule, LoadingSpinnerComponent, LocalizedDatePipe],
  styleUrls: ['./payments.scss'],
  template: `
    <section class="pay-page">
      <header class="pay-head">
        <h1>{{ 'PAYMENTS.HISTORY.TITLE' | translate }}</h1>
        <p>{{ 'PAYMENTS.HISTORY.SUBTITLE' | translate }}</p>
      </header>

      <app-loading-spinner *ngIf="loading()" [label]="'COMMON.LOADING' | translate" />
      <p class="pay-error" role="alert" *ngIf="error() as e">{{ e | translate }}</p>

      <ng-container *ngIf="!loading()">
        <div class="pay-card" data-testid="pay-subscription">
          <h2>{{ 'PAYMENTS.SUBSCRIPTION.TITLE' | translate }}</h2>

          <ng-container *ngIf="subscription() as s; else noSub">
            <div class="pay-row"><span>{{ 'PAYMENTS.SUBSCRIPTION.PLAN' | translate }}</span>
              <strong>{{ 'PRICING.' + s.planTier.toUpperCase() + '.NAME' | translate }} · {{ 'PAYMENTS.INTERVAL.' + s.interval | translate }}</strong></div>
            <div class="pay-row"><span>{{ 'PAYMENTS.ORDER.STATUS' | translate }}</span>
              <span class="pay-badge" [ngClass]="s.status === 'Active' ? 'ok' : (s.status === 'PastDue' ? 'warn' : '')">{{ 'PAYMENTS.SUB_STATUS.' + s.status | translate }}</span></div>
            <div class="pay-row"><span>{{ 'PAYMENTS.SUBSCRIPTION.PERIOD_END' | translate }}</span><bdi>{{ s.currentPeriodEnd | localDate: 'mediumDate' }}</bdi></div>
            <div class="pay-row"><span>{{ 'PAYMENTS.SUBSCRIPTION.RENEWAL' | translate }}</span>
              <span>{{ (s.cancelAtPeriodEnd ? 'PAYMENTS.SUBSCRIPTION.RENEWAL_OFF' : (s.autoRenew ? 'PAYMENTS.SUBSCRIPTION.RENEWAL_ON' : 'PAYMENTS.SUBSCRIPTION.RENEWAL_NONE')) | translate }}</span></div>
            <div class="pay-row" *ngIf="s.autoRenew && s.consentAmount !== null">
              <span>{{ 'PAYMENTS.SUBSCRIPTION.CONSENT' | translate }}</span>
              <bdi>{{ money(s.consentAmount, s.consentCurrencyCode) }} · {{ s.consentAcceptedAt | localDate: 'mediumDate' }}</bdi></div>
            <div class="pay-row" *ngIf="s.pendingPlanTier"><span>{{ 'PAYMENTS.SUBSCRIPTION.PENDING_PLAN' | translate }}</span>
              <strong>{{ 'PRICING.' + s.pendingPlanTier.toUpperCase() + '.NAME' | translate }}</strong></div>

            <p class="pay-note" *ngIf="s.status === 'PastDue' && s.graceEndsAt">
              {{ 'PAYMENTS.SUBSCRIPTION.PAST_DUE' | translate: { date: (s.graceEndsAt | localDate: 'mediumDate') } }}
            </p>
            <p class="pay-note" *ngIf="s.cancelAtPeriodEnd">
              {{ 'PAYMENTS.SUBSCRIPTION.CANCELLED_NOTE' | translate: { date: (s.currentPeriodEnd | localDate: 'mediumDate') } }}
            </p>

            <div class="pay-actions" *ngIf="s.status === 'Active' || s.status === 'PastDue'">
              <button type="button" class="btn btn--outline" *ngIf="!s.cancelAtPeriodEnd && !confirmCancel()" (click)="confirmCancel.set(true)" data-testid="sub-cancel">
                {{ 'PAYMENTS.SUBSCRIPTION.CANCEL' | translate }}</button>
              <button type="button" class="btn btn--gold" *ngIf="s.cancelAtPeriodEnd" [disabled]="busy()" (click)="resume()">
                {{ 'PAYMENTS.SUBSCRIPTION.RESUME' | translate }}</button>
              <a class="btn btn--outline" routerLink="/pricing">{{ 'PAYMENTS.SUBSCRIPTION.CHANGE' | translate }}</a>
            </div>

            <div class="pay-note" *ngIf="confirmCancel()" role="alertdialog">
              <p>{{ 'PAYMENTS.SUBSCRIPTION.CANCEL_CONFIRM' | translate: { date: (s.currentPeriodEnd | localDate: 'mediumDate') } }}</p>
              <div class="pay-actions">
                <button type="button" class="btn btn--gold" [disabled]="busy()" (click)="cancel()" data-testid="sub-cancel-yes">{{ 'PAYMENTS.SUBSCRIPTION.CANCEL_YES' | translate }}</button>
                <button type="button" class="btn btn--outline" (click)="confirmCancel.set(false)">{{ 'PAYMENTS.SUBSCRIPTION.CANCEL_NO' | translate }}</button>
              </div>
            </div>
          </ng-container>
          <ng-template #noSub>
            <p class="pay-note">{{ 'PAYMENTS.SUBSCRIPTION.NONE' | translate }}</p>
            <a class="btn btn--gold" routerLink="/pricing">{{ 'PAYMENTS.BACK_TO_PRICING' | translate }}</a>
          </ng-template>
        </div>

        <div class="pay-tabs" role="tablist">
          <button type="button" class="pay-chip" role="tab" *ngFor="let t of tabs" [class.is-selected]="tab() === t" [attr.aria-selected]="tab() === t" (click)="tab.set(t)">
            {{ 'PAYMENTS.HISTORY.TAB_' + t.toUpperCase() | translate }}
          </button>
        </div>

        <div class="pay-card pay-table-wrap" *ngIf="tab() === 'orders'">
          <p class="pay-note" *ngIf="orders().length === 0">{{ 'PAYMENTS.HISTORY.EMPTY' | translate }}</p>
          <table class="pay-table" *ngIf="orders().length > 0">
            <thead><tr>
              <th>{{ 'PAYMENTS.ORDER.NUMBER' | translate }}</th><th>{{ 'PAYMENTS.ORDER.WHAT' | translate }}</th>
              <th>{{ 'PAYMENTS.ORDER.STATUS' | translate }}</th><th class="num">{{ 'PAYMENTS.TOTAL' | translate }}</th><th>{{ 'PAYMENTS.ORDER.CREATED' | translate }}</th><th></th>
            </tr></thead>
            <tbody>
              <tr *ngFor="let o of orders()">
                <td><bdi>{{ o.orderNumber }}</bdi></td><td>{{ o.description }}</td>
                <td><span class="pay-badge" [ngClass]="tone(o.status)">{{ 'PAYMENTS.STATUS.' + o.status | translate }}</span>
                    <span class="pay-badge sandbox" *ngIf="o.isSandbox">{{ 'PAYMENTS.SANDBOX_BADGE' | translate }}</span></td>
                <td class="num"><bdi>{{ money(o.totalAmount, o.currencyCode) }}</bdi></td>
                <td><bdi>{{ o.createdAt | localDate: 'short' }}</bdi></td>
                <td><a [routerLink]="['/payments/orders', o.id]">{{ 'PAYMENTS.HISTORY.OPEN' | translate }}</a></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="pay-card pay-table-wrap" *ngIf="tab() === 'invoices'">
          <p class="pay-note" *ngIf="invoices().length === 0">{{ 'PAYMENTS.HISTORY.EMPTY_INVOICES' | translate }}</p>
          <table class="pay-table" *ngIf="invoices().length > 0">
            <thead><tr><th>{{ 'PAYMENTS.INVOICE.NUMBER' | translate }}</th><th>{{ 'PAYMENTS.INVOICE.ISSUED' | translate }}</th><th class="num">{{ 'PAYMENTS.TOTAL' | translate }}</th><th></th></tr></thead>
            <tbody>
              <tr *ngFor="let i of invoices()">
                <td><bdi>{{ i.number }}</bdi> <span class="pay-badge info" *ngIf="i.kind === 'CreditNote'">{{ 'PAYMENTS.INVOICE.CREDIT_NOTE' | translate }}</span></td>
                <td><bdi>{{ i.issuedAt | localDate: 'mediumDate' }}</bdi></td>
                <td class="num"><bdi>{{ money(i.grossAmount, i.currencyCode) }}</bdi></td>
                <td><a [routerLink]="['/payments/invoices', i.id]">{{ 'PAYMENTS.HISTORY.OPEN' | translate }}</a></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="pay-card pay-table-wrap" *ngIf="tab() === 'refunds'">
          <p class="pay-note" *ngIf="refunds().length === 0">{{ 'PAYMENTS.HISTORY.EMPTY_REFUNDS' | translate }}</p>
          <table class="pay-table" *ngIf="refunds().length > 0">
            <thead><tr><th>{{ 'PAYMENTS.ORDER.NUMBER' | translate }}</th><th>{{ 'PAYMENTS.ORDER.STATUS' | translate }}</th><th class="num">{{ 'PAYMENTS.AMOUNT' | translate }}</th><th>{{ 'PAYMENTS.REFUND.REASON' | translate }}</th><th>{{ 'PAYMENTS.REFUND.NOTE' | translate }}</th></tr></thead>
            <tbody>
              <tr *ngFor="let r of refunds()">
                <td><a [routerLink]="['/payments/orders', r.orderId]"><bdi>{{ r.orderNumber }}</bdi></a></td>
                <td><span class="pay-badge" [ngClass]="r.status === 'Succeeded' ? 'ok' : (r.status === 'Rejected' || r.status === 'Failed' ? 'bad' : 'warn')">{{ 'PAYMENTS.REFUND_STATUS.' + r.status | translate }}</span></td>
                <td class="num"><bdi>{{ money(r.amount, r.currencyCode) }}</bdi></td>
                <td style="white-space:normal">{{ r.reason }}</td>
                <td style="white-space:normal">{{ r.decisionNote || r.failureReason || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </ng-container>
    </section>
  `
})
export class PaymentHistoryPage implements OnInit {
  private readonly api = inject(PaymentsApiService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  readonly tabs: Tab[] = ['orders', 'invoices', 'refunds'];
  readonly tab = signal<Tab>('orders');
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly confirmCancel = signal(false);

  readonly subscription = signal<PaymentSubscription | null>(null);
  readonly orders = signal<PaymentOrder[]>([]);
  readonly invoices = signal<PaymentInvoice[]>([]);
  readonly refunds = signal<PaymentRefund[]>([]);

  ngOnInit(): void {
    this.reload();
  }

  money(amount: number | null | undefined, currency: string | null | undefined): string {
    return formatMoney(amount, currency, intlLocale(this.translate.currentLang));
  }

  tone(status: string): string {
    return orderTone(status);
  }

  private reload(): void {
    this.loading.set(true);
    forkJoin({
      sub: this.api.mySubscription().pipe(catchError(() => of(null))),
      orders: this.api.myOrders(1, 50).pipe(catchError(() => of(null))),
      invoices: this.api.myInvoices().pipe(catchError(() => of([] as PaymentInvoice[]))),
      refunds: this.api.myRefunds().pipe(catchError(() => of([] as PaymentRefund[])))
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(result => {
      this.subscription.set(result.sub ?? null);
      this.orders.set(result.orders?.items ?? []);
      this.invoices.set(result.invoices);
      this.refunds.set(result.refunds);
      this.error.set(result.orders === null ? 'PAYMENTS.ERRORS.GENERIC' : null);
      this.loading.set(false);
    });
  }

  cancel(): void {
    this.act(this.api.cancelSubscription());
  }

  resume(): void {
    this.act(this.api.resumeSubscription());
  }

  private act(request: ReturnType<PaymentsApiService['cancelSubscription']>): void {
    this.busy.set(true);
    this.error.set(null);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: sub => { this.subscription.set(sub); this.busy.set(false); this.confirmCancel.set(false); },
      error: () => { this.busy.set(false); this.error.set('PAYMENTS.ERRORS.GENERIC'); }
    });
  }
}
