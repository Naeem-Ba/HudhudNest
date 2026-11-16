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

  it('sends every search filter as its API query parameter (amenities repeated, unset ones omitted)', () => {
    service.search({
      searchTerm: 'sea', city: 'Damascus', locationId: 7, accommodationTypeId: 2, checkIn: '2026-12-01', checkOut: '2026-12-04',
      guests: 3, minBedrooms: 2, instantBooking: true, amenityIds: ['a', 'b'], minPrice: 10, maxPrice: 90,
      currencyCode: 'EUR', sortBy: 'price', sortDescending: true, page: 2, pageSize: 10
    }).subscribe();

    const req = http.expectOne(r => r.url.endsWith('/short-stay/listings'));
    const p = req.request.params;
    expect(p.get('searchTerm')).toBe('sea');
    expect(p.get('city')).toBe('Damascus');
    expect(p.get('locationId')).toBe('7');
    expect(p.get('checkIn')).toBe('2026-12-01');
    expect(p.get('guests')).toBe('3');
    expect(p.get('minBedrooms')).toBe('2');
    expect(p.get('instantBooking')).toBe('true');
    expect(p.getAll('amenityIds')).toEqual(['a', 'b']);
    expect(p.get('minPrice')).toBe('10');
    expect(p.get('currencyCode')).toBe('EUR');
    expect(p.get('sortBy')).toBe('price');
    expect(p.get('sortDescending')).toBe('true');
    expect(p.get('page')).toBe('2');
    req.flush({ items: [], totalCount: 0, page: 2, pageSize: 10 });
  });

  it('omits filters that are not set', () => {
    service.search({}).subscribe();

    const req = http.expectOne(r => r.url.endsWith('/short-stay/listings'));
    expect(req.request.params.keys().sort()).toEqual(['page', 'pageSize']);
    req.flush({ items: [], totalCount: 0, page: 1, pageSize: 20 });
  });
});
