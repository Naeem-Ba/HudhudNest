import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

import { AdminShortStayService } from './admin-short-stay.service';

describe('AdminShortStayService', () => {
  let service: AdminShortStayService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AdminShortStayService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends search and paging, and leaves the taken-down filter out unless it is on', () => {
    service.search({ search: ' villa ', takenDown: false, page: 2, pageSize: 10 }).subscribe();

    const req = http.expectOne(r => r.url.endsWith('/admin/short-stay'));
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('search')).toBe('villa');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('pageSize')).toBe('10');
    expect(req.request.params.has('takenDown')).toBeFalse();
    req.flush({ items: [], totalCount: 0, page: 2, pageSize: 10 });
  });

  it('sends takenDown=true for the "taken down only" filter', () => {
    service.search({ takenDown: true }).subscribe();

    const req = http.expectOne(r => r.url.endsWith('/admin/short-stay'));
    expect(req.request.params.get('takenDown')).toBe('true');
    expect(req.request.params.has('search')).toBeFalse();
    req.flush([]);
  });

  it('takes a listing down with a trimmed reason', () => {
    service.takeDown('l1', '  misleading photos ').subscribe();

    const req = http.expectOne(r => r.url.endsWith('/admin/short-stay/l1/take-down'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ reason: 'misleading photos' });
    req.flush({});
  });

  it('restores with an optional reason (null when empty)', () => {
    service.restore('l1').subscribe();
    const bare = http.expectOne(r => r.url.endsWith('/admin/short-stay/l1/restore'));
    expect(bare.request.body).toEqual({ reason: null });
    bare.flush({});

    service.restore('l1', ' checked ').subscribe();
    const noted = http.expectOne(r => r.url.endsWith('/admin/short-stay/l1/restore'));
    expect(noted.request.body).toEqual({ reason: 'checked' });
    noted.flush({});
  });
});
