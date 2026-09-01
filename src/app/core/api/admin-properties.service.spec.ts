// =====================================================================
// ✅ Unit Tests – admin-properties.service.spec.ts
// تغطية: عرض إعلانات مستخدم من لوحة الإدارة، وإجراءات التمييز/التمديد — بما فيها
// التمديد بلا فحص خطة (يجب أن يبقى الطلب بلا معامل يشير إلى الخطة إطلاقاً).
// =====================================================================
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { AdminPropertiesService } from './admin-properties.service';

describe('AdminPropertiesService', () => {
  let service: AdminPropertiesService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });

    service = TestBed.inject(AdminPropertiesService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('✅ getUserProperties: يطبّع حقول الإعلان (isFeatured/featuredUntil/expiresAt)', done => {
    service.getUserProperties('u1', 1, 20, 'Available').subscribe(result => {
      expect(result.items.length).toBe(1);
      expect(result.items[0].isFeatured).toBe(true);
      expect(result.items[0].featuredUntil).toBe('2026-10-01T00:00:00Z');
      done();
    });

    const req = httpMock.expectOne(request =>
      request.url === `${environment.apiBaseUrl}/Admin/users/u1/properties`
      && request.params.get('status') === 'Available'
    );

    req.flush({
      total: 1,
      page: 1,
      pageSize: 20,
      data: [{
        id: 'p1',
        title: 'شقة للإيجار',
        status: 'Available',
        isPublished: true,
        publishedAt: '2026-07-01T00:00:00Z',
        expiresAt: '2026-10-01T00:00:00Z',
        isFeatured: true,
        featuredUntil: '2026-10-01T00:00:00Z',
        createdAt: '2026-07-01T00:00:00Z'
      }]
    });
  });

  it('✅ featureListing: يرسل days/reason إلى مسار التمييز', done => {
    service.featureListing('p1', 30, 'ترويج خاص').subscribe(() => done());

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/Admin/properties/p1/feature`);
    expect(req.request.body).toEqual({ days: 30, reason: 'ترويج خاص' });
    req.flush({ message: 'Featured.' });
  });

  it('✅ unfeatureListing: يرسل reason فقط إلى مسار إلغاء التمييز', done => {
    service.unfeatureListing('p1').subscribe(() => done());

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/Admin/properties/p1/unfeature`);
    expect(req.request.body).toEqual({ reason: null });
    req.flush({ message: 'Unfeatured.' });
  });

  it('✅ extendListing: يرسل days بلا أي إشارة إلى خطة المستخدم — التمديد يعمل حتى على الخطة المجانية', done => {
    service.extendListing('p1', 90, 'صاحب الإعلان على الخطة المجانية').subscribe(() => done());

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/Admin/properties/p1/extend`);
    expect(req.request.body).toEqual({ days: 90, reason: 'صاحب الإعلان على الخطة المجانية' });
    expect(Object.keys(req.request.body as object)).not.toContain('plan');
    req.flush({ message: 'Extended.' });
  });
});
