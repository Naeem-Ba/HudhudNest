// A single invoice or credit note (/payments/invoices/:id). Printable (browser "save as PDF"); the numbers are the ones the
// server issued — a snapshot taken when the payment settled, so they never change afterwards.

import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { PaymentsApiService } from '../../core/api/payments-api.service';
import { PaymentInvoice } from '../../core/models/payments.model';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner.component';
import { LocalizedDatePipe } from '../../shared/pipes/localized-date.pipe';
import { formatMoney, intlLocale } from './payments-format';

@Component({
  selector: 'app-payment-invoice',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule, TranslateModule, LoadingSpinnerComponent, LocalizedDatePipe],
  styleUrls: ['./payments.scss'],
  template: `
    <section class="pay-page">
      <app-loading-spinner *ngIf="loading()" [label]="'COMMON.LOADING' | translate" />
      <p class="pay-error" *ngIf="failed()">{{ 'PAYMENTS.INVOICE.NOT_FOUND' | translate }}</p>

      <ng-container *ngIf="invoice() as i">
        <div class="pay-actions no-print" style="margin-block-end: var(--space-3)">
          <a class="btn btn--outline" routerLink="/payments">{{ 'PAYMENTS.HISTORY.TITLE' | translate }}</a>
          <button type="button" class="btn btn--gold" (click)="print()">{{ 'PAYMENTS.INVOICE.PRINT' | translate }}</button>
        </div>

        <article class="invoice-sheet" data-testid="invoice">
          <h1>{{ (i.kind === 'CreditNote' ? 'PAYMENTS.INVOICE.CREDIT_NOTE' : 'PAYMENTS.INVOICE.TITLE') | translate }} <bdi>{{ i.number }}</bdi></h1>
          <div class="pay-row"><span>{{ 'PAYMENTS.INVOICE.ISSUED' | translate }}</span><bdi>{{ i.issuedAt | localDate: 'mediumDate' }}</bdi></div>
          <div class="pay-row"><span>{{ 'PAYMENTS.ORDER.NUMBER' | translate }}</span><bdi>{{ i.orderNumber }}</bdi></div>
          <div class="pay-row"><span>{{ 'PAYMENTS.INVOICE.SELLER' | translate }}</span>
            <span style="text-align:end"><strong>{{ i.sellerName }}</strong><br>{{ i.sellerAddress }}, {{ i.sellerCountry }}
              <ng-container *ngIf="i.sellerTaxId"><br>{{ 'PAYMENTS.INVOICE.TAX_ID' | translate }}: <bdi>{{ i.sellerTaxId }}</bdi></ng-container></span></div>
          <div class="pay-row"><span>{{ 'PAYMENTS.INVOICE.CUSTOMER' | translate }}</span><span><strong>{{ i.customerName }}</strong><ng-container *ngIf="i.customerCountry"> · {{ i.customerCountry }}</ng-container></span></div>
          <div class="pay-row"><span>{{ 'PAYMENTS.ORDER.WHAT' | translate }}</span><strong>{{ i.description }}</strong></div>
          <div class="pay-row" *ngIf="i.periodStart && i.periodEnd"><span>{{ 'PAYMENTS.INVOICE.PERIOD' | translate }}</span>
            <bdi>{{ i.periodStart | localDate: 'mediumDate' }} – {{ i.periodEnd | localDate: 'mediumDate' }}</bdi></div>
          <div class="pay-row"><span>{{ 'PAYMENTS.INVOICE.NET' | translate }}</span><bdi>{{ money(i.netAmount, i.currencyCode) }}</bdi></div>
          <div class="pay-row"><span>{{ 'PAYMENTS.TAX' | translate }} ({{ i.taxRatePercent }}%)</span><bdi>{{ money(i.taxAmount, i.currencyCode) }}</bdi></div>
          <div class="pay-row pay-total"><span>{{ 'PAYMENTS.TOTAL' | translate }}</span><bdi>{{ money(i.grossAmount, i.currencyCode) }}</bdi></div>
          <div class="pay-row" *ngIf="i.paymentDate"><span>{{ 'PAYMENTS.INVOICE.PAID_ON' | translate }}</span><bdi>{{ i.paymentDate | localDate: 'mediumDate' }}</bdi></div>
          <div class="pay-row" *ngIf="i.paymentReference"><span>{{ 'PAYMENTS.INVOICE.REFERENCE' | translate }}</span><bdi>{{ i.paymentReference }}</bdi></div>
          <p class="pay-note" *ngIf="i.taxAmount === 0">{{ 'PAYMENTS.INVOICE.NO_TAX_NOTE' | translate }}</p>
        </article>
      </ng-container>
    </section>
  `
})
export class PaymentInvoicePage implements OnInit {
  private readonly api = inject(PaymentsApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  readonly invoice = signal<PaymentInvoice | null>(null);
  readonly loading = signal(true);
  readonly failed = signal(false);

  ngOnInit(): void {
    this.api.invoice(this.route.snapshot.paramMap.get('id') ?? '').pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: invoice => { this.invoice.set(invoice); this.loading.set(false); },
      error: () => { this.loading.set(false); this.failed.set(true); }
    });
  }

  money(amount: number, currency: string): string {
    return formatMoney(amount, currency, intlLocale(this.translate.currentLang));
  }

  print(): void {
    window.print();
  }
}
