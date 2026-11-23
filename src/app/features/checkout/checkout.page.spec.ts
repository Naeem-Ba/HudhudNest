import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';

import { ListingFeesApiService } from '../../core/api/listing-fees-api.service';
import { MetaService } from '../../core/services/meta.service';
import { ListingFeeQuote } from '../../core/models/listing-fee.model';
import { CheckoutPage } from './checkout.page';

describe('CheckoutPage — one more listing', () => {
  function setup(params: Record<string, string>, data: Record<string, unknown> = {}) {
    const api = jasmine.createSpyObj<ListingFeesApiService>('ListingFeesApiService', ['request']);
    TestBed.configureTestingModule({
      imports: [CheckoutPage, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: ListingFeesApiService, useValue: api },
        { provide: MetaService, useValue: jasmine.createSpyObj('MetaService', ['setMeta']) },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: (k: string) => params[k] ?? null }, data } } }
      ]
    });
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    const fixture = TestBed.createComponent(CheckoutPage);
    fixture.detectChanges();
    return { api, navigate, fixture, page: fixture.componentInstance };
  }

  it('/checkout/extra-listing (kind من بيانات المسار، بلا معرّف عقار) يعرض الطلب ولا يعيد التوجيه', () => {
    const { navigate, page } = setup({}, { kind: 'extra-listing' });

    expect(navigate).not.toHaveBeenCalled();
    expect(page.preview()?.kind).toBe('extra-listing');
    expect(page.preview()?.amountUsd).toBe(1);
    expect(page.backLink()).toBe('/my-listings');
  });

  it('التأكيد يسجّل الطلب ويعرض رقمه مرجعاً للدفع', () => {
    const { api, page } = setup({}, { kind: 'extra-listing' });
    const quote = { kind: 'extra-listing', transactionId: 'req-1', propertyId: '', amountUsd: 1, days: 30, isExistingPendingFee: false } as ListingFeeQuote;
    api.request.and.returnValue(of(quote));

    page.confirm();

    expect(api.request).toHaveBeenCalledWith('extra-listing', '');
    expect(page.quote()?.transactionId).toBe('req-1');
    expect(page.isRecorded()).toBeTrue();
  });

  it('رسوم التمييز ما زالت تحتاج معرّف عقار: بدونه يعود إلى الرئيسية', () => {
    const { navigate } = setup({ kind: 'featured' });

    expect(navigate).toHaveBeenCalledWith(['/home']);
  });

  it('رسوم التمييز مع معرّف عقار: الرجوع إلى نموذج العقار كما كان', () => {
    const { navigate, page } = setup({ kind: 'featured', propertyId: 'p1' });

    expect(navigate).not.toHaveBeenCalled();
    expect(page.backLink()).toBe('/property-form');
  });
});
