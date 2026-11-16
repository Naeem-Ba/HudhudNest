import { fakeAsync, TestBed, tick, discardPeriodicTasks } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';

import { PaymentsApiService } from '../../core/api/payments-api.service';
import { PaymentOrder } from '../../core/models/payments.model';
import { PaymentOrderPage } from './payment-order.page';

function order(patch: Partial<PaymentOrder>): PaymentOrder {
  return {
    id: 'o1', orderNumber: 'HN-20261108-AAAA2222', status: 'Pending', productType: 'PlanSubscription', productCode: 'basic', propertyId: null,
    description: 'Basic plan', interval: 'Monthly', currencyCode: 'USD', unitAmount: 20, discountAmount: 0, taxRatePercent: 0, taxAmount: 0,
    totalAmount: 20, refundedAmount: 0, providerCode: 'test', checkoutUrl: null, createdAt: '2026-11-08T10:00:00Z', expiresAt: '2026-11-08T11:00:00Z',
    paidAt: null, failureCode: null, entitlementStatus: null, entitlementFailureReason: null, isRenewal: false, invoiceId: null,
    canCancel: true, canRequestRefund: false, isSandbox: true, ...patch
  };
}

describe('PaymentOrderPage', () => {
  let api: jasmine.SpyObj<PaymentsApiService>;

  function create(first: PaymentOrder, query: Record<string, string> = { result: 'return' }): PaymentOrderPage {
    api = jasmine.createSpyObj('PaymentsApiService', ['order', 'cancelOrder', 'requestRefund']);
    api.order.and.returnValue(of(first));
    TestBed.configureTestingModule({
      imports: [PaymentOrderPage, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: PaymentsApiService, useValue: api },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'o1' }), queryParamMap: convertToParamMap(query) } } }
      ]
    });
    const fixture = TestBed.createComponent(PaymentOrderPage);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('never treats the return URL as proof of payment: an open order shows "waiting", not "paid"', fakeAsync(() => {
    const page = create(order({ status: 'Pending' }), { result: 'return' });
    expect(page.view()).toBe('pending');
    discardPeriodicTasks();
    tick(200000);
  }));

  it('shows success only for a Succeeded order whose benefit was delivered', fakeAsync(() => {
    expect(create(order({ status: 'Succeeded', paidAt: '2026-11-08T10:05:00Z', entitlementStatus: 'Granted' })).view()).toBe('success');
    tick(200000);
  }));

  it('says "activating" while the benefit is still being delivered', fakeAsync(() => {
    expect(create(order({ status: 'Succeeded', entitlementStatus: 'Pending' })).view()).toBe('delivering');
    discardPeriodicTasks();
    tick(200000);
  }));

  it('tells the customer when they paid but delivery failed', fakeAsync(() => {
    expect(create(order({ status: 'Succeeded', entitlementStatus: 'Failed' })).view()).toBe('delivery-failed');
    tick(200000);
  }));

  it('maps the final unsuccessful states', fakeAsync(() => {
    expect(create(order({ status: 'Failed' })).view()).toBe('failed');
    TestBed.resetTestingModule();
    expect(create(order({ status: 'Cancelled' }), {}).view()).toBe('cancelled');
    TestBed.resetTestingModule();
    expect(create(order({ status: 'Expired' }), {}).view()).toBe('expired');
    tick(200000);
  }));

  it('polls an open order and picks up the provider-confirmed result', fakeAsync(() => {
    const page = create(order({ status: 'Pending' }));
    api.order.and.returnValue(of(order({ status: 'Succeeded', paidAt: '2026-11-08T10:05:00Z', entitlementStatus: 'Granted' })));
    tick(3100);
    expect(page.view()).toBe('success');
    tick(200000);
  }));
});
