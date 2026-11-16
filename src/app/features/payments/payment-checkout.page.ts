// Payment checkout (/payments/checkout): summary -> payment method -> (renewal consent) -> hand-off to the provider.
//
// What this page never does: compute a price (the server's quote is shown as is), take card data (every provider here is a
// hosted checkout: the customer types the card on the provider's page), or decide a payment succeeded (it only creates the
// order and leaves; /payments/orders/:id shows the outcome the server learnt from the provider).
//
// Inside the installed iOS/Android app this page offers no purchase: digital goods bought in a store-distributed app must go
// through the store's billing (App Store IAP / Google Play Billing), which is not implemented. The customer is told to use the
// website instead. See docs/PAYMENT_ARCHITECTURE.md ("Store policy").

import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { PaymentsApiService } from '../../core/api/payments-api.service';
import { isNativeApp } from '../../core/native/is-native-app';
import {
  BillingInterval, PaymentCatalog, PaymentProductType, PaymentProviderOption, PaymentQuote
} from '../../core/models/payments.model';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner.component';
import { formatMoney, intlLocale, newIdempotencyKey } from './payments-format';

type ProductQuery = 'plan' | 'featured' | 'extension';

const PRODUCT_TYPES: Readonly<Record<ProductQuery, PaymentProductType>> = {
  plan: 'PlanSubscription',
  featured: 'FeaturedListing',
  extension: 'ListingExtension'
};

