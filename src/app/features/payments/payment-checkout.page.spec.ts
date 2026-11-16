import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';

import { PaymentsApiService } from '../../core/api/payments-api.service';
import { PaymentCatalog, PaymentOrder, PaymentQuote } from '../../core/models/payments.model';
import { PaymentCheckoutPage } from './payment-checkout.page';

const CATALOG: PaymentCatalog = {
  enabled: true,
  termsVersion: '2026-11-08',
  refundRequestWindowDays: 14,
  providers: [
    { code: 'test', displayName: 'Sandbox', isSandbox: true, hostedCheckout: true, cards: false, wallets: false, qrCode: false, recurring: true, currencies: ['USD', 'EUR'] },
    { code: 'eur-only', displayName: 'EUR provider', isSandbox: false, hostedCheckout: true, cards: true, wallets: false, qrCode: false, recurring: false, currencies: ['EUR'] }
  ]
};

const QUOTE: PaymentQuote = {
  productType: 'PlanSubscription', productCode: 'premium', propertyId: null, description: 'Premium plan', interval: 'Monthly', currencyCode: 'USD',
  unitAmount: 99, discountAmount: 0, taxRatePercent: 0, taxAmount: 0, totalAmount: 99, totalAmountUsd: 99, exchangeRateToUsd: 1, priceSource: 'plan', pricesIncludeTax: false
};

const ORDER = { id: 'order-1', checkoutUrl: 'https://pay.example.com/c/123' } as PaymentOrder;

describe('PaymentCheckoutPage', () => {
  let api: jasmine.SpyObj<PaymentsApiService>;
  let router: Router;
  let redirect: jasmine.Spy;

  function create(query: Record<string, string>, catalog: PaymentCatalog = CATALOG): PaymentCheckoutPage {
    api = jasmine.createSpyObj('PaymentsApiService', ['catalog', 'quote', 'createOrder']);
    api.catalog.and.returnValue(of(catalog));
    api.quote.and.returnValue(of(QUOTE));
    api.createOrder.and.returnValue(of(ORDER));

    TestBed.configureTestingModule({
      imports: [PaymentCheckoutPage, TranslateModule.forRoot()],
      providers: [
        { provide: PaymentsApiService, useValue: api },
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } }
      ]
    });
    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    spyOn(router, 'navigateByUrl').and.resolveTo(true);
    const fixture = TestBed.createComponent(PaymentCheckoutPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    redirect = spyOn(page, 'redirectExternal');
    return page;
  }

  afterEach(() => (Capacitor.isNativePlatform as jasmine.Spy | undefined)?.and?.callThrough?.());

  it('shows the quote the server produced and never computes a price itself', () => {
    const page = create({ product: 'plan', plan: 'premium' });
    expect(page.state()).toBe('ready');
    expect(api.quote).toHaveBeenCalledWith(jasmine.objectContaining({ productType: 'PlanSubscription', planTier: 'premium', interval: 'Monthly', currencyCode: 'USD' }));
    expect(page.quote()?.totalAmount).toBe(99);
  });

  it('offers only the providers that support the chosen currency', () => {
    const page = create({ product: 'plan', plan: 'premium' });
    expect(page.availableProviders().map(p => p.code)).toEqual(['test']);
    page.setCurrency('EUR');
    expect(page.availableProviders().map(p => p.code)).toEqual(['test', 'eur-only']);
  });

  it('asks for renewal consent only for a plan on a provider that can renew, and sends it with the current terms version', () => {
    const page = create({ product: 'plan', plan: 'premium' });
    expect(page.canAutoRenew()).toBeTrue();
    page.consent.set(true);
    page.submit();
    expect(api.createOrder).toHaveBeenCalledWith(jasmine.objectContaining({
      providerCode: 'test', renewalConsent: { accepted: true, termsVersion: '2026-11-08' }
    }));
  });

  it('hands over to the provider\'s hosted page only after the server created the order', () => {
    const page = create({ product: 'plan', plan: 'premium' });
    expect(redirect).not.toHaveBeenCalled();
    page.submit();
    expect(redirect).toHaveBeenCalledWith('https://pay.example.com/c/123');
  });

  it('never follows a non-https checkout URL', () => {
    const page = create({ product: 'plan', plan: 'premium' });
    api.createOrder.and.returnValue(of({ id: 'order-2', checkoutUrl: 'javascript:alert(1)' } as PaymentOrder));
    page.submit();
    expect(redirect).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/payments/orders', 'order-2']);
  });

  it('sends no consent when the box is not ticked', () => {
    const page = create({ product: 'plan', plan: 'premium' });
    page.submit();
    expect(api.createOrder.calls.mostRecent().args[0].renewalConsent).toBeNull();
  });

  it('does not offer renewal for a one-off listing fee', () => {
    const page = create({ product: 'featured', propertyId: 'p1' });
    expect(page.interval()).toBe('OneTime');
    expect(page.canAutoRenew()).toBeFalse();
  });

  it('reuses one idempotency key for retries and changes it when the purchase changes', () => {
    const page = create({ product: 'plan', plan: 'premium' });
    page.submit();
    const first = api.createOrder.calls.mostRecent().args[0].idempotencyKey;
    page.submitting.set(false);
    page.submit();
    expect(api.createOrder.calls.mostRecent().args[0].idempotencyKey).toBe(first);
    page.setInterval('Yearly');
    page.submitting.set(false);
    page.submit();
    expect(api.createOrder.calls.mostRecent().args[0].idempotencyKey).not.toBe(first);
  });

  it('blocks a double submit while the order is being created', () => {
    const page = create({ product: 'plan', plan: 'premium' });
    page.submitting.set(true);
    page.submit();
    expect(api.createOrder).not.toHaveBeenCalled();
  });

  it('reports a provider outage without claiming anything was charged or paid', () => {
    const page = create({ product: 'plan', plan: 'premium' });
    api.createOrder.and.returnValue(throwError(() => ({ status: 503 })));
    page.submit();
    expect(page.submitting()).toBeFalse();
    expect(page.error()).toBeTruthy();
  });

  it('shows "unavailable" when payments are switched off', () => {
    const page = create({ product: 'plan', plan: 'premium' }, { ...CATALOG, enabled: false, providers: [] });
    expect(page.state()).toBe('unavailable');
    expect(api.quote).not.toHaveBeenCalled();
  });

  it('rejects an incomplete link', () => {
    expect(create({ product: 'plan' }).state()).toBe('invalid');
  });

  it('offers no purchase inside the installed app (store billing rules)', () => {
    spyOn(Capacitor, 'isNativePlatform').and.returnValue(true);
    const page = create({ product: 'plan', plan: 'premium' });
    expect(page.state()).toBe('native');
    expect(api.catalog).not.toHaveBeenCalled();
  });
});
