import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { ListingFeesApiService } from '../../core/api/listing-fees-api.service';
import { PlansApiService } from '../../core/api/plans-api.service';
import { ProfileService } from '../../core/api/profile.service';
import { PropertyApiService } from '../../core/api/property-api.service';
import { ShortStayListingApiService } from '../../core/api/short-stay-listing-api.service';
import { Property } from '../../core/models/property.model';
import { ToastService } from '../../shared/services/toast.service';
import { MyListingsPage } from './my-listings.page';

function listing(id: string, extra: Partial<Property> = {}): Property {
  return { id, title: `Listing ${id}`, isPublished: true, status: 'Available', ...extra } as Property;
}

describe('MyListingsPage — featuring', () => {
  let fixture: ComponentFixture<MyListingsPage>;
  let feesApi: jasmine.SpyObj<ListingFeesApiService>;

  function setup(listings: Property[], pending: { propertyId: string }[] = [], pendingFails = false): void {
    feesApi = jasmine.createSpyObj('ListingFeesApiService', ['getMyPendingFeatured']);
    feesApi.getMyPendingFeatured.and.returnValue(
      pendingFails
        ? throwError(() => new Error('boom'))
        : of(pending.map(p => ({ transactionId: 't', amountUsd: 10, featuredDays: 30, requestedAt: '', ...p })))
    );

    const propertyApi = jasmine.createSpyObj('PropertyApiService', ['getMyProperties']);
    propertyApi.getMyProperties.and.returnValue(of(listings));
    const shortStay = jasmine.createSpyObj('ShortStayListingApiService', ['getMine']);
    shortStay.getMine.and.returnValue(of([]));

    TestBed.configureTestingModule({
      imports: [MyListingsPage, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: ListingFeesApiService, useValue: feesApi },
        { provide: PropertyApiService, useValue: propertyApi },
        { provide: ShortStayListingApiService, useValue: shortStay },
        { provide: ProfileService, useValue: { profile$: new BehaviorSubject(null) } },
        { provide: PlansApiService, useValue: jasmine.createSpyObj('PlansApiService', ['getPlans']) },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['show', 'success', 'error']) }
      ]
    });

    fixture = TestBed.createComponent(MyListingsPage);
    fixture.detectChanges();
  }

  const el = () => fixture.nativeElement as HTMLElement;

  it('إعلان منشور: يظهر رابط طلب التمييز إلى صفحة الدفع الحالية', () => {
    setup([listing('p1')]);

    const link = el().querySelector<HTMLAnchorElement>('[data-testid="feature-link"]');
    expect(link).not.toBeNull();
    expect(link!.getAttribute('href')).toBe('/checkout/featured/p1');
  });

  it('إعلان مسودة أو منتهٍ: لا رابط تمييز', () => {
    setup([
      listing('draft', { isPublished: false, status: 'Draft' }),
      listing('old', { status: 'Expired' })
    ]);

    expect(el().querySelector('[data-testid="feature-link"]')).toBeNull();
  });

  it('طلب تمييز معلّق: ملاحظة «بانتظار تأكيد الدفع» بدل الرابط، دون ادّعاء أن الإعلان مميّز', () => {
    setup([listing('p1'), listing('p2')], [{ propertyId: 'p1' }]);

    expect(el().querySelectorAll('[data-testid="featured-pending"]').length).toBe(1);
    expect(el().querySelectorAll('[data-testid="feature-link"]').length).toBe(1);
    expect(fixture.componentInstance.hasPendingFeatured(listing('p1'))).toBeTrue();
    expect(fixture.componentInstance.hasPendingFeatured(listing('p2'))).toBeFalse();
  });

  it('فشل جلب الطلبات المعلّقة لا يكسر الصفحة ويُبقي زر الطلب (إعادة الطلب آمنة)', () => {
    setup([listing('p1')], [], true);

    expect(el().querySelector('[data-testid="feature-link"]')).not.toBeNull();
  });
});
