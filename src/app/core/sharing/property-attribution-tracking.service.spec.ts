import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { PropertyAttributionTrackingService } from './property-attribution-tracking.service';
import { PropertyAttributionEventsApiService } from '../api/property-attribution-events-api.service';
import { AttributionContextService } from './attribution-context.service';
import { PropertyAttributionEventType } from './property-attribution-event.model';
import { AttributionContext } from './utm-attribution.model';

describe('PropertyAttributionTrackingService', () => {
  let service: PropertyAttributionTrackingService;
  let api: jasmine.SpyObj<PropertyAttributionEventsApiService>;
  let attributionContext: jasmine.SpyObj<AttributionContextService>;

  const context: AttributionContext = {
    source: 'facebook', medium: 'social', campaign: 'property_share', content: 'property_prop-1'
  };

  beforeEach(() => {
    api = jasmine.createSpyObj('PropertyAttributionEventsApiService', ['track']);
    attributionContext = jasmine.createSpyObj('AttributionContextService', ['getContext']);
    attributionContext.getContext.and.returnValue(context);

    TestBed.configureTestingModule({
      providers: [
        { provide: PropertyAttributionEventsApiService, useValue: api },
        { provide: AttributionContextService, useValue: attributionContext }
      ]
    });

    service = TestBed.inject(PropertyAttributionTrackingService);
  });

  it('trackView sends a View event with the current attribution context', () => {
    api.track.and.returnValue(of({ success: true, id: 'evt-1' }));

    service.trackView('prop-1');

    expect(api.track).toHaveBeenCalledWith('prop-1', PropertyAttributionEventType.View, context);
  });

  it('trackView does not fire a second time for the same property in the same session (de-duplication)', () => {
    api.track.and.returnValue(of({ success: true, id: 'evt-1' }));

    service.trackView('prop-1');
    service.trackView('prop-1');

    expect(api.track).toHaveBeenCalledTimes(1);
  });

  it('trackView for a different property still fires (de-duplication is per-property)', () => {
    api.track.and.returnValue(of({ success: true, id: 'evt-1' }));

    service.trackView('prop-1');
    service.trackView('prop-2');

    expect(api.track).toHaveBeenCalledTimes(2);
  });

  it('does nothing when propertyId is empty', () => {
    service.trackView('');
    service.trackPhoneClick('');
    expect(api.track).not.toHaveBeenCalled();
  });

  it('trackPhoneClick / trackWhatsAppClick / trackMessageSent / trackLead each fire their own event type and are NOT de-duplicated', () => {
    api.track.and.returnValue(of({ success: true, id: 'evt-1' }));

    service.trackPhoneClick('prop-1');
    service.trackPhoneClick('prop-1');
    service.trackWhatsAppClick('prop-1');
    service.trackMessageSent('prop-1');
    service.trackLead('prop-1');

    expect(api.track).toHaveBeenCalledWith('prop-1', PropertyAttributionEventType.PhoneClick, context);
    expect(api.track).toHaveBeenCalledWith('prop-1', PropertyAttributionEventType.WhatsAppClick, context);
    expect(api.track).toHaveBeenCalledWith('prop-1', PropertyAttributionEventType.MessageSent, context);
    expect(api.track).toHaveBeenCalledWith('prop-1', PropertyAttributionEventType.VisitRequestCreated, context);
    // Two distinct phone clicks are two real actions, not a duplicate — both must be sent.
    expect(api.track.calls.allArgs().filter(args => args[1] === PropertyAttributionEventType.PhoneClick).length).toBe(2);
  });

  it('sends no attribution context (direct visit) when none is currently stored', () => {
    attributionContext.getContext.and.returnValue(null);
    api.track.and.returnValue(of({ success: true, id: 'evt-1' }));

    service.trackLead('prop-1');

    expect(api.track).toHaveBeenCalledWith('prop-1', PropertyAttributionEventType.VisitRequestCreated, null);
  });

  it('swallows a tracking failure silently (never throws)', () => {
    api.track.and.returnValue(throwError(() => new Error('network down')));
    expect(() => service.trackView('prop-1')).not.toThrow();
  });
});
