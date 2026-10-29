import { fakeAsync, tick, discardPeriodicTasks } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { ListingTranslation, ListingTranslationService } from '../../core/api/listing-translation.service';
import { ListingTranslationController } from './listing-translation.controller';

const ready = (over: Partial<ListingTranslation> = {}): ListingTranslation => ({
  targetLanguage: 'en',
  status: 'ready',
  title: { state: 'ready', text: 'Furnished flat', sourceLanguage: 'ar' },
  description: { state: 'ready', text: 'Bright flat', sourceLanguage: 'ar' },
  ...over
});

const pending = (): ListingTranslation => ({
  targetLanguage: 'en', status: 'pending', retryAfterSeconds: 2,
  title: { state: 'pending' }, description: { state: 'pending' }
});

describe('ListingTranslationController', () => {
  let api: jasmine.SpyObj<ListingTranslationService>;
  let controller: ListingTranslationController;

  beforeEach(() => {
    api = jasmine.createSpyObj<ListingTranslationService>('ListingTranslationService', ['ensure']);
    controller = new ListingTranslationController(api, { waitBudgetMs: 8000, maxPolls: 3 });
  });

  it('shows the translation, and switching to the original and back makes no further request', () => {
    api.ensure.and.returnValue(of(ready()));
    controller.start('p1', 'en');

    expect(controller.view()).toBe('ready');
    expect(controller.title()).toBe('Furnished flat');
    expect(controller.description()).toBe('Bright flat');

    controller.toggleOriginal();
    expect(controller.showOriginal()).toBeTrue();
    controller.toggleOriginal();
    expect(controller.showOriginal()).toBeFalse();
    expect(api.ensure).toHaveBeenCalledTimes(1);
  });

  it('does not repeat the request for the same listing and language, or when returning to a cached pair', () => {
    api.ensure.and.returnValue(of(ready()));
    controller.start('p1', 'en');
    controller.start('p1', 'en');
    expect(api.ensure).toHaveBeenCalledTimes(1);

    api.ensure.and.returnValue(of(ready({ targetLanguage: 'de', title: { state: 'ready', text: 'Möbliert' } })));
    controller.start('p1', 'de');
    expect(api.ensure).toHaveBeenCalledTimes(2);
    expect(controller.title()).toBe('Möbliert');

    controller.start('p1', 'en'); // cached in memory
    expect(api.ensure).toHaveBeenCalledTimes(2);
    expect(controller.title()).toBe('Furnished flat');
  });

  it('keeps the original while waiting, then swaps the translation in when it arrives late', fakeAsync(() => {
    const response = new Subject<ListingTranslation>();
    api.ensure.and.returnValue(response.asObservable());

    controller.start('p1', 'en');
    expect(controller.view()).toBe('loading');
    tick(8000);
    expect(controller.view()).toBe('waiting');
    expect(controller.title()).toBeNull();

    response.next(ready());
    expect(controller.view()).toBe('ready');
    expect(controller.title()).toBe('Furnished flat');
  }));

  it('re-asks while another request is still translating, but only a bounded number of times', fakeAsync(() => {
    api.ensure.and.callFake(() => of(pending()));
    controller.start('p1', 'en');

    tick(60_000);
    expect(api.ensure.calls.count()).toBe(4); // first call + maxPolls (3)
    expect(controller.view()).toBe('unavailable');
    discardPeriodicTasks();
  }));

  it('polls until a pending translation becomes ready', fakeAsync(() => {
    const answers = [pending(), ready()];
    api.ensure.and.callFake(() => of(answers.shift()!));
    controller.start('p1', 'en');

    tick(2000);
    expect(controller.view()).toBe('ready');
    expect(api.ensure).toHaveBeenCalledTimes(2);
  }));

  it('falls back to the original on failure and retries only when asked', () => {
    api.ensure.and.returnValue(throwError(() => new Error('offline')));
    controller.start('p1', 'en');
    expect(controller.view()).toBe('unavailable');
    expect(controller.title()).toBeNull();
    expect(api.ensure).toHaveBeenCalledTimes(1);

    api.ensure.and.returnValue(of(ready()));
    controller.retry();
    expect(controller.view()).toBe('ready');
    expect(api.ensure).toHaveBeenCalledTimes(2);
  });

  it('treats a partial result as usable and an all-unavailable result as the original', () => {
    api.ensure.and.returnValue(of(ready({ description: { state: 'unavailable', reason: 'too_long' } })));
    controller.start('p1', 'en');
    expect(controller.title()).toBe('Furnished flat');
    expect(controller.description()).toBeNull();

    api.ensure.and.returnValue(of({
      targetLanguage: 'de', status: 'unavailable', reason: 'quota',
      title: { state: 'unavailable' }, description: { state: 'unavailable' }
    } as ListingTranslation));
    controller.start('p2', 'de');
    expect(controller.view()).toBe('unavailable');
  });

  it('shows nothing when the text is already in the requested language', () => {
    api.ensure.and.returnValue(of({
      targetLanguage: 'ar', status: 'same_language',
      title: { state: 'same_language' }, description: { state: 'same_language' }
    } as ListingTranslation));
    controller.start('p1', 'ar');
    expect(controller.view()).toBe('none');
  });

  it('ignores a late answer for a listing the visitor already left', () => {
    const first = new Subject<ListingTranslation>();
    api.ensure.and.returnValue(first.asObservable());
    controller.start('p1', 'en');

    api.ensure.and.returnValue(of(ready({ title: { state: 'ready', text: 'Second listing' } })));
    controller.start('p2', 'en');
    first.next(ready({ title: { state: 'ready', text: 'First listing' } }));

    expect(controller.title()).toBe('Second listing');
  });

  it('reset clears everything so nothing from the previous listing can show', () => {
    api.ensure.and.returnValue(of(ready()));
    controller.start('p1', 'en');
    controller.reset();
    expect(controller.view()).toBe('none');
    expect(controller.title()).toBeNull();
  });
});

describe('ListingTranslationService', () => {
  it('posts to the listing translation endpoint with the language', () => {
    const post = jasmine.createSpy('post').and.returnValue(of({}) as Observable<unknown>);
    const service = new ListingTranslationService({ post } as never);
    service.ensure('abc-123', 'de').subscribe();
    expect(post).toHaveBeenCalledWith('/properties/abc-123/translation?lang=de');
  });

  it('posts to the short-stay endpoint for short-stay listings', () => {
    const post = jasmine.createSpy('post').and.returnValue(of(ready()));
    const service = new ListingTranslationService({ post } as never);
    service.ensure('s-1', 'en', 'short-stay').subscribe();
    expect(post).toHaveBeenCalledWith('/short-stay/listings/s-1/translation?lang=en');
  });
});

describe('ListingTranslationController (listing kinds)', () => {
  it('passes the kind through and never mixes a sale listing with a short-stay one that has the same id', () => {
    const api = jasmine.createSpyObj<ListingTranslationService>('ListingTranslationService', ['ensure']);
    api.ensure.and.returnValue(of(ready()));
    const controller = new ListingTranslationController(api, { waitBudgetMs: 8000, maxPolls: 3 });

    controller.start('same-id', 'en', 'short-stay');
    expect(api.ensure).toHaveBeenCalledWith('same-id', 'en', 'short-stay');

    controller.start('same-id', 'en', 'property');
    expect(api.ensure).toHaveBeenCalledTimes(2);
    expect(api.ensure).toHaveBeenCalledWith('same-id', 'en', 'property');
  });
});
