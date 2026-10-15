// =====================================================================
// ✅ Unit Tests – admin-marketing.service.spec.ts
// الحادثة: تفعيل عرض من لوحة التسويق كان يفشل بـ 415 Unsupported Media Type لأن
// setOfferStatus أرسل النص الخام 'Active' (HttpClient يرسله text/plain) بينما نقطة
// النهاية تربط جسم JSON. هذه الاختبارات تثبّت العقد: كائن { status } بصيغة JSON.
// =====================================================================
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { AdminMarketingService, AdminOfferDto } from './admin-marketing.service';

describe('AdminMarketingService — offers', () => {
  let service: AdminMarketingService;
  let httpMock: HttpTestingController;
  const base = `${environment.apiBaseUrl}/offers`;

  const offer = (over: Partial<AdminOfferDto> = {}): AdminOfferDto => ({
    id: 'o-1', name: 'عرض', description: null, discountType: 'Percentage', discountValue: 20,
    targetPlanTier: null, startsAtUtc: '2026-10-01T00:00:00Z', endsAtUtc: null, maxRedemptions: null,
    redeemedCount: 0, status: 'Active', terms: null, createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z', isPubliclyVisible: true, ...over,
  });

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AdminMarketingService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('✅ setOfferStatus: PUT بجسم JSON { status } — وليس نصًا خامًا (سبب 415)', () => {
    service.setOfferStatus('o-1', 'Active').subscribe();

    const req = httpMock.expectOne(`${base}/o-1/status`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ status: 'Active' });
    expect(typeof req.request.body).toBe('object');
    // ما يكتشفه HttpClient من الجسم هو ما يُرسل فعليًا في ترويسة Content-Type.
    expect(req.request.detectContentTypeHeader()).toBe('application/json');
    expect(req.request.withCredentials).toBeTrue();
    req.flush(offer());
  });

  it('✅ setOfferStatus: يُرجع العرض كما أكّده الخادم (الحالة + isPubliclyVisible)', done => {
    service.setOfferStatus('o-1', 'Paused').subscribe(result => {
      expect(result.status).toBe('Paused');
      expect(result.isPubliclyVisible).toBeFalse();
      done();
    });

    httpMock.expectOne(`${base}/o-1/status`).flush(offer({ status: 'Paused', isPubliclyVisible: false }));
  });

  it('✅ createOffer / updateOffer: كائنات JSON أيضًا', () => {
    const value = {
      name: 'عرض', discountType: 'Percentage' as const, discountValue: 20,
      startsAtUtc: '2026-10-01T00:00:00.000Z',
    };

    service.createOffer(value).subscribe();
    const create = httpMock.expectOne(base);
    expect(create.request.method).toBe('POST');
    expect(create.request.detectContentTypeHeader()).toBe('application/json');
    create.flush({ id: 'o-1' });

    service.updateOffer('o-1', value).subscribe();
    const update = httpMock.expectOne(`${base}/o-1`);
    expect(update.request.method).toBe('PUT');
    expect(update.request.detectContentTypeHeader()).toBe('application/json');
    update.flush(null);
  });
});
