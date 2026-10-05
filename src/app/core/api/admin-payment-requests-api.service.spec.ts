import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { AdminPaymentRequestsApiService } from './admin-payment-requests-api.service';

describe('AdminPaymentRequestsApiService', () => {
  let service: AdminPaymentRequestsApiService;
  let httpMock: HttpTestingController;
  const base = `${environment.apiBaseUrl}/admin/payment-requests`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AdminPaymentRequestsApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getPending: يحوّل الاستجابة ويتجاهل الصفوف بلا معرّف', () => {
    let result: unknown;
    service.getPending().subscribe(r => (result = r));

    httpMock.expectOne(base).flush({
      plans: [
        { requestId: 'p1', userId: 'u1', userName: 'Ali', email: 'a@x.de', tier: 'premium', priceUsd: 49, requestedAt: '2026-10-01T10:00:00Z' },
        { userName: 'no id' }
      ],
      featured: [
        { transactionId: 't1', propertyId: 'pr1', propertyTitle: 'Villa', ownerId: 'u2', ownerName: 'Sam', ownerEmail: null, amountUsd: 10, requestedAt: '2026-10-02T10:00:00Z' }
      ]
    });

    expect(result).toEqual({
      plans: [{ requestId: 'p1', userId: 'u1', userName: 'Ali', email: 'a@x.de', tier: 'premium', priceUsd: 49, requestedAt: '2026-10-01T10:00:00Z' }],
      featured: [{ transactionId: 't1', propertyId: 'pr1', propertyTitle: 'Villa', ownerId: 'u2', ownerName: 'Sam', ownerEmail: null, amountUsd: 10, requestedAt: '2026-10-02T10:00:00Z' }]
    });
  });

  it('getPending: استجابة فارغة ⇐ قائمتان فارغتان', () => {
    let result: unknown;
    service.getPending().subscribe(r => (result = r));
    httpMock.expectOne(base).flush(null);
    expect(result).toEqual({ plans: [], featured: [] });
  });

  it('approvePlan يرسل durationDays إلى مسار الطلب', () => {
    service.approvePlan('p1', 30).subscribe();
    const req = httpMock.expectOne(`${base}/plans/p1/approve`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ durationDays: 30, reason: null });
    req.flush({});
  });

  it('rejectPlan / approveFeatured / rejectFeatured: المسارات الصحيحة', () => {
    service.rejectPlan('p1', 'no payment').subscribe();
    service.approveFeatured('t1').subscribe();
    service.rejectFeatured('t1').subscribe();

    const reject = httpMock.expectOne(`${base}/plans/p1/reject`);
    expect(reject.request.body).toEqual({ reason: 'no payment' });
    const approve = httpMock.expectOne(`${base}/featured/t1/approve`);
    const rejectF = httpMock.expectOne(`${base}/featured/t1/reject`);
    expect(approve.request.method).toBe('POST');
    expect(rejectF.request.body).toEqual({ reason: null });
    [reject, approve, rejectF].forEach(r => r.flush({}));
  });
});
