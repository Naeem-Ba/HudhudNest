import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

import { AdminServiceProvidersService } from './admin-service-providers.service';

describe('AdminServiceProvidersService', () => {
  let service: AdminServiceProvidersService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AdminServiceProvidersService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends filters and paging as query parameters and leaves empty filters out', () => {
    service.searchApplications({ search: ' nour ', status: 'Pending', category: '', governorateId: 3, page: 2, pageSize: 20 }).subscribe();

    const req = http.expectOne(r => r.url.endsWith('/admin/service-providers/applications'));
    expect(req.request.params.get('search')).toBe('nour');
    expect(req.request.params.get('status')).toBe('Pending');
    expect(req.request.params.get('governorateId')).toBe('3');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.has('category')).toBeFalse();
    req.flush({ items: [], total: 0, page: 2, pageSize: 20 });
  });

  it('approves with the chosen scope', () => {
    service.approve('a1', { approvedCategories: ['Cleaning'], approvedGovernorateIds: [1] }).subscribe();

    const req = http.expectOne(r => r.url.endsWith('/admin/service-providers/applications/a1/approve'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ approvedCategories: ['Cleaning'], approvedGovernorateIds: [1] });
    req.flush({});
  });

  it('suspends with a reason and reactivates without one', () => {
    service.suspend('p1', 'complaints').subscribe();
    const suspend = http.expectOne(r => r.url.endsWith('/admin/service-providers/p1/suspend'));
    expect(suspend.request.body).toEqual({ reason: 'complaints' });
    suspend.flush({});

    service.reactivate('p1').subscribe();
    const reactivate = http.expectOne(r => r.url.endsWith('/admin/service-providers/p1/reactivate'));
    expect(reactivate.request.body).toEqual({ reason: null });
    reactivate.flush({});
  });
});
