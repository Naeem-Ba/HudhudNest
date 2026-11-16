import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AgenciesApiService } from '../../core/api/agencies-api.service';
import { Agency } from '../../core/models/agency.model';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { Observable, BehaviorSubject, of, throwError } from 'rxjs';

import { ListingFeesApiService } from '../../core/api/listing-fees-api.service';
import { PlansApiService } from '../../core/api/plans-api.service';
import { ProfileService } from '../../core/api/profile.service';
import { PropertyApiService } from '../../core/api/property-api.service';
import { ShortStayListingApiService } from '../../core/api/short-stay-listing-api.service';
import { Property } from '../../core/models/property.model';
import { ToastService } from '../../shared/services/toast.service';
import { MyListingsPage } from './my-listings.page';

// The publisher's office (branch picker / "add to my office"); none by default.
let agenciesApi: { getMine: () => Observable<Partial<Agency> | null> } = { getMine: () => of(null) };

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
        { provide: AgenciesApiService, useValue: agenciesApi },
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

describe('MyListingsPage — listing status (QA Phase 7, P7-D08)', () => {
  let fixture: ComponentFixture<MyListingsPage>;
  let propertyApi: jasmine.SpyObj<PropertyApiService>;
  let toast: jasmine.SpyObj<ToastService>;

  function setup(listings: Property[], updateStatus: () => unknown = () => of({})): void {
    propertyApi = jasmine.createSpyObj('PropertyApiService', ['getMyProperties', 'updateStatus']);
    propertyApi.getMyProperties.and.returnValue(of(listings));
    propertyApi.updateStatus.and.callFake(updateStatus as never);
    const feesApi = jasmine.createSpyObj('ListingFeesApiService', ['getMyPendingFeatured']);
    feesApi.getMyPendingFeatured.and.returnValue(of([]));
    const shortStay = jasmine.createSpyObj('ShortStayListingApiService', ['getMine']);
    shortStay.getMine.and.returnValue(of([]));
    toast = jasmine.createSpyObj('ToastService', ['show', 'success', 'error']);

    TestBed.configureTestingModule({
      imports: [MyListingsPage, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: ListingFeesApiService, useValue: feesApi },
        { provide: PropertyApiService, useValue: propertyApi },
        { provide: AgenciesApiService, useValue: agenciesApi },
        { provide: ShortStayListingApiService, useValue: shortStay },
        { provide: ProfileService, useValue: { profile$: new BehaviorSubject(null) } },
        { provide: PlansApiService, useValue: jasmine.createSpyObj('PlansApiService', ['getPlans']) },
        { provide: ToastService, useValue: toast }
      ]
    });

    fixture = TestBed.createComponent(MyListingsPage);
    fixture.detectChanges();
  }

  function select(id: string): HTMLSelectElement {
    return (fixture.nativeElement as HTMLElement).querySelector<HTMLSelectElement>(`#status-${id}`)!;
  }

  function choose(id: string, value: string): void {
    const el = select(id);
    el.value = value;
    el.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  it('offers the five owner statuses and preselects the current one', () => {
    setup([listing('p1', { status: 'Reserved' })]);

    const options = Array.from(select('p1').options).map(o => o.value);
    expect(options).toEqual(['Available', 'Reserved', 'Sold', 'Rented', 'Archived']);
    expect(select('p1').value).toBe('Reserved');
  });

  it('a draft and an expired listing have no status control', () => {
    setup([listing('draft', { isPublished: false }), listing('old', { status: 'Expired' })]);

    expect(select('draft')).toBeNull();
    expect(select('old')).toBeNull();
  });

  it('Reserved is applied without a question and updates the card', () => {
    setup([listing('p1')]);
    const ask = spyOn(window, 'confirm');

    choose('p1', 'Reserved');

    expect(ask).not.toHaveBeenCalled();
    expect(propertyApi.updateStatus).toHaveBeenCalledWith('p1', 'Reserved');
    expect(fixture.componentInstance.listings()[0].status).toBe('Reserved');
    expect(toast.show).toHaveBeenCalledWith('LISTING_STATUS.CHANGED', 'success');
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="status-tag"]')).not.toBeNull();
  });

  it('Sold asks first; declining leaves the status and the dropdown as they were', () => {
    setup([listing('p1')]);
    spyOn(window, 'confirm').and.returnValue(false);

    choose('p1', 'Sold');

    expect(propertyApi.updateStatus).not.toHaveBeenCalled();
    expect(select('p1').value).toBe('Available');
    expect(fixture.componentInstance.listings()[0].status).toBe('Available');
  });

  it('Sold confirmed is sent, and a failed save restores the dropdown and says so', () => {
    setup([listing('p1')], () => throwError(() => new Error('boom')));
    spyOn(window, 'confirm').and.returnValue(true);

    choose('p1', 'Archived');

    expect(propertyApi.updateStatus).toHaveBeenCalledWith('p1', 'Archived');
    expect(select('p1').value).toBe('Available');
    expect(fixture.componentInstance.listings()[0].status).toBe('Available');
    expect(toast.show).toHaveBeenCalledWith('LISTING_STATUS.CHANGE_ERROR', 'error');
  });

  it('sold and rented listings do not count against the plan quota, reserved ones do', () => {
    setup([listing('a'), listing('b', { status: 'Reserved' }), listing('c', { status: 'Sold' }), listing('d', { status: 'Rented' })]);

    expect(fixture.componentInstance.activePropertiesCount()).toBe(2);
  });

  describe('QA Phase 8: extension and administrative take-down', () => {
    const soon = new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString();

    it('offers extension to a live listing that is about to expire and to an expired one', () => {
      setup([listing('soon', { expiresAt: soon }), listing('old', { status: 'Expired' })]);

      expect(fixture.componentInstance.canExtend(fixture.componentInstance.listings()[0])).toBeTrue();
      expect(fixture.componentInstance.canExtend(fixture.componentInstance.listings()[1])).toBeTrue();
    });

    it('never offers extension for a sold, rented or archived listing (the server answers 409)', () => {
      setup([
        listing('s', { status: 'Sold', expiresAt: soon }),
        listing('r', { status: 'Rented', expiresAt: soon }),
        listing('a', { status: 'Archived', expiresAt: soon })
      ]);

      for (const p of fixture.componentInstance.listings()) {
        expect(fixture.componentInstance.canExtend(p)).withContext(p.id ?? '').toBeFalse();
      }
    });

    it('a taken-down listing shows the reason, and offers neither publish nor extend', () => {
      setup([listing('t', { isPublished: false, isTakenDown: true, takenDownReason: 'صور لا تخص العقار', expiresAt: soon })]);

      const note = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="taken-down-note"]');
      expect(note).not.toBeNull();
      expect(note!.textContent).toContain('MY_LISTINGS.TAKEN_DOWN');
      expect(fixture.componentInstance.canExtend(fixture.componentInstance.listings()[0])).toBeFalse();
      expect(fixture.componentInstance.canPublish(fixture.componentInstance.listings()[0])).toBeFalse();
      expect((fixture.nativeElement as HTMLElement).querySelector('.btn--publish')).toBeNull();
    });

    it('an ordinary draft can still be published', () => {
      setup([listing('d', { isPublished: false })]);

      expect(fixture.componentInstance.canPublish(fixture.componentInstance.listings()[0])).toBeTrue();
    });
  });
});

