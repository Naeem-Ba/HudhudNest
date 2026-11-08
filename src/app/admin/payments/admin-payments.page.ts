// Payments back office (/admin/payments): dashboard, transactions, subscriptions, refunds, providers, webhook monitor, reports.
//
// There is NO "mark as paid" anywhere in this page, and none exists in the API: an order becomes paid only through a
// provider-verified webhook or a status query to the provider. What an administrator can do is ask the provider again
// ("Re-check with provider"), reprocess a stored webhook, add a note, and decide refunds. Every action is audited server-side.

import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Observable } from 'rxjs';

import { AdminPaymentsApiService } from '../../core/api/admin-payments-api.service';
import {
  AdminOrderDetail, AdminOrderRow, AdminProvider, AdminRefundRow, AdminSubscriptionRow, AdminWebhookRow,
  PaymentDashboard, PaymentReport
} from '../../core/models/payments.model';
import { ToastService } from '../../shared/services/toast.service';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner.component';
import { LocalizedDatePipe } from '../../shared/pipes/localized-date.pipe';
import { formatMoney, intlLocale, orderTone } from '../../features/payments/payments-format';

type Tab = 'dashboard' | 'orders' | 'subscriptions' | 'refunds' | 'providers' | 'webhooks' | 'reports';

@Component({
  selector: 'app-admin-payments',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule, TranslateModule, LoadingSpinnerComponent, LocalizedDatePipe],
  styleUrls: ['../../features/payments/payments.scss'],
  template: `
    <section class="pay-page" style="width:min(1200px,100%)">
      <header class="pay-head">
        <h1>{{ 'ADMIN_PAY.TITLE' | translate }}</h1>
        <p>{{ 'ADMIN_PAY.SUBTITLE' | translate }}</p>
      </header>

      <div class="pay-tabs" role="tablist">
        <button type="button" class="pay-chip" role="tab" *ngFor="let t of tabs" [class.is-selected]="tab() === t"
                [attr.aria-selected]="tab() === t" (click)="open(t)">{{ 'ADMIN_PAY.TAB_' + t.toUpperCase() | translate }}</button>
      </div>

      <app-loading-spinner *ngIf="loading()" [label]="'COMMON.LOADING' | translate" />
      <p class="pay-error" role="alert" *ngIf="error() as e">{{ e | translate }}</p>

      <!-- ── dashboard ── -->
      <ng-container *ngIf="tab() === 'dashboard' && dashboard() as d">
        <div class="pay-kpis">
          <div class="pay-kpi"><small>{{ 'ADMIN_PAY.REVENUE_USD' | translate }}</small><strong><bdi>{{ money(d.revenueUsd, 'USD') }}</bdi></strong></div>
          <div class="pay-kpi"><small>{{ 'ADMIN_PAY.ORDERS' | translate }}</small><strong>{{ d.totalOrders }}</strong></div>
          <div class="pay-kpi"><small>{{ 'ADMIN_PAY.SUCCEEDED' | translate }}</small><strong>{{ d.succeeded }}</strong></div>
          <div class="pay-kpi"><small>{{ 'ADMIN_PAY.FAILED' | translate }}</small><strong>{{ d.failed }}</strong></div>
          <div class="pay-kpi"><small>{{ 'ADMIN_PAY.PENDING' | translate }}</small><strong>{{ d.pending }}</strong></div>
          <div class="pay-kpi"><small>{{ 'ADMIN_PAY.ACTIVE_SUBS' | translate }}</small><strong>{{ d.activeSubscriptions }}</strong></div>
        </div>
        <h2>{{ 'ADMIN_PAY.NEEDS_ATTENTION' | translate }}</h2>
        <div class="pay-kpis">
          <div class="pay-kpi" [class.alert]="d.failedWebhooks > 0"><small>{{ 'ADMIN_PAY.FAILED_WEBHOOKS' | translate }}</small><strong>{{ d.failedWebhooks }}</strong></div>
          <div class="pay-kpi" [class.alert]="d.stalePendingOrders > 0"><small>{{ 'ADMIN_PAY.STALE_PENDING' | translate }}</small><strong>{{ d.stalePendingOrders }}</strong></div>
          <div class="pay-kpi" [class.alert]="d.failedEntitlements > 0"><small>{{ 'ADMIN_PAY.FAILED_ENTITLEMENTS' | translate }}</small><strong>{{ d.failedEntitlements }}</strong></div>
          <div class="pay-kpi" [class.alert]="d.openRefundRequests > 0"><small>{{ 'ADMIN_PAY.OPEN_REFUNDS' | translate }}</small><strong>{{ d.openRefundRequests }}</strong></div>
          <div class="pay-kpi" [class.alert]="d.pastDueSubscriptions > 0"><small>{{ 'ADMIN_PAY.PAST_DUE' | translate }}</small><strong>{{ d.pastDueSubscriptions }}</strong></div>
        </div>
        <div class="pay-card pay-table-wrap" *ngIf="d.revenueByCurrency.length > 0">
          <h2>{{ 'ADMIN_PAY.BY_CURRENCY' | translate }}</h2>
          <table class="pay-table"><tbody>
            <tr *ngFor="let c of d.revenueByCurrency"><td>{{ c.currencyCode }}</td><td class="num"><bdi>{{ money(c.amount, c.currencyCode) }}</bdi></td><td class="num">{{ c.count }}</td></tr>
          </tbody></table>
        </div>
        <div class="pay-actions">
          <button type="button" class="btn btn--outline" [disabled]="busy()" (click)="reconcile()">{{ 'ADMIN_PAY.RECONCILE' | translate }}</button>
        </div>
      </ng-container>

      <!-- ── orders ── -->
      <div class="pay-card pay-table-wrap" *ngIf="tab() === 'orders'">
        <div class="pay-actions" style="margin-block-end: var(--space-3)">
          <label class="pay-field"><span>{{ 'ADMIN_PAY.SEARCH' | translate }}</span>
            <input type="search" [value]="search()" (input)="search.set($any($event.target).value)" (keydown.enter)="loadOrders()" /></label>
          <label class="pay-field"><span>{{ 'PAYMENTS.ORDER.STATUS' | translate }}</span>
            <select (change)="statusFilter.set($any($event.target).value); loadOrders()">
              <option value="">{{ 'ADMIN_PAY.ALL' | translate }}</option>
              <option *ngFor="let s of orderStatuses" [value]="s">{{ 'PAYMENTS.STATUS.' + s | translate }}</option>
            </select></label>
        </div>
        <table class="pay-table">
          <thead><tr><th>{{ 'PAYMENTS.ORDER.NUMBER' | translate }}</th><th>{{ 'ADMIN_PAY.USER' | translate }}</th><th>{{ 'PAYMENTS.ORDER.WHAT' | translate }}</th><th>{{ 'ADMIN_PAY.PROVIDER' | translate }}</th><th>{{ 'PAYMENTS.ORDER.STATUS' | translate }}</th><th class="num">{{ 'PAYMENTS.TOTAL' | translate }}</th><th>{{ 'PAYMENTS.ORDER.CREATED' | translate }}</th></tr></thead>
          <tbody>
            <tr *ngFor="let o of orders()" (click)="openOrder(o.id)" style="cursor:pointer">
              <td><bdi>{{ o.orderNumber }}</bdi></td><td>{{ o.userName || '—' }}</td><td>{{ o.productType }} {{ o.productCode }}</td>
              <td>{{ o.providerCode || '—' }} <span class="pay-badge sandbox" *ngIf="o.isSandbox">{{ 'PAYMENTS.SANDBOX_BADGE' | translate }}</span></td>
              <td><span class="pay-badge" [ngClass]="tone(o.status)">{{ 'PAYMENTS.STATUS.' + o.status | translate }}</span></td>
              <td class="num"><bdi>{{ money(o.totalAmount, o.currencyCode) }}</bdi></td><td><bdi>{{ o.createdAt | localDate: 'short' }}</bdi></td>
            </tr>
          </tbody>
        </table>
        <p class="pay-note" *ngIf="orders().length === 0 && !loading()">{{ 'ADMIN_PAY.EMPTY' | translate }}</p>
      </div>

      <!-- ── order detail ── -->
      <div class="pay-card" *ngIf="tab() === 'orders' && detail() as d" data-testid="order-detail">
        <h2><bdi>{{ d.order.orderNumber }}</bdi> · {{ d.userName || d.userId }}</h2>
        <div class="pay-row"><span>{{ 'ADMIN_PAY.CORRELATION' | translate }}</span><bdi>{{ d.correlationId }}</bdi></div>
        <div class="pay-row"><span>{{ 'PAYMENTS.ORDER.STATUS' | translate }}</span><span class="pay-badge" [ngClass]="tone(d.order.status)">{{ 'PAYMENTS.STATUS.' + d.order.status | translate }}</span></div>
        <div class="pay-row" *ngIf="d.order.entitlementStatus"><span>{{ 'ADMIN_PAY.ENTITLEMENT' | translate }}</span><span>{{ d.order.entitlementStatus }} {{ d.order.entitlementFailureReason }}</span></div>

        <h2 style="margin-block-start: var(--space-4)">{{ 'ADMIN_PAY.TRANSACTIONS' | translate }}</h2>
        <div class="pay-table-wrap"><table class="pay-table"><tbody>
          <tr *ngFor="let t of d.transactions"><td>{{ t.kind }}</td><td>{{ t.providerCode }}</td><td><bdi>{{ t.providerReference }}</bdi></td><td>{{ t.status }} {{ t.rawStatus }}</td><td class="num"><bdi>{{ money(t.amount, t.currencyCode) }}</bdi></td></tr>
        </tbody></table></div>

        <h2 style="margin-block-start: var(--space-4)">{{ 'ADMIN_PAY.AUDIT' | translate }}</h2>
        <div class="pay-table-wrap"><table class="pay-table"><tbody>
          <tr *ngFor="let a of d.audit"><td><bdi>{{ a.occurredAt | localDate: 'medium' }}</bdi></td><td>{{ a.actorType }}</td><td>{{ a.action }}</td><td style="white-space:normal;max-width:30ch;overflow-wrap:anywhere">{{ a.details }}</td></tr>
        </tbody></table></div>

        <div class="pay-actions" style="margin-block-start: var(--space-4)">
          <button type="button" class="btn btn--outline" [disabled]="busy()" (click)="resync(d.order.id)">{{ 'ADMIN_PAY.RESYNC' | translate }}</button>
        </div>
        <label class="pay-field" style="margin-block-start: var(--space-3)"><span>{{ 'ADMIN_PAY.NOTE' | translate }}</span>
          <textarea rows="2" maxlength="500" [value]="note()" (input)="note.set($any($event.target).value)"></textarea></label>
        <button type="button" class="btn btn--outline" [disabled]="busy() || note().trim().length === 0" (click)="addNote(d.order.id)">{{ 'ADMIN_PAY.ADD_NOTE' | translate }}</button>

        <ng-container *ngIf="d.order.canRequestRefund || d.order.status === 'PartiallyRefunded'">
          <h2 style="margin-block-start: var(--space-4)">{{ 'ADMIN_PAY.REFUND_ORDER' | translate }}</h2>
          <label class="pay-field"><span>{{ 'ADMIN_PAY.REFUND_AMOUNT' | translate }}</span>
            <input type="number" min="0" step="0.01" [value]="refundAmount()" (input)="refundAmount.set($any($event.target).value)" /></label>
          <label class="pay-field"><span>{{ 'PAYMENTS.REFUND.REASON' | translate }}</span>
            <input type="text" maxlength="300" [value]="refundReason()" (input)="refundReason.set($any($event.target).value)" /></label>
          <button type="button" class="btn btn--gold" [disabled]="busy() || refundReason().trim().length < 3" (click)="refundOrder(d.order.id)">{{ 'ADMIN_PAY.REFUND_SEND' | translate }}</button>
        </ng-container>
      </div>

      <!-- ── subscriptions ── -->
      <div class="pay-card pay-table-wrap" *ngIf="tab() === 'subscriptions'">
        <table class="pay-table">
          <thead><tr><th>{{ 'ADMIN_PAY.USER' | translate }}</th><th>{{ 'PAYMENTS.SUBSCRIPTION.PLAN' | translate }}</th><th>{{ 'PAYMENTS.ORDER.STATUS' | translate }}</th><th>{{ 'PAYMENTS.SUBSCRIPTION.PERIOD_END' | translate }}</th><th>{{ 'ADMIN_PAY.AUTO_RENEW' | translate }}</th><th class="num">{{ 'ADMIN_PAY.ATTEMPTS' | translate }}</th></tr></thead>
          <tbody><tr *ngFor="let s of subscriptions()">
            <td>{{ s.userName || s.userId }}</td><td>{{ s.planTier }} · {{ s.interval }}</td>
            <td><span class="pay-badge" [ngClass]="s.status === 'Active' ? 'ok' : (s.status === 'PastDue' ? 'warn' : '')">{{ s.status }}</span></td>
            <td><bdi>{{ s.currentPeriodEnd | localDate: 'mediumDate' }}</bdi></td><td>{{ s.autoRenew && !s.cancelAtPeriodEnd ? '✓' : '—' }}</td><td class="num">{{ s.renewalAttempts }}</td>
          </tr></tbody>
        </table>
        <p class="pay-note" *ngIf="subscriptions().length === 0 && !loading()">{{ 'ADMIN_PAY.EMPTY' | translate }}</p>
      </div>

      <!-- ── refunds ── -->
      <div class="pay-card pay-table-wrap" *ngIf="tab() === 'refunds'">
        <table class="pay-table">
          <thead><tr><th>{{ 'PAYMENTS.ORDER.NUMBER' | translate }}</th><th>{{ 'PAYMENTS.ORDER.STATUS' | translate }}</th><th class="num">{{ 'PAYMENTS.AMOUNT' | translate }}</th><th>{{ 'PAYMENTS.REFUND.REASON' | translate }}</th><th></th></tr></thead>
          <tbody><tr *ngFor="let r of refunds()">
            <td><bdi>{{ r.orderNumber }}</bdi></td><td>{{ r.status }} <small>({{ r.source }})</small></td>
            <td class="num"><bdi>{{ money(r.amount, r.currencyCode) }}</bdi></td><td style="white-space:normal">{{ r.reason }}</td>
            <td class="pay-actions">
              <button type="button" class="btn btn--gold" *ngIf="r.status === 'Requested'" [disabled]="busy()" (click)="decide(r.id, true)">{{ 'ADMIN_PAY.APPROVE' | translate }}</button>
              <button type="button" class="btn btn--outline" *ngIf="r.status === 'Requested'" [disabled]="busy()" (click)="decide(r.id, false)">{{ 'ADMIN_PAY.REJECT' | translate }}</button>
              <button type="button" class="btn btn--outline" *ngIf="r.status === 'Failed' || r.status === 'Approved'" [disabled]="busy()" (click)="retryRefund(r.id)">{{ 'ADMIN_PAY.RETRY' | translate }}</button>
            </td>
          </tr></tbody>
        </table>
        <p class="pay-note" *ngIf="refunds().length === 0 && !loading()">{{ 'ADMIN_PAY.EMPTY' | translate }}</p>
      </div>

      <!-- ── providers ── -->
      <ng-container *ngIf="tab() === 'providers'">
        <p class="pay-note">{{ 'ADMIN_PAY.PROVIDERS_NOTE' | translate }}</p>
        <div class="pay-card" *ngFor="let p of providers()">
          <h2>{{ p.displayName }} <small>({{ p.code }})</small>
            <span class="pay-badge sandbox" *ngIf="p.environment === 'Sandbox'">{{ 'PAYMENTS.SANDBOX_BADGE' | translate }}</span>
            <span class="pay-badge" [ngClass]="p.isEnabled ? 'ok' : ''">{{ (p.isEnabled ? 'ADMIN_PAY.ENABLED' : 'ADMIN_PAY.DISABLED') | translate }}</span></h2>
          <div class="pay-row"><span>{{ 'ADMIN_PAY.IMPLEMENTED' | translate }}</span><span>{{ p.isImplemented ? '✓' : '—' }}</span></div>
          <div class="pay-row"><span>{{ 'ADMIN_PAY.ALLOWED_HERE' | translate }}</span><span>{{ p.isAllowedHere ? '✓' : '—' }}</span></div>
          <div class="pay-row"><span>{{ 'ADMIN_PAY.CURRENCIES' | translate }}</span><bdi>{{ p.currencies.join(', ') || '—' }}</bdi></div>
          <div class="pay-row"><span>{{ 'ADMIN_PAY.CAPABILITIES' | translate }}</span>
            <span>{{ p.hostedCheckout ? 'checkout ' : '' }}{{ p.cards ? 'cards ' : '' }}{{ p.wallets ? 'wallets ' : '' }}{{ p.qrCode ? 'qr ' : '' }}{{ p.recurring ? 'recurring ' : '' }}{{ p.refunds ? 'refunds' : '' }}</span></div>
          <p class="pay-note" *ngIf="p.notes">{{ p.notes }}</p>
          <p class="pay-note" *ngIf="p.businessApprovedAt">{{ 'ADMIN_PAY.APPROVED_ON' | translate }} <bdi>{{ p.businessApprovedAt | localDate: 'mediumDate' }}</bdi> — {{ p.businessApprovalNote }}</p>
          <ng-container *ngIf="p.isImplemented && p.isAllowedHere">
            <label class="pay-field" *ngIf="!p.isEnabled && p.environment !== 'Sandbox'"><span>{{ 'ADMIN_PAY.APPROVAL_NOTE' | translate }}</span>
              <input type="text" maxlength="500" [value]="approvalNote()" (input)="approvalNote.set($any($event.target).value)" /></label>
            <button type="button" class="btn" [ngClass]="p.isEnabled ? 'btn--outline' : 'btn--gold'" [disabled]="busy() || (!p.isEnabled && p.environment !== 'Sandbox' && approvalNote().trim().length < 10)" (click)="toggleProvider(p)">
              {{ (p.isEnabled ? 'ADMIN_PAY.DISABLE' : 'ADMIN_PAY.ENABLE') | translate }}</button>
          </ng-container>
        </div>
      </ng-container>

      <!-- ── webhooks ── -->
      <div class="pay-card pay-table-wrap" *ngIf="tab() === 'webhooks'">
        <table class="pay-table">
          <thead><tr><th>{{ 'ADMIN_PAY.PROVIDER' | translate }}</th><th>{{ 'ADMIN_PAY.EVENT' | translate }}</th><th>{{ 'PAYMENTS.ORDER.STATUS' | translate }}</th><th class="num">{{ 'ADMIN_PAY.ATTEMPTS' | translate }}</th><th>{{ 'ADMIN_PAY.RECEIVED' | translate }}</th><th>{{ 'ADMIN_PAY.LAST_ERROR' | translate }}</th><th></th></tr></thead>
          <tbody><tr *ngFor="let w of webhooks()">
            <td>{{ w.providerCode }}</td><td><bdi>{{ w.eventType }}</bdi></td>
            <td><span class="pay-badge" [ngClass]="w.status === 'Processed' ? 'ok' : (w.status === 'Failed' || w.status === 'DeadLetter' ? 'bad' : '')">{{ w.status }}</span></td>
            <td class="num">{{ w.attempts }}</td><td><bdi>{{ w.receivedAt | localDate: 'short' }}</bdi></td>
            <td style="white-space:normal;max-width:30ch;overflow-wrap:anywhere">{{ w.lastError }}</td>
            <td><button type="button" class="btn btn--outline" *ngIf="w.status === 'Failed' || w.status === 'DeadLetter'" [disabled]="busy()" (click)="reprocess(w.id)">{{ 'ADMIN_PAY.REPROCESS' | translate }}</button></td>
          </tr></tbody>
        </table>
        <p class="pay-note" *ngIf="webhooks().length === 0 && !loading()">{{ 'ADMIN_PAY.EMPTY' | translate }}</p>
      </div>

      <!-- ── reports ── -->
      <ng-container *ngIf="tab() === 'reports'">
        <div class="pay-chips">
          <button type="button" class="pay-chip" *ngFor="let g of groupings" [class.is-selected]="groupBy() === g" (click)="groupBy.set(g); loadReport()">{{ 'ADMIN_PAY.GROUP_' + g.toUpperCase() | translate }}</button>
        </div>
        <div class="pay-card pay-table-wrap" *ngIf="report() as r">
          <table class="pay-table">
            <thead><tr><th>{{ 'ADMIN_PAY.GROUP' | translate }}</th><th class="num">{{ 'ADMIN_PAY.ORDERS' | translate }}</th><th class="num">{{ 'ADMIN_PAY.SUCCEEDED' | translate }}</th><th class="num">{{ 'ADMIN_PAY.GROSS_USD' | translate }}</th></tr></thead>
            <tbody><tr *ngFor="let row of r.rows"><td><bdi>{{ row.label || row.key }}</bdi></td><td class="num">{{ row.orders }}</td><td class="num">{{ row.succeeded }}</td><td class="num"><bdi>{{ money(row.grossAmountUsd, 'USD') }}</bdi></td></tr></tbody>
          </table>
          <p class="pay-note" *ngIf="r.rows.length === 0">{{ 'ADMIN_PAY.EMPTY' | translate }}</p>
        </div>
      </ng-container>
    </section>
  `
})
export class AdminPaymentsPage implements OnInit {
  private readonly api = inject(AdminPaymentsApiService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  readonly tabs: Tab[] = ['dashboard', 'orders', 'subscriptions', 'refunds', 'providers', 'webhooks', 'reports'];
  readonly orderStatuses = ['Pending', 'Processing', 'Succeeded', 'Failed', 'Cancelled', 'Expired', 'PartiallyRefunded', 'Refunded'];
  readonly groupings = ['day', 'month', 'provider', 'product', 'currency'];

  readonly tab = signal<Tab>('dashboard');
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly dashboard = signal<PaymentDashboard | null>(null);
  readonly orders = signal<AdminOrderRow[]>([]);
  readonly detail = signal<AdminOrderDetail | null>(null);
  readonly subscriptions = signal<AdminSubscriptionRow[]>([]);
  readonly refunds = signal<AdminRefundRow[]>([]);
  readonly providers = signal<AdminProvider[]>([]);
  readonly webhooks = signal<AdminWebhookRow[]>([]);
  readonly report = signal<PaymentReport | null>(null);

  readonly search = signal('');
  readonly statusFilter = signal('');
  readonly groupBy = signal('day');
  readonly note = signal('');
  readonly refundAmount = signal('');
  readonly refundReason = signal('');
  readonly approvalNote = signal('');

  ngOnInit(): void {
    this.open('dashboard');
  }

  money(amount: number | null | undefined, currency: string): string {
    return formatMoney(amount, currency, intlLocale(this.translate.currentLang));
  }

  tone(status: string): string {
    return orderTone(status);
  }

  open(tab: Tab): void {
    this.tab.set(tab);
    this.error.set(null);
    switch (tab) {
      case 'dashboard': this.fetch(this.api.dashboard(), v => this.dashboard.set(v)); break;
      case 'orders': this.loadOrders(); break;
      case 'subscriptions': this.fetch(this.api.subscriptions(), v => this.subscriptions.set(v.items)); break;
      case 'refunds': this.fetch(this.api.refunds(), v => this.refunds.set(v.items)); break;
      case 'providers': this.fetch(this.api.providers(), v => this.providers.set(v)); break;
      case 'webhooks': this.fetch(this.api.webhooks(), v => this.webhooks.set(v.items)); break;
      case 'reports': this.loadReport(); break;
    }
  }

  loadOrders(): void {
    this.detail.set(null);
    this.fetch(
      this.api.orders({ search: this.search().trim() || undefined, status: this.statusFilter() || undefined, pageSize: 50 }),
      v => this.orders.set(v.items));
  }

  loadReport(): void {
    this.fetch(this.api.report(this.groupBy()), v => this.report.set(v));
  }

  openOrder(id: string): void {
    this.fetch(this.api.order(id), v => { this.detail.set(v); this.note.set(''); this.refundAmount.set(''); this.refundReason.set(''); });
  }

  private fetch<T>(request: Observable<T>, apply: (value: T) => void): void {
    this.loading.set(true);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: value => { apply(value); this.loading.set(false); },
      error: () => { this.loading.set(false); this.error.set('ADMIN_PAY.LOAD_FAILED'); }
    });
  }

  /** Runs an action, toasts the outcome and refreshes the current tab. */
  private run(request: Observable<unknown>, successKey: string, after?: () => void): void {
    this.busy.set(true);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.busy.set(false);
        this.toast.success(this.translate.instant(successKey));
        after?.();
        this.open(this.tab());
      },
      error: () => { this.busy.set(false); this.error.set('ADMIN_PAY.ACTION_FAILED'); }
    });
  }

  reconcile(): void {
    this.run(this.api.reconcile(), 'ADMIN_PAY.DONE');
  }

  resync(orderId: string): void {
    this.run(this.api.resync(orderId), 'ADMIN_PAY.DONE', () => this.openOrder(orderId));
  }

  addNote(orderId: string): void {
    this.run(this.api.addNote(orderId, this.note().trim()), 'ADMIN_PAY.DONE', () => this.openOrder(orderId));
  }

  refundOrder(orderId: string): void {
    const amount = this.refundAmount().trim() === '' ? null : Number(this.refundAmount());
    this.run(this.api.createRefund(orderId, amount, this.refundReason().trim()), 'ADMIN_PAY.DONE', () => this.openOrder(orderId));
  }

  decide(refundId: string, approve: boolean): void {
    this.run(approve ? this.api.approveRefund(refundId, null) : this.api.rejectRefund(refundId, null), 'ADMIN_PAY.DONE');
  }

  retryRefund(refundId: string): void {
    this.run(this.api.retryRefund(refundId), 'ADMIN_PAY.DONE');
  }

  reprocess(eventId: string): void {
    this.run(this.api.reprocessWebhook(eventId), 'ADMIN_PAY.DONE');
  }

  toggleProvider(p: AdminProvider): void {
    this.run(
      this.api.updateProvider(p.code, {
        isEnabled: !p.isEnabled,
        currencies: null,
        countries: null,
        businessApprovalNote: !p.isEnabled && p.environment !== 'Sandbox' ? this.approvalNote().trim() : null
      }),
      'ADMIN_PAY.DONE',
      () => this.approvalNote.set(''));
  }
}
