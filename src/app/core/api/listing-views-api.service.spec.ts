import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';

import { ListingViewsApiService } from './listing-views-api.service';
import { VisitorIdService } from '../listing-views/visitor-id.service';
import { SKIP_ERROR_TOAST } from '../interceptors/api-error.interceptor';
import { environment } from '../../../environments/environment';

describe('ListingViewsApiService', () => {
  let service: ListingViewsApiService;
  let httpMock: HttpTestingController;
  const base = environment.apiBaseUrl;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [{ provide: VisitorIdService, useValue: { get: () => 'visitor-0123456789abcdef' } }]
    });
    service = TestBed.inject(ListingViewsApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('records a sale/rent view on POST /properties/{id}/views with the visitor id and no count', () => {
    service.record('property', 'p-1').subscribe();

    const req = httpMock.expectOne(`${base}/properties/p-1/views`);
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('X-Visitor-Id')).toBe('visitor-0123456789abcdef');
    expect(req.request.body).toEqual({});
    expect(req.request.context.get(SKIP_ERROR_TOAST)).toBeTrue();
    req.flush({ counted: true, viewCount: 5 });
  });

  it('records a short-stay view on its own endpoint', () => {
    service.record('shortstay', 's-1').subscribe();
    httpMock.expectOne(`${base}/short-stay/listings/s-1/views`).flush({ counted: false, viewCount: 3, reason: 'cooldown' });
  });

  it('reads the owner statistics and the daily trend', () => {
    service.getStats('agency').subscribe();
    const stats = httpMock.expectOne(r => r.url === `${base}/listing-views/stats`);
    expect(stats.request.params.get('scope')).toBe('agency');
    stats.flush({});

    service.getTrend('property', 'p-1', 7).subscribe();
    const trend = httpMock.expectOne(r => r.url === `${base}/listing-views/property/p-1/trend`);
    expect(trend.request.params.get('days')).toBe('7');
    trend.flush({});
  });
});
