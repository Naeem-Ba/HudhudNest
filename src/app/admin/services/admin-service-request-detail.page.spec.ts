import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';

import { AdminServiceRequestDetailPage } from './admin-service-request-detail.page';
import { AdminServiceRequestsService } from '../../core/api/admin-service-requests.service';
import { ServiceRequestService } from '../../core/api/service-request.service';
import { AdminServiceRequestDetailDto } from '../../core/models/admin-service-requests.model';
import { ServiceRequestDto } from '../../core/models/service.model';

function detail(request: Partial<ServiceRequestDto> = {}, extra: Partial<AdminServiceRequestDetailDto> = {}): AdminServiceRequestDetailDto {
  return {
    request: {
      id: 'r1', requestNumber: 'SR-1', propertyId: 'p1', propertyTitle: 'Flat', requesterId: 'u1', requesterName: 'Me',
      serviceProviderId: 's1', serviceProviderDisplayName: 'Clean Co', serviceOfferingId: 'o1', serviceOfferingTitle: 'Deep clean',
      category: 'Cleaning', status: 'Accepted', createdAt: '2026-10-10T09:00:00Z', ...request
    },
    history: [{ id: 'h1', toStatus: 'Accepted', createdAt: '2026-10-11T09:00:00Z' }],
    review: null,
    needsAttention: false,
    ...extra
  };
}

