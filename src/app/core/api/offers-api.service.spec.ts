// =====================================================================
// ✅ Unit Tests – offers-api.service.spec.ts
// GET /offers/active: ثلاث حالات صريحة (ready / empty / error)، ولا يصل خطأ إلى الصفحة،
// ولا toast عام على فشل عرض اختياري.
// =====================================================================
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

import { environment } from '../../../environments/environment';
import { ApiErrorInterceptor } from '../interceptors/api-error.interceptor';
import { ToastService } from '../../shared/services/toast.service';
import { ActiveOfferState, OffersApiService, isUsableOffer } from './offers-api.service';

describe('OffersApiService.getActiveOfferState', () => {
  let service: OffersApiService;
  let httpMock: HttpTestingController;
  let toast: ToastService;
  const url = `${environment.apiBaseUrl}/offers/active`;

  const liveOffer = {
    id: 'o-1', name: 'أول 100 مكتب', description: 'وصف', discountType: 'Percentage', discountValue: 25,
    targetPlanTier: null, endsAtUtc: null, maxRedemptions: 100, redeemedCount: 4, terms: null,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([ApiErrorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(OffersApiService);
    httpMock = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
  });

  afterEach(() => httpMock.verify());

  function run(flush: (req: ReturnType<HttpTestingController['expectOne']>) => void): ActiveOfferState {
    let state: ActiveOfferState | undefined;
    service.getActiveOfferState().subscribe(s => (state = s));
    flush(httpMock.expectOne(url));
    return state as ActiveOfferState;
  }

  it('✅ 200 مع عرض صالح → ready', () => {
    const state = run(req => req.flush(liveOffer));
    expect(state).toEqual({ status: 'ready', offer: liveOffer as never });
  });

  it('✅ 204 (لا عرض) → empty، وليس خطأ', () => {
    const state = run(req => req.flush(null, { status: 204, statusText: 'No Content' }));
    expect(state).toEqual({ status: 'empty' });
    expect(toast.toasts()).toEqual([]);
  });

  it('✅ 500 / انقطاع شبكة → error بلا toast عام ولا استثناء', () => {
    expect(run(req => req.flush({ title: 'x' }, { status: 500, statusText: 'Server Error' }))).toEqual({ status: 'error' });
    expect(run(req => req.error(new ProgressEvent('error'), { status: 0 }))).toEqual({ status: 'error' });
    expect(toast.toasts()).toEqual([]);
  });

  it('✅ استجابة 200 بشكل غير متوقع → error وليست بطاقة فارغة', () => {
    expect(run(req => req.flush({ foo: 'bar' }))).toEqual({ status: 'error' });
    expect(run(req => req.flush([]))).toEqual({ status: 'error' });
    expect(run(req => req.flush({ ...liveOffer, name: '   ' }))).toEqual({ status: 'error' });
  });

  it('isUsableOffer يطلب id واسمًا ونوع خصم وقيمة رقمية', () => {
    expect(isUsableOffer(liveOffer)).toBeTrue();
    expect(isUsableOffer(null)).toBeFalse();
    expect(isUsableOffer({ ...liveOffer, discountValue: '25' })).toBeFalse();
    expect(isUsableOffer({ ...liveOffer, id: '' })).toBeFalse();
  });
});
