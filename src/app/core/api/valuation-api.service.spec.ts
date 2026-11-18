// =====================================================================
// ✅ Unit Tests – valuation-api.service.spec.ts
// تغطية: تطبيع استجابتَي POST /api/ValuationInquiries و
// GET /api/ValuationInquiries/{id} (camelCase من الخادم) إلى الأشكال
// المعرَّفة في valuation.model.ts، وأن جسم POST يُرسَل بصيغة PascalCase
// مطابقة لـ CreateValuationInquiryCommand على الباك اند. أول ملف اختبار
// لهذا الصف (Stage 7 — لم يكن له أي تغطية من قبل).
// =====================================================================
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { ValuationApiService } from './valuation-api.service';

describe('ValuationApiService', () => {
  let service: ValuationApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });

    service = TestBed.inject(ValuationApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('✅ create: يرسل الحقول بصيغة PascalCase مطابقة لـ CreateValuationInquiryCommand', done => {
    service
      .create({
        governorateId: 1,
        districtId: 10,
        neighborhoodId: null,
        propertyTypeId: 2,
        area: 120,
        rooms: 3,
        requestType: 'ForSale',
        currencyCode: 'SYP'
      })
      .subscribe(() => done());

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/ValuationInquiries`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      GovernorateId: 1,
      DistrictId: 10,
      NeighborhoodId: null,
      PropertyTypeId: 2,
      Area: 120,
      Rooms: 3,
      RequestType: 'ForSale',
      CurrencyCode: 'SYP'
    });

    req.flush({
      inquiryId: 'inq-1',
      status: 'Completed',
      expiresAt: '2026-03-02T12:00:00Z',
      estimate: { available: true, kind: 'Sale', currencyCode: 'SYP', low: 1, mid: 2, high: 3, sampleCount: 9 },
      requiresOfficeValuation: false,
      officeMatchCount: 0,
      hasMinimumOfficeCoverage: false,
      insufficientOfficeCoverage: false,
      matchedNeighboringGovernorate: false
    });
  });

  it('✅ create: يطبّع النتيجة الكاملة (التقدير المتداخل + الأعلام على المستوى الأعلى)', done => {
    service.create({ governorateId: 1, propertyTypeId: 2, area: 90, requestType: 'ForRent' }).subscribe(result => {
      expect(result.inquiryId).toBe('inq-2');
      expect(result.status).toBe('AwaitingOfficeResponses');
      expect(result.requiresOfficeValuation).toBeTrue();
      expect(result.officeMatchCount).toBe(2);
      expect(result.matchedNeighboringGovernorate).toBeTrue();
      expect(result.estimate.available).toBeFalse();
      expect(result.estimate.reason).toBe('not_enough_data');
      expect(result.estimate.low).toBeNull();
      done();
    });

    httpMock.expectOne(`${environment.apiBaseUrl}/ValuationInquiries`).flush({
      inquiryId: 'inq-2',
      status: 'AwaitingOfficeResponses',
      expiresAt: '2026-03-02T12:00:00Z',
      estimate: { available: false, reason: 'not_enough_data', kind: 'Rent', currencyCode: 'USD', sampleCount: 0 },
      requiresOfficeValuation: true,
      officeMatchCount: 2,
      hasMinimumOfficeCoverage: false,
      insufficientOfficeCoverage: true,
      matchedNeighboringGovernorate: true
    });
  });

  it('✅ getStatus: يطبّع قائمة التقديرات دون أي حقل يخص هوية المكتب', done => {
    service.getStatus('inq-2').subscribe(status => {
      expect(status.status).toBe('AwaitingOfficeResponses');
      expect(status.estimates.length).toBe(1);
      expect(status.estimates[0].estimatedPrice).toBe(150000);
      expect(status.estimates[0].matchLevel).toBe('District');
      // لا يوجد أي حقل agencyId/agencyName في الواجهة أصلاً — انظر
      // valuation.model.ts's ValuationEstimateDto.
      expect((status.estimates[0] as unknown as Record<string, unknown>)['agencyId']).toBeUndefined();
      done();
    });

    httpMock.expectOne(`${environment.apiBaseUrl}/ValuationInquiries/inq-2`).flush({
      inquiryId: 'inq-2',
      status: 'AwaitingOfficeResponses',
      expiresAt: '2026-03-02T12:00:00Z',
      estimates: [
        { estimatedPrice: 150000, notes: null, submittedAt: '2026-03-01T18:00:00Z', matchLevel: 'District' }
      ]
    });
  });

  // Comprehensive audit 2026-11-17: offices cannot answer yet, so the API may switch the office path off.
  it('create: reads officePathAvailable, and treats an API without the field as the office path being on', done => {
    const results: boolean[] = [];
    service.create({ governorateId: 1, propertyTypeId: 2, area: 90, requestType: 'ForRent' }).subscribe(r => results.push(r.officePathAvailable));
    service.create({ governorateId: 1, propertyTypeId: 2, area: 90, requestType: 'ForRent' }).subscribe(r => {
      results.push(r.officePathAvailable);
      expect(results).toEqual([false, true]);
      done();
    });

    const [off, legacy] = httpMock.match(`${environment.apiBaseUrl}/ValuationInquiries`);
    off.flush({ inquiryId: 'a', status: 'Expired', requiresOfficeValuation: true, officePathAvailable: false });
    legacy.flush({ inquiryId: 'b', status: 'AwaitingOfficeResponses', requiresOfficeValuation: true });
  });

  // Valuation audit 2026-11-17: a response without an estimate (an older API) must never read as numbers.
  it('create: an answer without an estimate reads as "no estimate"', done => {
    service.create({ governorateId: 1, propertyTypeId: 2, area: 90, requestType: 'ForSale' }).subscribe(r => {
      expect(r.estimate.available).toBeFalse();
      expect(r.estimate.low).toBeNull();
      expect(r.estimate.reason).toBe('not_enough_data');
      done();
    });
    httpMock.expectOne(`${environment.apiBaseUrl}/ValuationInquiries`)
      .flush({ inquiryId: 'c', status: 'Completed', fastPath: { hasComparableListings: true, minPrice: 5 } });
  });
});