@Component({
  selector: 'app-payment-checkout',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule, TranslateModule, LoadingSpinnerComponent],
  styleUrls: ['./payments.scss'],
  template: `
    <section class="pay-page">
      <header class="pay-head">
        <h1>{{ 'PAYMENTS.CHECKOUT.TITLE' | translate }}</h1>
        <p>{{ 'PAYMENTS.CHECKOUT.SUBTITLE' | translate }}</p>
      </header>

      <app-loading-spinner *ngIf="state() === 'loading'" [label]="'COMMON.LOADING' | translate" />

      <div class="pay-card pay-state" *ngIf="state() === 'native'" data-testid="pay-native">
        <div class="pay-state__icon" aria-hidden="true">🌐</div>
        <h1>{{ 'PAYMENTS.NATIVE.TITLE' | translate }}</h1>
        <p>{{ 'PAYMENTS.NATIVE.BODY' | translate }}</p>
      </div>

      <div class="pay-card pay-state" *ngIf="state() === 'unavailable'" data-testid="pay-unavailable">
        <div class="pay-state__icon" aria-hidden="true">⏸️</div>
        <h1>{{ 'PAYMENTS.UNAVAILABLE.TITLE' | translate }}</h1>
        <p>{{ 'PAYMENTS.UNAVAILABLE.BODY' | translate }}</p>
        <div class="pay-actions" style="justify-content:center">
          <a class="btn btn--outline" routerLink="/pricing">{{ 'PAYMENTS.BACK_TO_PRICING' | translate }}</a>
          <a class="btn btn--outline" routerLink="/kontakt">{{ 'PAYMENTS.CONTACT_US' | translate }}</a>
        </div>
      </div>

      <div class="pay-card pay-state" *ngIf="state() === 'invalid'">
        <div class="pay-state__icon" aria-hidden="true">❓</div>
        <p>{{ 'PAYMENTS.CHECKOUT.INVALID' | translate }}</p>
        <a class="btn btn--outline" routerLink="/pricing">{{ 'PAYMENTS.BACK_TO_PRICING' | translate }}</a>
      </div>

      <div class="pay-grid" *ngIf="state() === 'ready' && catalog() as cat">
        <div>
          <div class="pay-card" *ngIf="isPlan()">
            <h2>{{ 'PAYMENTS.CHECKOUT.INTERVAL' | translate }}</h2>
            <div class="pay-chips" role="radiogroup" [attr.aria-label]="'PAYMENTS.CHECKOUT.INTERVAL' | translate">
              <button type="button" class="pay-chip" role="radio" *ngFor="let i of intervals" [class.is-selected]="interval() === i"
                      [attr.aria-checked]="interval() === i" (click)="setInterval(i)">
                {{ 'PAYMENTS.INTERVAL.' + i | translate }}
              </button>
            </div>
          </div>

          <div class="pay-card">
            <h2>{{ 'PAYMENTS.CHECKOUT.CURRENCY' | translate }}</h2>
            <div class="pay-chips" role="radiogroup" [attr.aria-label]="'PAYMENTS.CHECKOUT.CURRENCY' | translate">
              <button type="button" class="pay-chip" role="radio" *ngFor="let c of currencies()" [class.is-selected]="currency() === c"
                      [attr.aria-checked]="currency() === c" (click)="setCurrency(c)">{{ c }}</button>
            </div>
          </div>

          <div class="pay-card">
            <h2>{{ 'PAYMENTS.CHECKOUT.METHOD' | translate }}</h2>
            <label class="pay-choice" *ngFor="let p of availableProviders()" [class.is-selected]="providerCode() === p.code">
              <input type="radio" name="provider" [value]="p.code" [checked]="providerCode() === p.code" (change)="providerCode.set(p.code)" />
              <span>
                <strong>{{ p.displayName }}</strong>
                <span class="pay-badge sandbox" *ngIf="p.isSandbox">{{ 'PAYMENTS.SANDBOX_BADGE' | translate }}</span>
                <small>
                  <ng-container *ngIf="p.cards">{{ 'PAYMENTS.CAP.CARDS' | translate }} · </ng-container>
                  <ng-container *ngIf="p.wallets">{{ 'PAYMENTS.CAP.WALLETS' | translate }} · </ng-container>
                  <ng-container *ngIf="p.qrCode">{{ 'PAYMENTS.CAP.QR' | translate }} · </ng-container>
                  <ng-container *ngIf="p.recurring">{{ 'PAYMENTS.CAP.RECURRING' | translate }}</ng-container>
                </small>
              </span>
            </label>
            <p class="pay-note" *ngIf="availableProviders().length === 0">{{ 'PAYMENTS.CHECKOUT.NO_METHOD' | translate }}</p>
            <p class="pay-note">{{ 'PAYMENTS.CHECKOUT.HOSTED_NOTE' | translate }}</p>
          </div>

          <div class="pay-card" *ngIf="canAutoRenew()">
            <h2>{{ 'PAYMENTS.CHECKOUT.RENEWAL' | translate }}</h2>
            <label class="pay-consent">
              <input type="checkbox" [checked]="consent()" (change)="consent.set($any($event.target).checked)" data-testid="pay-consent" />
              <span>
                {{ 'PAYMENTS.CHECKOUT.CONSENT_TEXT' | translate: {
                     amount: money(quote()?.totalAmount, quote()?.currencyCode),
                     interval: ('PAYMENTS.INTERVAL.' + interval() | translate) } }}
                <a routerLink="/terms-of-service" target="_blank" rel="noopener">{{ 'PAYMENTS.CHECKOUT.TERMS_LINK' | translate }}</a>
                ({{ cat.termsVersion }})
              </span>
            </label>
            <p class="pay-note">{{ 'PAYMENTS.CHECKOUT.CONSENT_HELP' | translate }}</p>
          </div>
        </div>

        <aside class="pay-card" aria-live="polite">
          <h2>{{ 'PAYMENTS.CHECKOUT.SUMMARY' | translate }}</h2>
          <app-loading-spinner *ngIf="quoting()" [label]="'COMMON.LOADING' | translate" />
          <ng-container *ngIf="!quoting() && quote() as q">
            <p><strong>{{ q.description }}</strong></p>
            <div class="pay-row"><span>{{ 'PAYMENTS.AMOUNT' | translate }}</span><bdi>{{ money(q.unitAmount, q.currencyCode) }}</bdi></div>
            <div class="pay-row" *ngIf="q.discountAmount > 0"><span>{{ 'PAYMENTS.DISCOUNT' | translate }}</span><bdi>−{{ money(q.discountAmount, q.currencyCode) }}</bdi></div>
            <div class="pay-row" *ngIf="q.taxAmount > 0">
              <span>{{ 'PAYMENTS.TAX' | translate }} ({{ q.taxRatePercent }}%)</span><bdi>{{ money(q.taxAmount, q.currencyCode) }}</bdi>
            </div>
            <div class="pay-row pay-total"><span>{{ 'PAYMENTS.TOTAL' | translate }}</span><bdi data-testid="pay-total">{{ money(q.totalAmount, q.currencyCode) }}</bdi></div>
            <p class="pay-note" *ngIf="q.taxAmount === 0">{{ 'PAYMENTS.CHECKOUT.NO_TAX_NOTE' | translate }}</p>
          </ng-container>

          <p class="pay-error" role="alert" *ngIf="error() as e">{{ e | translate }}</p>

          <button type="button" class="btn btn--gold" style="width:100%" data-testid="pay-submit"
                  [disabled]="!canSubmit()" (click)="submit()">
            {{ (submitting() ? 'PAYMENTS.CHECKOUT.REDIRECTING' : 'PAYMENTS.CHECKOUT.PAY') | translate }}
          </button>
          <p class="pay-note">{{ 'PAYMENTS.CHECKOUT.SECURE_NOTE' | translate }}</p>
        </aside>
      </div>
    </section>
  `
})
export class PaymentCheckoutPage implements OnInit {
  private readonly api = inject(PaymentsApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  readonly intervals: BillingInterval[] = ['Monthly', 'Yearly'];

  readonly state = signal<'loading' | 'ready' | 'unavailable' | 'native' | 'invalid'>('loading');
  readonly catalog = signal<PaymentCatalog | null>(null);
  readonly quote = signal<PaymentQuote | null>(null);
  readonly quoting = signal(false);
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);

