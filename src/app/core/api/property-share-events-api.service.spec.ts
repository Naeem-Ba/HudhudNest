import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { PropertyShareEventsApiService } from './property-share-events-api.service';
import { SharePlatform } from '../sharing/share.model';
import { environment } from '../../../environments/environment';

describe('PropertyShareEventsApiService', () => {
  let service: PropertyShareEventsApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule]
    });

    service = TestBed.inject(PropertyShareEventsApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('POSTs to /properties/{id}/share-events with the platform in the body', () => {
    service.track('prop-1', SharePlatform.WhatsApp).subscribe();

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/properties/prop-1/share-events`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ platform: SharePlatform.WhatsApp });
    req.flush({ success: true, id: 'evt-1' });
  });

  it('includes flat utmSource/utmMedium/utmCampaign/utmContent fields when an attribution context is given', () => {
    service.track('prop-1', SharePlatform.Facebook, {
      source: 'facebook',
      medium: 'social',
      campaign: 'property_share',
      content: 'property_prop-1'
    }).subscribe();

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/properties/prop-1/share-events`);
    expect(req.request.body).toEqual({
      platform: SharePlatform.Facebook,
      utmSource: 'facebook',
      utmMedium: 'social',
      utmCampaign: 'property_share',
      utmContent: 'property_prop-1'
    });
    req.flush({ success: true, id: 'evt-1' });
  });

  it('omits UTM fields entirely when no attribution context is given (backward-compatible body)', () => {
    service.track('prop-1', SharePlatform.CopyLink, null).subscribe();

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/properties/prop-1/share-events`);
    expect(req.request.body).toEqual({ platform: SharePlatform.CopyLink });
    req.flush({ success: true, id: 'evt-1' });
  });
});
