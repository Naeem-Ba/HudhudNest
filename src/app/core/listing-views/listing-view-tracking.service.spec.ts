import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { DOCUMENT } from '@angular/common';
import { of, throwError } from 'rxjs';

import { ListingViewsApiService } from '../api/listing-views-api.service';
import { REPEAT_WINDOW_MS, ListingViewTrackingService } from './listing-view-tracking.service';

describe('ListingViewTrackingService', () => {
  let api: jasmine.SpyObj<ListingViewsApiService>;
  let service: ListingViewTrackingService;
  let fakeDoc: { visibilityState: string } & Partial<Document>;

  function setup(visibility: 'visible' | 'hidden' = 'visible'): void {
    api = jasmine.createSpyObj('ListingViewsApiService', ['record']);
    api.record.and.returnValue(of({ counted: true, viewCount: 9 }));
    fakeDoc = Object.assign(document.createElement('div') as unknown as Document, { visibilityState: visibility }) as never;
    TestBed.configureTestingModule({
      providers: [
        { provide: ListingViewsApiService, useValue: api },
        { provide: DOCUMENT, useValue: fakeDoc }
      ]
    });
    service = TestBed.inject(ListingViewTrackingService);
  }

  it('sends nothing until a detail page asks for it (injecting the service is not a view)', () => {
    setup();
    expect(api.record).not.toHaveBeenCalled();
  });

  it('records once and returns the server answer', () => {
    setup();
    let result: unknown;
    service.record('property', 'p1').subscribe(r => (result = r));

    expect(api.record).toHaveBeenCalledOnceWith('property', 'p1');
    expect(result).toEqual({ counted: true, viewCount: 9 });
  });

  it('does not repeat the request for the same listing inside the window (lifecycle re-runs, back/forward)', () => {
    setup();
    service.record('property', 'p1').subscribe();
    let second: unknown = 'unset';
    service.record('property', 'p1').subscribe(r => (second = r));

    expect(api.record).toHaveBeenCalledTimes(1);
    expect(second).toBeNull();
  });

  it('treats another listing, or the same id of the other kind, as a different view', () => {
    setup();
    service.record('property', 'p1').subscribe();
    service.record('property', 'p2').subscribe();
    service.record('shortstay', 'p1').subscribe();
    expect(api.record).toHaveBeenCalledTimes(3);
  });

  it('allows another request once the window has passed', () => {
    setup();
    const now = Date.now();
    const clock = spyOn(Date, 'now').and.returnValue(now);
    service.record('property', 'p1').subscribe();
    clock.and.returnValue(now + REPEAT_WINDOW_MS + 1);
    service.record('property', 'p1').subscribe();
    expect(api.record).toHaveBeenCalledTimes(2);
  });

  it('turns every failure into null and lets the next opening try again', () => {
    setup();
    api.record.and.returnValue(throwError(() => new Error('offline')));
    let result: unknown = 'unset';
    service.record('property', 'p1').subscribe(r => (result = r));
    expect(result).toBeNull();

    api.record.and.returnValue(of({ counted: true, viewCount: 1 }));
    service.record('property', 'p1').subscribe();
    expect(api.record).toHaveBeenCalledTimes(2);
  });

  it('ignores an empty id', () => {
    setup();
    let result: unknown = 'unset';
    service.record('property', '').subscribe(r => (result = r));
    expect(api.record).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('waits for the page to become visible before counting a tab opened in the background', fakeAsync(() => {
    setup('hidden');
    service.record('property', 'p1').subscribe();
    tick();
    expect(api.record).not.toHaveBeenCalled();

    fakeDoc.visibilityState = 'visible';
    (fakeDoc as unknown as EventTarget).dispatchEvent(new Event('visibilitychange'));
    tick();
    expect(api.record).toHaveBeenCalledOnceWith('property', 'p1');
  }));
});
