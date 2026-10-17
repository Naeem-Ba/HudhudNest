import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';

import { MyServiceRequestsPage } from './my-service-requests.page';
import { PropertyApiService } from '../../core/api/property-api.service';
import { ServiceOfferingService } from '../../core/api/service-offering.service';
import { ServiceRequestService } from '../../core/api/service-request.service';
import { AuthService } from '../../core/auth/auth.service';
import { Property } from '../../core/models/property.model';
import { ServiceRequestDto } from '../../core/models/service.model';

const request: ServiceRequestDto = {
  id: 'r1', requestNumber: 'SR-1', propertyId: 'p1', propertyTitle: 'Flat in Mezzeh', requesterId: 'u1',
  requesterName: 'Me', serviceProviderId: 's1', serviceProviderDisplayName: 'Clean Co', serviceOfferingId: 'o1',
  serviceOfferingTitle: 'Deep clean', category: 'Cleaning', status: 'UnderReview',
  createdAt: '2026-10-10T09:00:00Z', updatedAt: '2026-10-12T09:00:00Z'
};

describe('MyServiceRequestsPage', () => {
  let requests: jasmine.SpyObj<ServiceRequestService>;
  let offerings: jasmine.SpyObj<ServiceOfferingService>;
  let properties: jasmine.SpyObj<PropertyApiService>;

  function create() {
    TestBed.configureTestingModule({
      imports: [MyServiceRequestsPage, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: ServiceRequestService, useValue: requests },
        { provide: ServiceOfferingService, useValue: offerings },
        { provide: PropertyApiService, useValue: properties },
        { provide: AuthService, useValue: { getCurrentUserId: () => 'u1' } }
      ]
    });
    const fixture = TestBed.createComponent(MyServiceRequestsPage);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    requests = jasmine.createSpyObj('ServiceRequestService', ['getMine', 'cancel', 'addReview', 'create', 'sendFeedback']);
    offerings = jasmine.createSpyObj('ServiceOfferingService', ['getAvailability']);
    properties = jasmine.createSpyObj('PropertyApiService', ['getMyProperties']);
    requests.getMine.and.returnValue(of([request]));
    offerings.getAvailability.and.returnValue(of([
      { category: 'Cleaning', offeringCount: 2 },
      { category: 'Legal', offeringCount: 0 }
    ]));
    properties.getMyProperties.and.returnValue(of([
      { id: 'p1', title: 'Flat in Mezzeh', city: 'Damascus', isPublished: true } as Property,
      { id: 'p2', title: 'Unpublished draft', city: 'Aleppo', isPublished: false } as Property
    ]));
  });

  it('no longer carries the become-a-provider banner; it keeps a small secondary join link', () => {
    const el: HTMLElement = create().nativeElement;

    expect(el.querySelector('.become-provider-banner')).toBeNull();
    expect(el.querySelector('a[href*="kontakt"]')).toBeNull();
    expect(el.querySelector('.join-link a[href="/services/join"]')).not.toBeNull();
  });

  it('shows the request with its property, provider, dates and last update', () => {
    const text = create().nativeElement.textContent as string;

    expect(text).toContain('Flat in Mezzeh');
    expect(text).toContain('Clean Co');
    expect(text).toContain('SERVICE_REQUESTS.UPDATED_AT');
  });

  it('lists categories from availability and disables the ones without offers', () => {
    const cards = Array.from(create().nativeElement.querySelectorAll('.category-card')) as HTMLButtonElement[];

    expect(cards.length).toBe(2);
    expect(cards[0].disabled).toBeFalse();
    expect(cards[1].disabled).toBeTrue();
  });

  it('choosing a category and a property only navigates; it never creates a request', () => {
    const fixture = create();
    const router = TestBed.inject(Router);
    const navigate = spyOn(router, 'navigate').and.resolveTo(true);
    const page = fixture.componentInstance;

    page.chooseCategory({ category: 'Legal', offeringCount: 0 });
    expect(page.discoverCategory()).toBeNull();

    page.chooseCategory({ category: 'Cleaning', offeringCount: 2 });
    fixture.detectChanges();
    expect(page.requestableProperties().map(p => p.id)).toEqual(['p1']);

    page.chooseProperty(page.requestableProperties()[0]);

    expect(navigate).toHaveBeenCalledOnceWith(['/properties', 'p1'], { queryParams: { service: 'Cleaning' } });
    expect(requests.create).not.toHaveBeenCalled();
  });

  // ── provider contact and the customer's answer ────────────────────────────

  it('shows the provider contact only when the server sent it', () => {
    requests.getMine.and.returnValue(of([{ ...request, providerContact: { phone: '+963 11 555', email: 'p@example.test' } }]));

    const el: HTMLElement = create().nativeElement;

    expect(el.querySelector('.contact-card a[href="tel:+963 11 555"]')).not.toBeNull();
    expect(el.querySelector('.contact-card a[href="mailto:p@example.test"]')).not.toBeNull();
  });

  it('says the provider has no contact yet while the request is alive, and nothing once it ended', () => {
    const alive: HTMLElement = create().nativeElement;
    expect(alive.querySelector('.contact-card')).toBeNull();
    expect(alive.querySelector('.contact-missing')).not.toBeNull();

    TestBed.resetTestingModule();
    requests.getMine.and.returnValue(of([{ ...request, status: 'Rejected' }]));
    const ended: HTMLElement = create().nativeElement;
    expect(ended.querySelector('.contact-card')).toBeNull();
    expect(ended.querySelector('.contact-missing')).toBeNull();
  });

  it('asks the customer to answer once the provider closed the request', () => {
    requests.getMine.and.returnValue(of([{ ...request, status: 'NotCompleted', outcomeReason: 'PriceNotAgreed' }]));
    const fixture = create();
    const page = fixture.componentInstance;

    expect(page.canAnswer(page.requests()[0])).toBeTrue();
    expect(fixture.nativeElement.querySelector('.feedback-prompt')).not.toBeNull();
  });

  it('needs a reason when the service did not happen, and a note when the reason is Other', () => {
    requests.getMine.and.returnValue(of([{ ...request, status: 'NotCompleted' }]));
    const page = create().componentInstance;
    const item = page.requests()[0];
    page.openFeedbackForm(item);

    expect(page.canSubmitFeedback(item)).toBeFalse();
    page.feedbackReason.set('PriceTooHigh');
    expect(page.canSubmitFeedback(item)).toBeTrue();
    page.feedbackReason.set('Other');
    expect(page.canSubmitFeedback(item)).toBeFalse();
    page.feedbackNote.set('details');
    expect(page.canSubmitFeedback(item)).toBeTrue();
  });

  it('confirming a completed service needs no reason; disputing it does', () => {
    requests.getMine.and.returnValue(of([{ ...request, status: 'Completed' }]));
    const page = create().componentInstance;
    const item = page.requests()[0];
    page.openFeedbackForm(item);

    expect(page.canSubmitFeedback(item)).toBeTrue();
    page.feedbackAnswer.set('Disputed');
    expect(page.canSubmitFeedback(item)).toBeFalse();
    page.feedbackReason.set('ServiceNotAsDescribed');
    expect(page.canSubmitFeedback(item)).toBeTrue();
  });

  it('sends the answer and swaps in the updated request', () => {
    requests.getMine.and.returnValue(of([{ ...request, status: 'NotCompleted' }]));
    requests.sendFeedback.and.returnValue(of({ ...request, status: 'NotCompleted', requesterAnswer: 'Confirmed', requesterReason: 'ProviderNoShow' }));
    const fixture = create();
    const page = fixture.componentInstance;
    const item = page.requests()[0];
    page.openFeedbackForm(item);
    page.feedbackReason.set('ProviderNoShow');

    page.submitFeedback(item);

    expect(requests.sendFeedback).toHaveBeenCalledOnceWith('r1', { answer: 'Confirmed', reason: 'ProviderNoShow', note: null });
    expect(page.requests()[0].requesterAnswer).toBe('Confirmed');
    expect(page.feedbackId()).toBeNull();
    expect(page.canAnswer(page.requests()[0])).toBeFalse();
  });

  it('does not send a reason when confirming a completed service', () => {
    requests.getMine.and.returnValue(of([{ ...request, status: 'Completed' }]));
    requests.sendFeedback.and.returnValue(of({ ...request, status: 'Completed', requesterAnswer: 'Confirmed' }));
    const page = create().componentInstance;
    const item = page.requests()[0];
    page.openFeedbackForm(item);
    page.feedbackReason.set('PriceTooHigh'); // left over from a previous choice

    page.submitFeedback(item);

    expect(requests.sendFeedback).toHaveBeenCalledOnceWith('r1', { answer: 'Confirmed', reason: null, note: null });
  });

  it('cancels with the reason the customer picked', () => {
    requests.cancel.and.returnValue(of({ ...request, status: 'Cancelled' }));
    const page = create().componentInstance;
    const item = page.requests()[0];
    page.openCancelForm(item);
    page.cancelReason.set('FoundOtherProvider');

    page.cancel(item);

    expect(requests.cancel).toHaveBeenCalledOnceWith('r1', null, 'FoundOtherProvider');
    expect(page.requests()[0].status).toBe('Cancelled');
    expect(page.cancelingId()).toBeNull();
  });

  it('cancels without a reason when none was picked', () => {
    requests.cancel.and.returnValue(of({ ...request, status: 'Cancelled' }));
    const page = create().componentInstance;
    const item = page.requests()[0];
    page.openCancelForm(item);

    page.cancel(item);

    expect(requests.cancel).toHaveBeenCalledOnceWith('r1', null, null);
  });
});