  readonly product = signal<ProductQuery>('plan');
  readonly planTier = signal<string | null>(null);
  readonly propertyId = signal<string | null>(null);
  readonly interval = signal<BillingInterval>('Monthly');
  readonly currency = signal('USD');
  readonly providerCode = signal<string | null>(null);
  readonly consent = signal(false);

  /** One key per purchase attempt: a double tap or a retry after a network drop returns the same order. */
  private attemptKey = newIdempotencyKey();

  readonly isPlan = computed(() => this.product() === 'plan');

  readonly currencies = computed(() => {
    const set = new Set<string>();
    for (const p of this.catalog()?.providers ?? []) p.currencies.forEach(c => set.add(c));
    return [...set];
  });

  readonly availableProviders = computed(() =>
    (this.catalog()?.providers ?? []).filter(p => p.currencies.includes(this.currency())));

  readonly selectedProvider = computed<PaymentProviderOption | null>(() =>
    this.availableProviders().find(p => p.code === this.providerCode()) ?? null);

  readonly canAutoRenew = computed(() => this.isPlan() && this.selectedProvider()?.recurring === true);

  readonly canSubmit = computed(() =>
    this.state() === 'ready' && !this.submitting() && !this.quoting() && this.quote() !== null && this.selectedProvider() !== null);

