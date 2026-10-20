// =====================================================================
// ✅ Unit Tests – admin-app-updates.service.spec.ts
// تغطية: معاملات GET /admin/app-releases (المنصة/التفعيل/الترقيم)، تطبيع النتيجة
// المُرقَّمة، ونقاط الإنشاء/التعديل/التفعيل/التعطيل/الحذف.
// =====================================================================
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import {
  AdminAppUpdatesService,
  CreateAppReleaseValue,
  UpdateAppReleaseValue,
} from './admin-app-updates.service';

describe('AdminAppUpdatesService', () => {
  let service: AdminAppUpdatesService;
  let httpMock: HttpTestingController;
  const base = `${environment.apiBaseUrl}/admin/app-releases`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(AdminAppUpdatesService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('✅ getReleases: يرسل platform/isEnabled/page/pageSize ويطبّع النتيجة المُرقَّمة', done => {
    service.getReleases({ platform: 'Android', isEnabled: false, page: 2, pageSize: 10 }).subscribe(result => {
      expect(result.items.length).toBe(1);
      expect(result.items[0].version).toBe('1.4.0');
      expect(result.page).toBe(2);
      expect(result.totalPages).toBe(3);
      done();
    });

    const req = httpMock.expectOne(r =>
      r.url === base
      && r.params.get('platform') === 'Android'
      && r.params.get('isEnabled') === 'false'
      && r.params.get('page') === '2'
      && r.params.get('pageSize') === '10'
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBeTrue();

    req.flush({
      items: [{ id: 'r1', platform: 'Android', version: '1.4.0', isEnabled: false }],
      totalCount: 25,
      page: 2,
      pageSize: 10,
      totalPages: 3,
      hasNext: true,
      hasPrevious: true,
    });
  });

  it('✅ getReleases: بلا فلاتر لا يرسل platform ولا isEnabled، وافتراضياً الصفحة 1 بحجم 20', () => {
    service.getReleases().subscribe();

    const req = httpMock.expectOne(r => r.url === base);
    expect(req.request.params.has('platform')).toBeFalse();
    expect(req.request.params.has('isEnabled')).toBeFalse();
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('pageSize')).toBe('20');
    req.flush([]);
  });

  it('✅ getReleases: isEnabled=true يُرسَل (القيمة false ليست "غير محددة")', () => {
    service.getReleases({ isEnabled: true }).subscribe();

    const req = httpMock.expectOne(r => r.url === base && r.params.get('isEnabled') === 'true');
    req.flush([]);
  });

  it('✅ createRelease: POST بالجسم كما هو', done => {
    const value: CreateAppReleaseValue = {
      platform: 'IOS',
      version: '2.0.0',
      minimumSupportedVersion: '1.5.0',
      storeUrl: null,
      releaseNotesAr: null,
      releaseNotesEn: 'Notes',
      releaseNotesDe: null,
      releaseDate: '2026-09-23T00:00:00.000Z',
      isEnabled: true,
    };

    service.createRelease(value).subscribe(result => {
      expect(result.id).toBe('new-id');
      done();
    });

    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(value);
    req.flush({ id: 'new-id' });
  });

  it('✅ updateRelease: PUT على /{id} بالجسم', () => {
    const value: UpdateAppReleaseValue = {
      version: '2.0.1',
      minimumSupportedVersion: '2.0.0',
      storeUrl: 'https://example.com/app',
      releaseNotesAr: null,
      releaseNotesEn: null,
      releaseNotesDe: null,
      releaseDate: '2026-09-23T00:00:00.000Z',
    };

    service.updateRelease('r1', value).subscribe();

    const req = httpMock.expectOne(`${base}/r1`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(value);
    req.flush(null);
  });

  it('✅ enableRelease / disableRelease: POST على /{id}/enable و /{id}/disable', () => {
    service.enableRelease('r1').subscribe();
    const enableReq = httpMock.expectOne(`${base}/r1/enable`);
    expect(enableReq.request.method).toBe('POST');
    enableReq.flush(null);

    service.disableRelease('r1').subscribe();
    const disableReq = httpMock.expectOne(`${base}/r1/disable`);
    expect(disableReq.request.method).toBe('POST');
    disableReq.flush(null);
  });

  it('✅ deleteRelease: DELETE على /{id}', () => {
    service.deleteRelease('r1').subscribe();

    const req = httpMock.expectOne(`${base}/r1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });
});
