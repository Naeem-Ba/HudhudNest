import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';

import { ProviderRequestDetailPage } from './provider-request-detail.page';
import { ServiceOfferingService } from '../../core/api/service-offering.service';
import { ServiceRequestService } from '../../core/api/service-request.service';
import { ServiceRequestDto, ServiceRequestStatus } from '../../core/models/service.model';

function request(status: ServiceRequestStatus, extra: Partial<ServiceRequestDto> = {}): ServiceRequestDto {
  return {
    id: 'r1', requestNumber: 'SR-1', propertyId: 'p1', propertyTitle: 'Flat', requesterId: 'u1', requesterName: 'Sara',
    serviceProviderId: 's1', serviceProviderDisplayName: 'Clean Co', serviceOfferingId: 'o1', serviceOfferingTitle: 'Deep clean',
    category: 'Cleaning', status, createdAt: '2026-10-10T09:00:00Z', ...extra
  };
}

describe('ProviderRequestDetailPage: done / not done', () => {
  let requests: jasmine.SpyObj<ServiceRequestService>;
  let offerings: jasmine.SpyObj<ServiceOfferingService>;

  function create(status: ServiceRequestStatus, extra: Partial<ServiceRequestDto> = {}) {
    requests.getById.and.returnValue(of(request(status, extra)));
    TestBed.configureTestingModule({
      imports: [ProviderRequestDetailPage, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: ServiceRequestService, useValue: requests },
        { provide: ServiceOfferingService, useValue: offerings },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'r1' } } } }
      ]
    });
    const fixture = TestBed.createComponent(ProviderRequestDetailPage);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    requests = jasmine.createSpyObj('ServiceRequestService', ['getById', 'getHistory', 'getDocuments', 'complete', 'markNotCompleted', 'reject', 'getMessages', 'sendMessage', 'markMessagesRead']);
    offerings = jasmine.createSpyObj('ServiceOfferingService', ['getById']);
    requests.getHistory.and.returnValue(of([]));
    requests.getDocuments.and.returnValue(of([]));
    requests.getMessages.and.returnValue(of([]));
    requests.markMessagesRead.and.returnValue(of(undefined));
    offerings.getById.and.returnValue(of({ currencyId: 1 } as never));
  });

  it('offers done and not done as soon as the request is accepted', () => {
    const el: HTMLElement = create('Accepted').nativeElement;

    expect(el.textContent).toContain('PROVIDER.DETAIL.MARK_DONE');
    expect(el.textContent).toContain('PROVIDER.DETAIL.MARK_NOT_DONE');
  });

  it('offers nothing to close while the request is still under review or already closed', () => {
    ['UnderReview', 'Completed', 'NotCompleted', 'Rejected'].forEach(status => {
      TestBed.resetTestingModule();
      const page = create(status as ServiceRequestStatus).componentInstance;
      expect(page.canClose()).withContext(status).toBeFalse();
    });
  });

  it('needs a reason for not done, and a note when the reason is Other', () => {
    const page = create('Accepted').componentInstance;
    page.openNotDoneForm();

    expect(page.canSubmitNotDone()).toBeFalse();
    page.notDoneReason.set('PriceNotAgreed');
    expect(page.canSubmitNotDone()).toBeTrue();
    page.notDoneReason.set('Other');
    expect(page.canSubmitNotDone()).toBeFalse();
    page.notDoneNote.set('The owner changed the scope.');
    expect(page.canSubmitNotDone()).toBeTrue();
  });

  it('sends not done with the reason and shows the new status', () => {
    requests.markNotCompleted.and.returnValue(of(request('NotCompleted', { outcomeReason: 'CustomerUnreachable' })));
    const page = create('Scheduled').componentInstance;
    page.openNotDoneForm();
    page.notDoneReason.set('CustomerUnreachable');
    page.notDoneNote.set('Phone off.');

    page.submitNotDone();

    expect(requests.markNotCompleted).toHaveBeenCalledOnceWith('r1', { reason: 'CustomerUnreachable', note: 'Phone off.' });
    expect(page.request()?.status).toBe('NotCompleted');
    expect(page.openForm()).toBeNull();
  });

  it('does not call the server for not done without a reason', () => {
    const page = create('Accepted').componentInstance;
    page.openNotDoneForm();

    page.submitNotDone();

    expect(requests.markNotCompleted).not.toHaveBeenCalled();
  });

  it('marks done straight from Accepted with the optional final price', () => {
    requests.complete.and.returnValue(of(request('Completed')));
    const page = create('Accepted').componentInstance;
    page.openDoneForm();
    page.finalPrice.set(120);

    page.submitComplete();

    expect(requests.complete).toHaveBeenCalledOnceWith('r1', { finalPrice: 120, finalPriceCurrencyId: 1 });
    expect(page.request()?.status).toBe('Completed');
  });

  it('never shows the customer’s feedback or contact to the provider', () => {
    const el: HTMLElement = create('NotCompleted', { outcomeReason: 'PriceNotAgreed' }).nativeElement;

    expect(el.textContent).toContain('SERVICE_OUTCOME.PROVIDER.PriceNotAgreed');
    expect(el.textContent).not.toContain('SERVICE_REQUESTS.MY_ANSWER');
    expect(el.querySelector('a[href^="tel:"]')).toBeNull();
  });

  it('sends the optional reason code with a rejection', () => {
    requests.reject.and.returnValue(of(request('Rejected')));
    const page = create('UnderReview').componentInstance;
    page.openRejectForm();
    page.rejectReason.set('Outside my area.');
    page.rejectReasonCode.set('OutsideCoverage');

    page.submitReject();

    expect(requests.reject).toHaveBeenCalledOnceWith('r1', 'Outside my area.', 'OutsideCoverage');
  });
  // ── inquiries (conversation stage) ──────────────────────────────────────

  it('shows only a decline action and the conversation for an inquiry, with no accept button', () => {
    const fixture = create('Inquiry', { messageCount: 1 });
    const el: HTMLElement = fixture.nativeElement;

    expect(fixture.componentInstance.action()).toBe('Reply');
    expect(el.textContent).toContain('PROVIDER.DETAIL.INQUIRY_HINT');
    expect(el.textContent).toContain('PROVIDER.DETAIL.REJECT');
    expect(el.textContent).not.toContain('PROVIDER.DETAIL.ACCEPT');
    expect(el.querySelector('app-service-conversation')).not.toBeNull();
    expect(requests.getMessages).toHaveBeenCalledWith('r1');
  });

  it('keeps the thread readable after the request closed if anything was written, and hides it otherwise', () => {
    expect((create('Completed', { messageCount: 3 }).nativeElement as HTMLElement).querySelector('app-service-conversation')).not.toBeNull();
    TestBed.resetTestingModule();
    expect((create('Completed', { messageCount: 0 }).nativeElement as HTMLElement).querySelector('app-service-conversation')).toBeNull();
  });

  it('gives an expired request no provider action', () => {
    const page = create('Expired', { messageCount: 2 }).componentInstance;

    expect(page.action()).toBe('None');
    expect(page.canClose()).toBeFalse();
  });
});