  ngOnInit(): void {
    if (isNativeApp()) {
      this.state.set('native');
      return;
    }

    const q = this.route.snapshot.queryParamMap;
    const product = (q.get('product') ?? 'plan') as ProductQuery;
    if (!(product in PRODUCT_TYPES)) {
      this.state.set('invalid');
      return;
    }
    this.product.set(product);
    this.planTier.set(q.get('plan'));
    this.propertyId.set(q.get('propertyId'));
    const interval = q.get('interval');
    if (product === 'plan') {
      this.interval.set(interval === 'Yearly' ? 'Yearly' : 'Monthly');
      if (!this.planTier()) {
        this.state.set('invalid');
        return;
      }
    } else {
      this.interval.set('OneTime');
      if (!this.propertyId()) {
        this.state.set('invalid');
        return;
      }
    }

    this.api.catalog().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: catalog => {
        this.catalog.set(catalog);
        if (!catalog.enabled || catalog.providers.length === 0) {
          this.state.set('unavailable');
          return;
        }
        const wanted = (q.get('currency') ?? 'USD').toUpperCase();
        const currencies = this.currencies();
        this.currency.set(currencies.includes(wanted) ? wanted : (currencies[0] ?? 'USD'));
        this.pickDefaultProvider();
        this.state.set('ready');
        this.refreshQuote();
      },
      error: () => this.state.set('unavailable')
    });
  }

  money(amount: number | null | undefined, currency: string | null | undefined): string {
    return formatMoney(amount, currency, intlLocale(this.translate.currentLang));
  }

  setInterval(value: BillingInterval): void {
    if (this.interval() === value) return;
    this.interval.set(value);
    this.attemptKey = newIdempotencyKey();
    this.refreshQuote();
  }

  setCurrency(value: string): void {
    if (this.currency() === value) return;
    this.currency.set(value);
    this.attemptKey = newIdempotencyKey();
    this.pickDefaultProvider();
    this.refreshQuote();
  }

  private pickDefaultProvider(): void {
    const options = this.availableProviders();
    if (!options.some(p => p.code === this.providerCode())) this.providerCode.set(options[0]?.code ?? null);
  }

  private refreshQuote(): void {
    this.quoting.set(true);
    this.error.set(null);
    this.api.quote({
      productType: PRODUCT_TYPES[this.product()],
      planTier: this.planTier(),
      propertyId: this.propertyId(),
      interval: this.interval(),
      currencyCode: this.currency()
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: quote => { this.quote.set(quote); this.quoting.set(false); },
      error: err => { this.quote.set(null); this.quoting.set(false); this.error.set(this.errorKey(err)); }
    });
  }

  submit(): void {
    const provider = this.selectedProvider();
    const quote = this.quote();
    if (!this.canSubmit() || provider === null || quote === null) return;

    this.submitting.set(true);
    this.error.set(null);

    this.api.createOrder({
      productType: PRODUCT_TYPES[this.product()],
      planTier: this.planTier(),
      propertyId: this.propertyId(),
      interval: this.interval(),
      currencyCode: this.currency(),
      providerCode: provider.code,
      idempotencyKey: this.attemptKey,
      renewalConsent: this.canAutoRenew() && this.consent()
        ? { accepted: true, termsVersion: this.catalog()?.termsVersion ?? null }
        : null
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: order => {
        // Hand-off. The order page shows the real outcome after the customer returns; it never trusts the redirect itself.
        const target = order.checkoutUrl;
        if (target && /^https:\/\//i.test(target) && !this.isOwnOrigin(target)) {
          this.redirectExternal(target);
        } else if (target && this.isOwnOrigin(target)) {
          void this.router.navigateByUrl(new URL(target).pathname);
        } else {
          void this.router.navigate(['/payments/orders', order.id]);
        }
      },
      error: err => { this.submitting.set(false); this.error.set(this.errorKey(err)); }
    });
  }

  /** The one place that leaves the app for the provider's hosted page (a seam so tests never navigate the browser). */
  redirectExternal(url: string): void {
    window.location.assign(url);
  }

  private isOwnOrigin(url: string): boolean {
    try { return new URL(url, window.location.origin).origin === window.location.origin; } catch { return false; }
  }

  private errorKey(err: unknown): string {
    if (err instanceof HttpErrorResponse && err.status === 503) return 'PAYMENTS.ERRORS.UNAVAILABLE';
    return 'PAYMENTS.ERRORS.GENERIC';
  }
}
