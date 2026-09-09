import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { PropertyAttributionEventsApiService } from './property-attribution-events-api.service';
import { PropertyAttributionEventType } from '../sharing/property-attribution-event.model';
import { environment } from '../../../environments/environment';

describe('PropertyAttributionEventsApiService', () => {
  let service: PropertyAttributionEventsApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(PropertyAttributionEventsApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('POSTs to /properties/{id}/attribution-events with just the eventType when there is no attribution context', () => {
    service.track('prop-1', PropertyAttributionEventType.View).subscribe();

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/properties/prop-1/attribution-events`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ eventType: PropertyAttributionEventType.View });
    req.flush({ success: true, id: 'evt-1' });
  });

  it('includes flat utm* fields when an attribution context is given', () => {
    service.track('prop-1', PropertyAttributionEventType.VisitRequestCreated, {
      source: 'facebook',
      medium: 'social',
      campaign: 'property_share',
      content: 'property_prop-1'
    }).subscribe();

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/properties/prop-1/attribution-events`);
    expect(req.request.body).toEqual({
      eventType: PropertyAttributionEventType.VisitRequestCreated,
      utmSource: 'facebook',
      utmMedium: 'social',
      utmCampaign: 'property_share',
      utmContent: 'property_prop-1'
    });
    req.flush({ success: true, id: 'evt-1' });
  });
});
