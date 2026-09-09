import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { PropertyShareTrackingService } from './property-share-tracking.service';
import { PropertyShareEventsApiService } from '../api/property-share-events-api.service';
import { SharePlatform } from './share.model';

describe('PropertyShareTrackingService', () => {
  let service: PropertyShareTrackingService;
  let api: jasmine.SpyObj<PropertyShareEventsApiService>;

  beforeEach(() => {
    api = jasmine.createSpyObj('PropertyShareEventsApiService', ['track']);

    TestBed.configureTestingModule({
      providers: [{ provide: PropertyShareEventsApiService, useValue: api }]
    });

    service = TestBed.inject(PropertyShareTrackingService);
  });

  it('calls the API with the property id and platform on a successful share', () => {
    api.track.and.returnValue(of({ success: true, id: 'evt-1' }));

    service.recordSuccess('prop-1', SharePlatform.WhatsApp);

    expect(api.track).toHaveBeenCalledWith('prop-1', SharePlatform.WhatsApp, undefined);
  });

  it('forwards an attribution context through to the API untouched', () => {
    api.track.and.returnValue(of({ success: true, id: 'evt-1' }));
    const context = { source: 'whatsapp', medium: 'social', campaign: 'property_share', content: 'property_prop-1' };

    service.recordSuccess('prop-1', SharePlatform.WhatsApp, context);

    expect(api.track).toHaveBeenCalledWith('prop-1', SharePlatform.WhatsApp, context);
  });

  it('does nothing when propertyId is empty', () => {
    service.recordSuccess('', SharePlatform.CopyLink);
    expect(api.track).not.toHaveBeenCalled();
  });

  it('swallows a tracking failure silently (never throws, never rejects the caller)', () => {
    api.track.and.returnValue(throwError(() => new Error('network down')));

    expect(() => service.recordSuccess('prop-1', SharePlatform.Facebook)).not.toThrow();
  });
});
