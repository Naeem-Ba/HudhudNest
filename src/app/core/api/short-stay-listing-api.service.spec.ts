import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

import { ShortStayListingApiService } from './short-stay-listing-api.service';
import { SKIP_ERROR_TOAST } from '../interceptors/api-error.interceptor';

describe('ShortStayListingApiService (availability and reviews)', () => {
  let service: ShortStayListingApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(ShortStayListingApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists the blocked periods of a unit (array or paged body)', () => {
    let result: unknown;
    service.getUnitBlocks('u1').subscribe(r => (result = r));

    const req = http.expectOne(r => r.url.endsWith('/short-stay/listings/units/u1/blocks'));
    expect(req.request.method).toBe('GET');
    req.flush({ items: [{ id: 'k1', unitId: 'u1', from: '2026-11-01', to: '2026-11-05' }] });
    expect(result).toEqual([{ id: 'k1', unitId: 'u1', from: '2026-11-01', to: '2026-11-05' }]);
  });

  it('blocks a period and unblocks it', () => {
    service.addUnitBlock('u1', { from: '2026-11-01', to: '2026-11-05' }).subscribe();
    const add = http.expectOne(r => r.url.endsWith('/units/u1/blocks') && r.method === 'POST');
    expect(add.request.body).toEqual({ from: '2026-11-01', to: '2026-11-05' });
    add.flush({});

    service.removeUnitBlock('u1', 'k1').subscribe();
    const del = http.expectOne(r => r.url.endsWith('/units/u1/blocks/k1'));
    expect(del.request.method).toBe('DELETE');
    del.flush(null);
  });

  it('switches a unit off and on', () => {
    service.setUnitAvailability('u1', false).subscribe();

    const req = http.expectOne(r => r.url.endsWith('/units/u1/availability'));
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ isActive: false });
    req.flush({});
  });

  it('reads the public reviews without an error toast and normalises the summary', () => {
    let result: unknown;
    service.getReviews('l1', 2, 5).subscribe(r => (result = r));

    const req = http.expectOne(r => r.url.endsWith('/short-stay/listings/l1/reviews'));
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('pageSize')).toBe('5');
    expect(req.request.context.get(SKIP_ERROR_TOAST)).toBeTrue();
    req.flush({ averageRating: '4.5', totalCount: 2, reviews: [{ id: 'r1' }, { id: 'r2' }] });

    expect(result).toEqual({ averageRating: 4.5, totalCount: 2, reviews: [{ id: 'r1' }, { id: 'r2' }] } as never);
  });

  it('treats an empty body as no reviews', () => {
    let result: unknown;
    service.getReviews('l1').subscribe(r => (result = r));
    http.expectOne(r => r.url.endsWith('/l1/reviews')).flush(null);
    expect(result).toEqual({ averageRating: 0, totalCount: 0, reviews: [] });
  });
});
