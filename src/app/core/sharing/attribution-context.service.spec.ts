import { TestBed } from '@angular/core/testing';
import { AttributionContextService } from './attribution-context.service';
import { environment } from '../../../environments/environment';

const ATTRIBUTED_URL =
  'https://realestateworld.world/properties/p1?utm_source=facebook&utm_medium=social&utm_campaign=property_share&utm_content=property_p1';

describe('AttributionContextService', () => {
  let service: AttributionContextService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AttributionContextService);
    (environment as { siteUrl: string }).siteUrl = 'https://realestateworld.world';
    service.clear();
  });

  afterEach(() => service.clear());

  it('has no attribution before anything is captured', () => {
    expect(service.getContext()).toBeNull();
    expect(service.getFirstTouchContext()).toBeNull();
  });

  it('captures a valid attributed URL as the current context', () => {
    service.captureFromUrl(ATTRIBUTED_URL);

    expect(service.getContext()).toEqual({
      source: 'facebook',
      medium: 'social',
      campaign: 'property_share',
      content: 'property_p1'
    });
  });

  it('sets first-touch and last-touch to the same value on the very first capture', () => {
    service.captureFromUrl(ATTRIBUTED_URL);

    expect(service.getFirstTouchContext()).toEqual(service.getContext());
  });

  it('a direct visit (no utm_source) never overwrites existing attribution', () => {
    service.captureFromUrl(ATTRIBUTED_URL);
    service.captureFromUrl('https://realestateworld.world/properties/p1');

    expect(service.getContext()?.source).toBe('facebook');
  });

  it('updates last-touch (but keeps first-touch) on a second, different valid attribution', () => {
    service.captureFromUrl(ATTRIBUTED_URL);
    service.captureFromUrl('https://realestateworld.world/properties/p2?utm_source=whatsapp');

    expect(service.getFirstTouchContext()?.source).toBe('facebook');
    expect(service.getContext()?.source).toBe('whatsapp');
  });

  it('ignores an invalid utm_source and leaves stored attribution untouched', () => {
    service.captureFromUrl(ATTRIBUTED_URL);
    service.captureFromUrl('https://realestateworld.world/properties/p2?utm_source=%3Cscript%3E');

    expect(service.getContext()?.source).toBe('facebook');
  });

  it('treats attribution as expired once the configured window has elapsed', () => {
    const realNow = Date.now;
    try {
      spyOn(Date, 'now').and.callFake(() => realNow());
      service.captureFromUrl(ATTRIBUTED_URL);
      expect(service.getContext()).not.toBeNull();

      // 31 days later — past the documented 30-day attribution window.
      const thirtyOneDaysMs = 31 * 24 * 60 * 60 * 1000;
      (Date.now as jasmine.Spy).and.callFake(() => realNow() + thirtyOneDaysMs);

      expect(service.getContext()).toBeNull();
    } finally {
      (Date.now as jasmine.Spy).and.callFake(() => realNow());
    }
  });

  it('stripUtmParamsFromVisibleUrl removes only utm_* params via history.replaceState', () => {
    // window.location itself cannot be safely stubbed in a real browser (non-configurable) —
    // pushState is the realistic way to put utm_* params on the visible URL under test.
    const originalUrl = window.location.href;
    history.pushState({}, '', '/properties/p1?ref=abc&utm_source=facebook&utm_campaign=property_share');

    try {
      service.stripUtmParamsFromVisibleUrl();

      expect(window.location.href).toContain('ref=abc');
      expect(window.location.href).not.toContain('utm_source');
      expect(window.location.href).not.toContain('utm_campaign');
    } finally {
      history.pushState({}, '', originalUrl);
    }
  });

  it('stripUtmParamsFromVisibleUrl does nothing when there are no utm_* params', () => {
    const originalUrl = window.location.href;
    history.pushState({}, '', '/properties/p1?ref=abc');
    const replaceStateSpy = spyOn(window.history, 'replaceState').and.callThrough();

    try {
      service.stripUtmParamsFromVisibleUrl();
      expect(replaceStateSpy).not.toHaveBeenCalled();
    } finally {
      history.pushState({}, '', originalUrl);
    }
  });

  it('clear() removes stored attribution entirely', () => {
    service.captureFromUrl(ATTRIBUTED_URL);
    service.clear();
    expect(service.getContext()).toBeNull();
  });
});
