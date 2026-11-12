import { TestBed, fakeAsync, tick, flush } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';

import { LanguageService } from '../services/language.service';
import { resetSafeStorageMemory } from '../services/safe-storage';
import { BackendApiService } from './backend-api.service';
import { ListingTitleTranslationService } from './listing-title-translation.service';

const ID_A = '11111111-1111-1111-1111-111111111111';
const ID_B = '22222222-2222-2222-2222-222222222222';

describe('ListingTitleTranslationService', () => {
  let lang = 'en';
  let post: jasmine.Spy;
  let reply: (url: string, body: any) => Observable<any>;

  function create(): ListingTitleTranslationService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: LanguageService, useValue: { getCurrent: () => lang } },
        { provide: BackendApiService, useValue: { post } }
      ]
    });
    return TestBed.inject(ListingTitleTranslationService);
  }

  beforeEach(() => {
    lang = 'en';
    localStorage.clear();
    resetSafeStorageMemory();
    reply = (_url, body) => of({
      targetLanguage: 'en', status: 'ready',
      items: body.items.map((i: any) => ({ kind: i.kind, id: i.id, state: 'ready', text: `EN ${i.id.slice(0, 2)}` }))
    });
    post = jasmine.createSpy('post').and.callFake((url: string, body: any) => reply(url, body));
  });

  it('shows the original at once and asks the API ONCE for every title on the page', fakeAsync(() => {
    const svc = create();

    expect(svc.display('property', ID_A, 'بيت قديم')).toBe('بيت قديم');
    expect(svc.display('short-stay', ID_B, 'شقة')).toBe('شقة');
    expect(svc.display('property', ID_A, 'بيت قديم')).toBe('بيت قديم');
    expect(post).not.toHaveBeenCalled();

    tick(60);

    expect(post).toHaveBeenCalledTimes(1);
    expect(post.calls.mostRecent().args[0]).toBe('/listing-translations/titles?lang=en');
    expect(post.calls.mostRecent().args[1]).toEqual({ items: [{ kind: 'property', id: ID_A }, { kind: 'short-stay', id: ID_B }] });
    expect(svc.display('property', ID_A, 'بيت قديم')).toBe('EN 11');
    expect(svc.display('short-stay', ID_B, 'شقة')).toBe('EN 22');
    flush();
  }));

  it('remembers answers on the device: the next visit shows the translation at once and asks nothing', fakeAsync(() => {
    const first = create();
    first.display('property', ID_A, 'بيت قديم');
    tick(60);
    post.calls.reset();

    const second = create();
    expect(second.display('property', ID_A, 'بيت قديم')).toBe('EN 11');
    tick(60);
    expect(post).not.toHaveBeenCalled();
    flush();
  }));

  it('asks again for a title that was edited (the remembered translation belongs to the old text)', fakeAsync(() => {
    const svc = create();
    svc.display('property', ID_A, 'بيت قديم');
    tick(60);
    post.calls.reset();

    expect(svc.display('property', ID_A, 'بيت جديد')).toBe('بيت جديد');
    tick(60);
    expect(post).toHaveBeenCalledTimes(1);
    flush();
  }));

  it('lets the visitor flip to the original and back, and remembers the choice', fakeAsync(() => {
    const svc = create();
    svc.display('property', ID_A, 'بيت');
    tick(60);
    expect(svc.hasTranslation('property', ID_A, 'بيت')).toBeTrue();

    svc.toggleOriginal();
    expect(svc.showingOriginal()).toBeTrue();
    expect(svc.display('property', ID_A, 'بيت')).toBe('بيت');
    expect(svc.hasTranslation('property', ID_A, 'بيت')).toBeTrue();
    expect(create().showingOriginal()).toBeTrue();

    svc.toggleOriginal();
    expect(svc.display('property', ID_A, 'بيت')).toBe('EN 11');
    flush();
  }));

  it('keeps one answer per language', fakeAsync(() => {
    const svc = create();
    svc.display('property', ID_A, 'بيت');
    tick(60);

    lang = 'de';
    reply = (_u, body) => of({ targetLanguage: 'de', status: 'ready', items: body.items.map((i: any) => ({ ...i, state: 'ready', text: 'DE Haus' })) });
    expect(svc.display('property', ID_A, 'بيت')).toBe('بيت');
    tick(60);

    expect(post.calls.mostRecent().args[0]).toBe('/listing-translations/titles?lang=de');
    expect(svc.display('property', ID_A, 'بيت')).toBe('DE Haus');
    lang = 'en';
    expect(svc.display('property', ID_A, 'بيت')).toBe('EN 11');
    flush();
  }));

  it('a title already in the visitor\'s language is remembered as such and never asked again', fakeAsync(() => {
    reply = (_u, body) => of({ targetLanguage: 'en', status: 'ready', items: body.items.map((i: any) => ({ ...i, state: 'same_language' })) });
    const svc = create();
    svc.display('property', ID_A, 'Old house');
    tick(60);
    post.calls.reset();

    expect(svc.display('property', ID_A, 'Old house')).toBe('Old house');
    expect(svc.hasTranslation('property', ID_A, 'Old house')).toBeFalse();
    tick(60);
    expect(post).not.toHaveBeenCalled();
    flush();
  }));

  it('translation switched off or limit reached: the original stays and the API is not asked again for a long while', fakeAsync(() => {
    reply = (_u, body) => of({ targetLanguage: 'en', status: 'unavailable', items: body.items.map((i: any) => ({ ...i, state: 'unavailable', reason: 'disabled' })) });
    const svc = create();
    svc.display('property', ID_A, 'بيت');
    tick(60);
    expect(post).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 5; i++) {
      expect(svc.display('property', ID_A, 'بيت')).toBe('بيت');
      tick(60);
    }
    expect(post).toHaveBeenCalledTimes(1);
    flush();
  }));

  it('a failed request keeps the original, shows no error and is not repeated at once', fakeAsync(() => {
    reply = () => throwError(() => new Error('offline'));
    const svc = create();
    svc.display('property', ID_A, 'بيت');
    tick(60);

    expect(svc.display('property', ID_A, 'بيت')).toBe('بيت');
    tick(60);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.calls.mostRecent().args[2].context).toBeDefined();
    flush();
  }));

  it('a title still being translated by someone else is asked again shortly, then answered', fakeAsync(() => {
    let calls = 0;
    reply = (_u, body) => of({
      targetLanguage: 'en', status: calls++ === 0 ? 'pending' : 'ready', retryAfterSeconds: 2,
      items: body.items.map((i: any) => calls === 1 ? { ...i, state: 'pending' } : { ...i, state: 'ready', text: 'EN later' })
    });
    const svc = create();
    svc.display('property', ID_A, 'بيت');
    tick(60);
    expect(svc.display('property', ID_A, 'بيت')).toBe('بيت');

    tick(2100);
    expect(svc.display('property', ID_A, 'بيت')).toBe('بيت');
    tick(60);
    expect(svc.display('property', ID_A, 'بيت')).toBe('EN later');
    flush();
  }));

  it('sends at most 30 titles per request', fakeAsync(() => {
    const svc = create();
    for (let i = 0; i < 65; i++) {
      svc.display('property', `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`, `عنوان ${i}`);
    }
    tick(500);

    expect(post).toHaveBeenCalledTimes(3);
    expect(post.calls.argsFor(0)[1].items.length).toBe(30);
    expect(post.calls.argsFor(2)[1].items.length).toBe(5);
    flush();
  }));

  it('never asks for an empty title or a missing id', fakeAsync(() => {
    const svc = create();
    expect(svc.display('property', ID_A, '')).toBe('');
    expect(svc.display('property', ID_A, null)).toBe('');
    expect(svc.display('property', undefined, 'x')).toBe('x');
    tick(500);
    expect(post).not.toHaveBeenCalled();
  }));

  it('ignores damaged stored data instead of failing', () => {
    localStorage.setItem('listing_title_translations_v1', '{not json');
    expect(() => create()).not.toThrow();
    localStorage.setItem('listing_title_translations_v1', JSON.stringify([[1, 2, 3], 'x']));
    expect(() => create()).not.toThrow();
  });
});