describe('AdminServiceRequestDetailPage', () => {
  let api: jasmine.SpyObj<AdminServiceRequestsService>;
  let requests: jasmine.SpyObj<ServiceRequestService>;

  function create(d: AdminServiceRequestDetailDto) {
    api.get.and.returnValue(of(d));
    TestBed.configureTestingModule({
      imports: [AdminServiceRequestDetailPage, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AdminServiceRequestsService, useValue: api },
        { provide: ServiceRequestService, useValue: requests },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'r1' } } } }
      ]
    });
    const fixture = TestBed.createComponent(AdminServiceRequestDetailPage);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    api = jasmine.createSpyObj('AdminServiceRequestsService', ['get', 'setOutcome', 'setReviewVisibility']);
    requests = jasmine.createSpyObj('ServiceRequestService', ['cancel']);
  });

  it('shows both sides of a disputed request and flags it', () => {
    const el: HTMLElement = create(detail({
      status: 'NotCompleted', outcomeReason: 'CustomerUnreachable', requesterAnswer: 'Disputed',
      requesterReason: 'ProviderDidNotContact', requesterFeedbackNote: 'Nobody called me.'
    }, { needsAttention: true })).nativeElement;

    expect(el.textContent).toContain('SERVICE_OUTCOME.PROVIDER.CustomerUnreachable');
    expect(el.textContent).toContain('SERVICE_OUTCOME.REQUESTER.ProviderDidNotContact');
    expect(el.textContent).toContain('Nobody called me.');
    expect(el.textContent).toContain('ADMIN_SERVICES.ATTENTION_DISPUTED');
  });

  it('offers outcome and cancel actions only while the request is open', () => {
    expect(create(detail({ status: 'Accepted' })).componentInstance.canSetOutcome()).toBeTrue();

    TestBed.resetTestingModule();
    const closed = create(detail({ status: 'Completed' })).componentInstance;
    expect(closed.canSetOutcome()).toBeFalse();
    expect(closed.canCancel()).toBeFalse();
  });

  it('requires an admin note, and a provider reason for "not done" (a note too when Other)', () => {
    const page = create(detail()).componentInstance;

    page.open('done');
    expect(page.canSubmit()).toBeFalse();
    page.adminNote = 'Provider confirmed by phone.';
    expect(page.canSubmit()).toBeTrue();

    page.open('notdone');
    page.adminNote = 'No answer for 10 days.';
    expect(page.canSubmit()).toBeFalse();
    page.outcomeReason = 'Other';
    expect(page.canSubmit()).toBeFalse();
    page.providerNote = 'Details';
    expect(page.canSubmit()).toBeTrue();
  });

  it('records "not done" with the chosen reason and swaps in the updated detail', () => {
    const updated = detail({ status: 'NotCompleted', outcomeReason: 'ProviderUnavailable' });
    api.setOutcome.and.returnValue(of(updated));
    const page = create(detail()).componentInstance;
    page.open('notdone');
    page.outcomeReason = 'ProviderUnavailable';
    page.adminNote = 'No answer.';

    page.submit();

    expect(api.setOutcome).toHaveBeenCalledOnceWith('r1', {
      completed: false, reason: 'ProviderUnavailable', providerNote: '', adminNote: 'No answer.'
    });
    expect(page.detail()?.request.status).toBe('NotCompleted');
    expect(page.action()).toBeNull();
  });

  it('records "done" without any provider reason', () => {
    api.setOutcome.and.returnValue(of(detail({ status: 'Completed' })));
    const page = create(detail()).componentInstance;
    page.open('done');
    page.adminNote = 'Confirmed.';

    page.submit();

    expect(api.setOutcome).toHaveBeenCalledOnceWith('r1', { completed: true, reason: null, providerNote: null, adminNote: 'Confirmed.' });
  });

  it('cancels through the existing cancel endpoint with the admin note as the reason', () => {
    requests.cancel.and.returnValue(of({} as ServiceRequestDto));
    const page = create(detail()).componentInstance;
    page.open('cancel');
    page.adminNote = 'Duplicate request.';

    page.submit();

    expect(requests.cancel).toHaveBeenCalledOnceWith('r1', 'Duplicate request.');
    expect(api.get).toHaveBeenCalledTimes(2); // reloaded after the change
  });

  it('hides and restores a review', () => {
    const review = { id: 'v1', serviceRequestId: 'r1', reviewerName: 'Me', rating: 1, comment: 'rude', isHidden: false, createdAt: '2026-10-12T09:00:00Z' };
    api.setReviewVisibility.and.returnValue(of({ ...review, isHidden: true }));
    const page = create(detail({ status: 'Reviewed' }, { review })).componentInstance;
    page.open('hide');
    page.adminNote = 'Abusive wording.';

    page.submit();
    expect(api.setReviewVisibility).toHaveBeenCalledWith('v1', true, 'Abusive wording.');

    page.restoreReview();
    expect(api.setReviewVisibility).toHaveBeenCalledWith('v1', false);
  });
  it('shows the whole conversation read-only, without a composer, and names who stayed silent on an expired request', () => {
    const el: HTMLElement = create(detail({ status: 'Expired', expiredWaitingOn: 'Provider' }, {
      messages: [
        { id: 'm1', serviceRequestId: 'r1', senderParty: 'Requester', senderName: 'Me', body: 'Price?', createdAt: '2026-10-10T10:00:00Z', isMine: false },
        { id: 'm2', serviceRequestId: 'r1', senderParty: 'Provider', senderName: 'Clean Co', body: '50 USD', createdAt: '2026-10-10T11:00:00Z', isMine: false }
      ]
    })).nativeElement;

    expect(el.querySelector('app-service-conversation')).not.toBeNull();
    expect(el.textContent).toContain('Price?');
    expect(el.textContent).toContain('50 USD');
    expect(el.querySelector('form.composer')).toBeNull();
    expect(el.textContent).toContain('ADMIN_SERVICES.EXPIRY.Provider');
  });

  it('lets the admin cancel an unconfirmed inquiry but not set an outcome on it', () => {
    const page = create(detail({ status: 'Inquiry' })).componentInstance;

    expect(page.canCancel()).toBeTrue();
    expect(page.canSetOutcome()).toBeFalse();
  });

  it('offers nothing to do on an expired request', () => {
    const page = create(detail({ status: 'Expired' })).componentInstance;

    expect(page.canCancel()).toBeFalse();
    expect(page.canSetOutcome()).toBeFalse();
  });
});