describe('MyListingsPage — hide / show (P8-D06a)', () => {
  let fixture: ComponentFixture<MyListingsPage>;
  let propertyApi: jasmine.SpyObj<PropertyApiService>;
  let toast: jasmine.SpyObj<ToastService>;

  function setup(listings: Property[], hideFails = false): void {
    propertyApi = jasmine.createSpyObj('PropertyApiService', ['getMyProperties', 'unpublishProperty', 'publishProperty']);
    propertyApi.getMyProperties.and.returnValue(of(listings));
    propertyApi.unpublishProperty.and.returnValue(hideFails ? throwError(() => new Error('boom')) : of(undefined));
    propertyApi.publishProperty.and.returnValue(of(undefined));
    const shortStay = jasmine.createSpyObj('ShortStayListingApiService', ['getMine']);
    shortStay.getMine.and.returnValue(of([]));
    const feesApi = jasmine.createSpyObj('ListingFeesApiService', ['getMyPendingFeatured']);
    feesApi.getMyPendingFeatured.and.returnValue(of([]));
    toast = jasmine.createSpyObj('ToastService', ['show', 'success', 'error']);

    TestBed.configureTestingModule({
      imports: [MyListingsPage, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: ListingFeesApiService, useValue: feesApi },
        { provide: PropertyApiService, useValue: propertyApi },
        { provide: AgenciesApiService, useValue: agenciesApi },
        { provide: ShortStayListingApiService, useValue: shortStay },
        { provide: ProfileService, useValue: { profile$: new BehaviorSubject(null) } },
        { provide: PlansApiService, useValue: jasmine.createSpyObj('PlansApiService', ['getPlans']) },
        { provide: ToastService, useValue: toast }
      ]
    });

    fixture = TestBed.createComponent(MyListingsPage);
    fixture.detectChanges();
  }

  const el = () => fixture.nativeElement as HTMLElement;

  it('a published listing offers Hide; a draft, an expired and a taken-down listing do not', () => {
    setup([
      listing('live'),
      listing('draft', { isPublished: false }),
      listing('old', { status: 'Expired', isPublished: false }),
      listing('down', { isPublished: false, isTakenDown: true })
    ]);

    expect(el().querySelectorAll('.btn--hide').length).toBe(1);
  });

  it('hiding calls the API, flips the card to a publishable one and tells the owner', () => {
    setup([listing('live')]);

    fixture.componentInstance.hide('live');
    fixture.detectChanges();

    expect(propertyApi.unpublishProperty).toHaveBeenCalledOnceWith('live');
    expect(fixture.componentInstance.listings()[0].isPublished).toBeFalse();
    expect(fixture.componentInstance.canPublish(fixture.componentInstance.listings()[0])).toBeTrue();
    expect(fixture.componentInstance.canHide(fixture.componentInstance.listings()[0])).toBeFalse();
    expect(toast.show).toHaveBeenCalledWith('MY_LISTINGS.HIDE_SUCCESS', 'success');
  });

  it('a failed hide keeps the listing published and shows the error', () => {
    setup([listing('live')], true);

    fixture.componentInstance.hide('live');

    expect(fixture.componentInstance.listings()[0].isPublished).toBeTrue();
    expect(toast.show).toHaveBeenCalledWith('MY_LISTINGS.HIDE_ERROR', 'error');
    expect(fixture.componentInstance.hidingId()).toBeNull();
  });
});

