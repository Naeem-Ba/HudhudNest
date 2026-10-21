import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

import { AdminServiceRequestsService } from './admin-service-requests.service';

describe('AdminServiceRequestsService', () => {
  let service: AdminServiceRequestsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AdminServiceRequestsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends filters and paging and leaves empty filters out', () => {
    service.search({ search: ' deed ', status: 'NotCompleted', category: '', offeringId: 'o1', needsAttention: true, page: 2 }).subscribe();

    const req = http.expectOne(r => r.url.endsWith('/admin/service-requests'));
    expect(req.request.params.get('search')).toBe('deed');
    expect(req.request.params.get('status')).toBe('NotCompleted');
    expect(req.request.params.get('offeringId')).toBe('o1');
    expect(req.request.params.get('needsAttention')).toBe('true');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('pageSize')).toBe('20');
    expect(req.request.params.has('category')).toBeFalse();
    expect(req.request.params.has('providerId')).toBeFalse();
    req.flush({ items: [], total: 0, page: 2, pageSize: 20 });
  });

  it('asks for statistics in a date range', () => {
    service.stats('2026-10-01', '2026-10-31T23:59:59').subscribe();

    const req = http.expectOne(r => r.url.endsWith('/admin/service-requests/stats'));
    expect(req.request.params.get('from')).toBe('2026-10-01');
    expect(req.request.params.get('to')).toBe('2026-10-31T23:59:59');
    req.flush({});
  });

  it('records an outcome with the admin note and drops an empty provider note', () => {
    service.setOutcome('r1', { completed: false, reason: 'ProviderUnavailable', providerNote: ' ', adminNote: ' no answer ' }).subscribe();

    const req = http.expectOne(r => r.url.endsWith('/admin/service-requests/r1/outcome'));
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ completed: false, reason: 'ProviderUnavailable', providerNote: null, adminNote: 'no answer' });
    req.flush({});
  });

  it('hides and restores a review', () => {
    service.setReviewVisibility('v1', true, ' abusive ').subscribe();
    const hide = http.expectOne(r => r.url.endsWith('/admin/service-requests/reviews/v1/visibility'));
    expect(hide.request.body).toEqual({ hidden: true, reason: 'abusive' });
    hide.flush({});

    service.setReviewVisibility('v1', false).subscribe();
    const restore = http.expectOne(r => r.url.endsWith('/admin/service-requests/reviews/v1/visibility'));
    expect(restore.request.body).toEqual({ hidden: false, reason: null });
    restore.flush({});
  });
});
