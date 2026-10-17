import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

import { ServiceRequestService } from './service-request.service';

describe('ServiceRequestService: outcome tracking', () => {
  let service: ServiceRequestService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(ServiceRequestService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('reads the provider contact and the outcome fields from a request', () => {
    let phone: string | null | undefined;
    service.getById('r1').subscribe(r => {
      phone = r.providerContact?.phone;
      expect(r.status).toBe('NotCompleted');
      expect(r.outcomeReason).toBe('PriceNotAgreed');
      expect(r.requesterAnswer).toBe('Confirmed');
      expect(r.requesterReason).toBe('PriceTooHigh');
    });

    http.expectOne(r => r.url.endsWith('/ServiceRequests/r1')).flush({
      id: 'r1', status: 'NotCompleted', outcomeReason: 'PriceNotAgreed', requesterAnswer: 'Confirmed',
      requesterReason: 'PriceTooHigh', providerContact: { phone: '+963 11 000', email: null }
    });

    expect(phone).toBe('+963 11 000');
  });

  it('has no contact and no feedback when the server sends none', () => {
    service.getById('r1').subscribe(r => {
      expect(r.providerContact).toBeNull();
      expect(r.requesterAnswer).toBeNull();
      expect(r.outcomeReason).toBeNull();
    });

    http.expectOne(r => r.url.endsWith('/ServiceRequests/r1')).flush({ id: 'r1', status: 'UnderReview' });
  });

  it('marks a request as not completed with a reason and a trimmed note', () => {
    service.markNotCompleted('r1', { reason: 'CustomerUnreachable', note: '  phone off ' }).subscribe();

    const req = http.expectOne(r => r.url.endsWith('/ServiceRequests/r1/not-completed'));
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ Reason: 'CustomerUnreachable', Note: 'phone off' });
    req.flush({ id: 'r1', status: 'NotCompleted' });
  });

  it('sends the customer feedback with an empty note as null', () => {
    service.sendFeedback('r1', { answer: 'Disputed', reason: 'ProviderNoShow', note: '  ' }).subscribe();

    const req = http.expectOne(r => r.url.endsWith('/ServiceRequests/r1/feedback'));
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ Answer: 'Disputed', Reason: 'ProviderNoShow', Note: null });
    req.flush({ id: 'r1', status: 'NotCompleted' });
  });

  it('cancels with the customer reason and rejects with a reason code', () => {
    service.cancel('r1', null, 'ChangedMind').subscribe();
    const cancel = http.expectOne(r => r.url.endsWith('/ServiceRequests/r1/cancel'));
    expect(cancel.request.body).toEqual({ Reason: null, RequesterReason: 'ChangedMind' });
    cancel.flush({ id: 'r1' });

    service.reject('r2', ' no ', 'OutsideCoverage').subscribe();
    const reject = http.expectOne(r => r.url.endsWith('/ServiceRequests/r2/reject'));
    expect(reject.request.body).toEqual({ Reason: 'no', ReasonCode: 'OutsideCoverage' });
    reject.flush({ id: 'r2' });
  });
});
