import { HttpBackend, HttpRequest, HttpResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';

import { GeoCountryService, parseCountryCode } from './geo-country.service';

describe('parseCountryCode', () => {
  it('accepts a two-letter code and upper-cases it', () => {
    expect(parseCountryCode({ country: 'de' })).toBe('DE');
    expect(parseCountryCode({ country: 'SY' })).toBe('SY');
  });

  it('rejects everything else', () => {
    expect(parseCountryCode({ country: null })).toBeNull();
    expect(parseCountryCode({ country: 'DEU' })).toBeNull();
    expect(parseCountryCode({ country: 'D1' })).toBeNull();
    expect(parseCountryCode({ country: 5 })).toBeNull();
    expect(parseCountryCode({})).toBeNull();
    expect(parseCountryCode('DE')).toBeNull();
    expect(parseCountryCode(null)).toBeNull();
  });
});

describe('GeoCountryService', () => {
  function create(handle: (request: HttpRequest<unknown>) => Observable<HttpResponse<unknown>>): GeoCountryService {
    TestBed.configureTestingModule({ providers: [{ provide: HttpBackend, useValue: { handle } }] });
    return TestBed.inject(GeoCountryService);
  }

  it('asks the same-origin /geo endpoint and returns the country code', async () => {
    let requested = '';
    const service = create(request => {
      requested = request.url;
      return of(new HttpResponse({ status: 200, body: { country: 'at' } }));
    });

    expect(await service.fetchCountryCode()).toBe('AT');
    expect(requested).toBe('/geo');
  });

  it('resolves null when the endpoint fails', async () => {
    const service = create(() => throwError(() => new Error('offline')));

    expect(await service.fetchCountryCode()).toBeNull();
  });

  it('resolves null when the reply is not the expected JSON (e.g. ng serve answers with index.html)', async () => {
    const service = create(() => of(new HttpResponse({ status: 200, body: '<!doctype html>' })));

    expect(await service.fetchCountryCode()).toBeNull();
  });

  it('gives up after the timeout instead of blocking the first render', async () => {
    const service = create(() => new Observable<HttpResponse<unknown>>(() => undefined));

    const started = performance.now();
    expect(await service.fetchCountryCode(50)).toBeNull();
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
