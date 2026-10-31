import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { AdminAuditLogsService } from './admin-audit-logs.service';

describe('AdminAuditLogsService', () => {
  let service: AdminAuditLogsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AdminAuditLogsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends only the filters that are set, and computes the page count', done => {
    service.search(2, 50, { action: 'UserDisabled', from: '2026-10-01T00:00:00Z' }).subscribe(r => {
      expect(r.items.length).toBe(1);
      expect(r.total).toBe(120);
      expect(r.totalPages).toBe(3);
      done();
    });

    const req = http.expectOne(r => r.url === `${environment.apiBaseUrl}/admin/audit-logs`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('action')).toBe('UserDisabled');
    expect(req.request.params.get('from')).toBe('2026-10-01T00:00:00Z');
    expect(req.request.params.has('search')).toBeFalse();
    expect(req.request.params.has('to')).toBeFalse();
    req.flush({ total: 120, page: 2, pageSize: 50, data: [{ id: 'a1', timestamp: '2026-10-31T10:00:00Z', userId: 'u1', userName: 'Admin', action: 'UserDisabled', ipAddress: '203.0.113.0', oldValue: null, newValue: null }] });
  });

  it('treats a missing data array as an empty page', done => {
    service.search().subscribe(r => {
      expect(r.items).toEqual([]);
      expect(r.totalPages).toBe(1);
      done();
    });
    http.expectOne(r => r.url === `${environment.apiBaseUrl}/admin/audit-logs`).flush({});
  });
});
