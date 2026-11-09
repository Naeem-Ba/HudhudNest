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

describe('ServiceRequestService: conversation', () => {
  let service: ServiceRequestService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(ServiceRequestService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends the intent and the trimmed first message when creating', () => {
    service.create({ propertyId: 'p1', serviceOfferingId: 'o1', requesterNote: '  How much?  ', intent: 'Inquire' }).subscribe();

    const req = http.expectOne(r => r.method === 'POST' && r.url.endsWith('/ServiceRequests'));
    expect(req.request.body).toEqual({ PropertyId: 'p1', ServiceOfferingId: 'o1', RequesterNote: 'How much?', Intent: 'Inquire' });
    req.flush({ id: 'r1', status: 'Inquiry', intent: 'Inquire', messageCount: 1 });
  });

  it('sends a null intent for a legacy caller so the server confirms at once', () => {
    service.create({ propertyId: 'p1', serviceOfferingId: 'o1' }).subscribe();

    const req = http.expectOne(r => r.method === 'POST' && r.url.endsWith('/ServiceRequests'));
    expect(req.request.body.Intent).toBeNull();
    req.flush({ id: 'r1', status: 'UnderReview' });
  });

  it('reads the stage fields and message counters of a request', () => {
    service.getById('r1').subscribe(r => {
      expect(r.status).toBe('Expired');
      expect(r.intent).toBe('Request');
      expect(r.confirmedAt).toBe('2026-10-10T10:00:00Z');
      expect(r.expiredWaitingOn).toBe('Provider');
      expect(r.messageCount).toBe(4);
      expect(r.unreadMessageCount).toBe(1);
    });

    http.expectOne(r => r.url.endsWith('/ServiceRequests/r1')).flush({
      id: 'r1', status: 'Expired', intent: 'Request', confirmedAt: '2026-10-10T10:00:00Z', expiredWaitingOn: 'Provider',
      messageCount: 4, unreadMessageCount: 1, lastMessageAt: '2026-10-11T10:00:00Z'
    });
  });

  it('loads the thread, trims what it sends and marks the other side\'s messages read', () => {
    let bodies: string[] = [];
    service.getMessages('r1').subscribe(items => { bodies = items.map(i => i.body); expect(items[0].isMine).toBeTrue(); });
    http.expectOne(r => r.method === 'GET' && r.url.endsWith('/ServiceRequests/r1/messages')).flush([
      { id: 'm1', serviceRequestId: 'r1', senderParty: 'Requester', senderName: 'Me', body: 'Hi', createdAt: 'x', isMine: true }
    ]);
    expect(bodies).toEqual(['Hi']);

    service.sendMessage('r1', '  Price?  ').subscribe(m => expect(m.senderParty).toBe('Requester'));
    const send = http.expectOne(r => r.method === 'POST' && r.url.endsWith('/ServiceRequests/r1/messages'));
    expect(send.request.body).toEqual({ Body: 'Price?' });
    send.flush({ id: 'm2', serviceRequestId: 'r1', senderParty: 'Requester', senderName: 'Me', body: 'Price?', createdAt: 'x', isMine: true });

    service.markMessagesRead('r1').subscribe();
    http.expectOne(r => r.method === 'PUT' && r.url.endsWith('/ServiceRequests/r1/messages/read')).flush(null);
  });

  it('confirms an inquiry with PUT confirm', () => {
    service.confirm('r1').subscribe(r => expect(r.status).toBe('UnderReview'));
    http.expectOne(r => r.method === 'PUT' && r.url.endsWith('/ServiceRequests/r1/confirm')).flush({ id: 'r1', status: 'UnderReview' });
  });
});