describe('MyListingsPage — adding older listings to my office (offices P4)', () => {
  let fixture: ComponentFixture<MyListingsPage>;
  let propertyApi: jasmine.SpyObj<PropertyApiService>;
  let toast: jasmine.SpyObj<ToastService>;

  afterEach(() => { agenciesApi = { getMine: () => of(null) }; });

  function setup(listings: Property[], office: Partial<Agency> | null, linkResult = of(undefined as void)): void {
    agenciesApi = { getMine: () => of(office) };
    propertyApi = jasmine.createSpyObj('PropertyApiService', ['getMyProperties', 'linkPropertyToOffice']);
    propertyApi.getMyProperties.and.returnValue(of(listings));
    propertyApi.linkPropertyToOffice.and.returnValue(linkResult);
    const shortStay = jasmine.createSpyObj('ShortStayListingApiService', ['getMine']);
    shortStay.getMine.and.returnValue(of([]));
    const feesApi = jasmine.createSpyObj('ListingFeesApiService', ['getMyPendingFeatured']);
    feesApi.getMyPendingFeatured.and.returnValue(of([]));
    toast = jasmine.createSpyObj('ToastService', ['show', 'success', 'error']);

    TestBed.configureTestingModule({
      imports: [MyListingsPage, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: ListingFeesApiService, useValue: feesApi },
        { provide: PropertyApiService, useValue: propertyApi },
        { provide: AgenciesApiService, useValue: agenciesApi },
        { provide: ShortStayListingApiService, useValue: shortStay },
        { provide: ProfileService, useValue: { profile$: new BehaviorSubject(null) } },
        { provide: PlansApiService, useValue: jasmine.createSpyObj('PlansApiService', ['getPlans']) },
        { provide: ToastService, useValue: toast }
      ]
    });

    fixture = TestBed.createComponent(MyListingsPage);
    fixture.detectChanges();
  }

  const buttons = () => (fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="link-to-office"]');

  it('offers the action only on listings without an office, and only to an office member', () => {
    setup([listing('old'), listing('mine', { agencyId: 'o1' })], { id: 'o1', name: 'Office' });
    expect(buttons().length).toBe(1);
    expect(fixture.componentInstance.canLinkToOffice(fixture.componentInstance.listings()[1])).toBeFalse();
  });

  it('shows nothing to someone outside any office', () => {
    setup([listing('old')], null);
    expect(buttons().length).toBe(0);
  });

  it('asks first, then links the listing and marks it as the office\'s', () => {
    setup([listing('old')], { id: 'o1', name: 'Office' });
    spyOn(window, 'confirm').and.returnValue(true);

    fixture.componentInstance.linkToOffice(fixture.componentInstance.listings()[0]);
    fixture.detectChanges();

    expect(propertyApi.linkPropertyToOffice).toHaveBeenCalledOnceWith('old');
    expect(fixture.componentInstance.listings()[0].agencyId).toBe('o1');
    expect(buttons().length).toBe(0);
    expect(toast.show).toHaveBeenCalledWith('MY_LISTINGS.OFFICE_LINK.DONE', 'success');
  });

  it('does nothing when the confirmation is declined', () => {
    setup([listing('old')], { id: 'o1', name: 'Office' });
    spyOn(window, 'confirm').and.returnValue(false);

    fixture.componentInstance.linkToOffice(fixture.componentInstance.listings()[0]);

    expect(propertyApi.linkPropertyToOffice).not.toHaveBeenCalled();
  });

  it('explains a full office quota and keeps the listing as it was', () => {
    setup([listing('old')], { id: 'o1', name: 'Office' },
      throwError(() => ({ status: 409, error: { code: 'LISTING_QUOTA_REACHED' } })));
    spyOn(window, 'confirm').and.returnValue(true);

    fixture.componentInstance.linkToOffice(fixture.componentInstance.listings()[0]);

    expect(fixture.componentInstance.listings()[0].agencyId).toBeUndefined();
    expect(toast.show).toHaveBeenCalledWith('MY_LISTINGS.OFFICE_LINK.QUOTA', 'error');
    expect(fixture.componentInstance.linkingId()).toBeNull();
  });
});
