import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { NEXT_PAGE_PRELOAD_DELAY_MS, NextPagePreloading, connectionAllowsPrefetch } from './next-page-preloading';

describe('NextPagePreloading', () => {
  let url: string;
  let strategy: NextPagePreloading;

  beforeEach(() => {
    url = '/properties';
    TestBed.configureTestingModule({
      providers: [{ provide: Router, useValue: { get url() { return url; } } }]
    });
    strategy = TestBed.inject(NextPagePreloading);
  });

  function run(data: Record<string, unknown> | undefined, load: () => Observable<unknown>): { done: boolean } {
    const state = { done: false };
    strategy.preload({ path: 'x', data }, load).subscribe({ complete: () => (state.done = true) });
    return state;
  }

  it('fetches the page after the pause while a listed page is open', fakeAsync(() => {
    const load = jasmine.createSpy('load').and.returnValue(of(true));
    const state = run({ prefetchFrom: ['/properties'] }, load);

    tick(NEXT_PAGE_PRELOAD_DELAY_MS - 1);
    expect(load).not.toHaveBeenCalled();
    tick(1);
    expect(load).toHaveBeenCalledTimes(1);
    expect(state.done).toBeTrue();
  }));

  it('ignores the query string of the open page', fakeAsync(() => {
    url = '/properties?city=Damascus&page=2';
    const load = jasmine.createSpy('load').and.returnValue(of(true));
    run({ prefetchFrom: ['/properties'] }, load);
    tick(NEXT_PAGE_PRELOAD_DELAY_MS);
    expect(load).toHaveBeenCalledTimes(1);
  }));

  it('fetches nothing for a route without prefetchFrom, or from another page', fakeAsync(() => {
    const load = jasmine.createSpy('load').and.returnValue(of(true));
    expect(run(undefined, load).done).toBeTrue();
    url = '/pricing';
    expect(run({ prefetchFrom: ['/properties'] }, load).done).toBeTrue();
    tick(NEXT_PAGE_PRELOAD_DELAY_MS);
    expect(load).not.toHaveBeenCalled();
  }));

  it('does not fetch when the visitor left during the pause', fakeAsync(() => {
    const load = jasmine.createSpy('load').and.returnValue(of(true));
    const state = run({ prefetchFrom: ['/properties'] }, load);
    url = '/pricing';
    tick(NEXT_PAGE_PRELOAD_DELAY_MS);
    expect(load).not.toHaveBeenCalled();
    expect(state.done).toBeTrue();
  }));

  it('completes quietly when the early fetch fails', fakeAsync(() => {
    const state = run({ prefetchFrom: ['/properties'] }, () => throwError(() => new Error('chunk failed')));
    tick(NEXT_PAGE_PRELOAD_DELAY_MS);
    expect(state.done).toBeTrue();
  }));
});

describe('connectionAllowsPrefetch', () => {
  it('allows an unknown or ordinary connection', () => {
    expect(connectionAllowsPrefetch(undefined)).toBeTrue();
    expect(connectionAllowsPrefetch({ effectiveType: '4g' })).toBeTrue();
    expect(connectionAllowsPrefetch({ effectiveType: '3g', saveData: false })).toBeTrue();
  });

  it('refuses data saver and 2G', () => {
    expect(connectionAllowsPrefetch({ saveData: true, effectiveType: '4g' })).toBeFalse();
    expect(connectionAllowsPrefetch({ effectiveType: '2g' })).toBeFalse();
    expect(connectionAllowsPrefetch({ effectiveType: 'slow-2g' })).toBeFalse();
  });
});
