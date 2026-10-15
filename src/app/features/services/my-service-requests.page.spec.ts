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
    requests = jasmine.createSpyObj('ServiceRequestService', ['getMine', 'cancel', 'addReview', 'create']);
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
});
