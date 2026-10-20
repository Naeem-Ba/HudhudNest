import { TestBed } from '@angular/core/testing';

import { OverlayBackHandlerService } from './overlay-back-handler.service';

describe('OverlayBackHandlerService', () => {
  let service: OverlayBackHandlerService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(OverlayBackHandlerService);
  });

  it('closes the newest open overlay first', () => {
    const calls: string[] = [];
    service.register(() => {
      calls.push('older');
      return true;
    });
    service.register(() => {
      calls.push('newer');
      return true;
    });

    expect(service.closeTopOverlay()).toBeTrue();
    expect(calls).toEqual(['newer']);
  });

  it('does not throw when a handler unregisters others while Back is handled', () => {
    const unregisterOlder = service.register(() => true);
    const unregisterMiddle = service.register(() => false);
    service.register(() => {
      unregisterMiddle();
      unregisterOlder();
      return false;
    });

    expect(() => service.closeTopOverlay()).not.toThrow();
  });

  it('continues until a handler consumes the back action', () => {
    const calls: string[] = [];
    service.register(() => {
      calls.push('older');
      return true;
    });
    service.register(() => {
      calls.push('newer');
      return false;
    });

    expect(service.closeTopOverlay()).toBeTrue();
    expect(calls).toEqual(['newer', 'older']);
  });

  it('unregisters a handler cleanly', () => {
    const unregister = service.register(() => true);
    unregister();

    expect(service.closeTopOverlay()).toBeFalse();
  });
});
