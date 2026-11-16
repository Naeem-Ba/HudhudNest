// The payment services are thin transport. These tests pin the URLs and verbs (so a rename cannot silently break checkout) and
// the two rules that matter: the app never sends a price to the server, and there is no way to mark an order paid.
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { AdminPaymentsApiService } from './admin-payments-api.service';
import { PaymentsApiService } from './payments-api.service';

describe('PaymentsApiService', () => {
  const url = (path: string) => `${environment.apiUrl}${path}`;
  let api: PaymentsApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(PaymentsApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('asks the server for a quote and sends no amount', () => {
    api.quote({ productType: 'PlanSubscription', planTier: 'premium', interval: 'Monthly', currencyCode: 'USD' }).subscribe();
    const req = http.expectOne(url('/payments/quote'));
    expect(req.request.method).toBe('POST');
    expect(Object.keys(req.request.body)).not.toContain('amount');
    expect(Object.keys(req.request.body)).not.toContain('totalAmount');
    req.flush({});
  });

  it('creates an order with an idempotency key and the consent the customer gave', () => {
    api.createOrder({
      productType: 'PlanSubscription', planTier: 'basic', interval: 'Yearly', currencyCode: 'EUR', providerCode: 'test',
      idempotencyKey: 'key-123456', renewalConsent: { accepted: true, termsVersion: '2026-11-08' }
    }).subscribe();
    const req = http.expectOne(url('/payments/orders'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body.idempotencyKey).toBe('key-123456');
    expect(req.request.body.renewalConsent).toEqual({ accepted: true, termsVersion: '2026-11-08' });
    req.flush({});
  });

  it('uses the documented routes for orders, refunds, invoices and the subscription', () => {
    const calls: [() => unknown, string, string][] = [
      [() => api.order('o1'), 'GET', '/payments/orders/o1'],
      [() => api.cancelOrder('o1'), 'POST', '/payments/orders/o1/cancel'],
      [() => api.requestRefund('o1', 'because'), 'POST', '/payments/orders/o1/refund-request'],
      [() => api.myRefunds(), 'GET', '/payments/refunds'],
      [() => api.myInvoices(), 'GET', '/payments/invoices'],
      [() => api.invoice('i1'), 'GET', '/payments/invoices/i1'],
      [() => api.mySubscription(), 'GET', '/payments/subscription'],
      [() => api.cancelSubscription(), 'POST', '/payments/subscription/cancel'],
      [() => api.resumeSubscription(), 'POST', '/payments/subscription/resume'],
      [() => api.changeSubscription('basic'), 'POST', '/payments/subscription/change']
    ];
    for (const [call, method, path] of calls) {
      (call() as { subscribe: () => void }).subscribe();
      const req = http.expectOne(url(path));
      expect(req.request.method).toBe(method);
      req.flush(null);
    }
  });

  it('exposes no method that marks an order paid', () => {
    const names = [...Object.getOwnPropertyNames(Object.getPrototypeOf(api)), ...Object.getOwnPropertyNames(Object.getPrototypeOf(TestBed.inject(AdminPaymentsApiService)))];
    expect(names.filter(n => /markpaid|setpaid|forcepaid|markssucceeded|marksucceeded/i.test(n))).toEqual([]);
  });
});

describe('AdminPaymentsApiService', () => {
  const url = (path: string) => `${environment.apiUrl}${path}`;
  let api: AdminPaymentsApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(AdminPaymentsApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('re-checks an order with the provider instead of setting its state', () => {
    api.resync('o1').subscribe();
    const req = http.expectOne(url('/admin/payments/orders/o1/resync'));
    expect(req.request.method).toBe('POST');
    req.flush(null);
  });

  it('sends a provider update with its business approval note', () => {
    api.updateProvider('mollie', { isEnabled: true, currencies: null, countries: null, businessApprovalNote: 'approved by finance on 2026-11-08' }).subscribe();
    const req = http.expectOne(url('/admin/payments/providers/mollie'));
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.businessApprovalNote).toContain('approved');
    req.flush({});
  });

  it('decides refunds through the approve and reject routes', () => {
    api.approveRefund('r1', null).subscribe();
    http.expectOne(url('/admin/payments/refunds/r1/approve')).flush({});
    api.rejectRefund('r1', 'no').subscribe();
    http.expectOne(url('/admin/payments/refunds/r1/reject')).flush({});
  });
});
