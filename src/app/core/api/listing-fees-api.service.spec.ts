import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { ListingFeesApiService } from './listing-fees-api.service';

describe('ListingFeesApiService — one more listing', () => {
  let service: ListingFeesApiService;
  let httpMock: HttpTestingController;
  const base = environment.apiBaseUrl;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(ListingFeesApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getExtraListingStatus: يحوّل الحالة ويعوّض الحقول الناقصة', () => {
    let result: unknown;
    service.getExtraListingStatus().subscribe(r => (result = r));

    httpMock.expectOne(`${base}/extra-listing`).flush({
      canRequest: true, blockedCode: null, hasPendingRequest: false, pendingRequestId: null,
      availableCredits: 0, priceUsd: 1, listingDays: 30, activeListings: 1, limit: 1
    });

    expect(result).toEqual({
      canRequest: true, blockedCode: null, hasPendingRequest: false, pendingRequestId: null,
      availableCredits: 0, priceUsd: 1, listingDays: 30, activeListings: 1, limit: 1
    });
  });

  it('getExtraListingStatus: استجابة فارغة لا تعني إمكانية الشراء', () => {
    let result: { canRequest: boolean } | undefined;
    service.getExtraListingStatus().subscribe(r => (result = r));
    httpMock.expectOne(`${base}/extra-listing`).flush(null);
    expect(result?.canRequest).toBeFalse();
  });

  it('request(extra-listing): يرسل إلى مسار الطلب بلا معرّف عقار، ورقم الطلب هو المرجع', () => {
    let quote: { kind: string; transactionId: string; propertyId: string; amountUsd: number; days: number; isExistingPendingFee: boolean } | undefined;
    service.request('extra-listing', '').subscribe(q => (quote = q));

    const req = httpMock.expectOne(`${base}/extra-listing/request`);
    expect(req.request.method).toBe('POST');
    req.flush({ requestId: 'r1', amountUsd: 1, listingDays: 30, isExistingPendingRequest: true }, { status: 202, statusText: 'Accepted' });

    expect(quote).toEqual(jasmine.objectContaining({
      kind: 'extra-listing', transactionId: 'r1', propertyId: '', amountUsd: 1, days: 30, isExistingPendingFee: true
    }));
  });
});
