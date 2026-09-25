import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';

import { ShortStayListingFormPage, toApiTime } from './short-stay-listing-form.page';
import { ShortStayListingApiService } from '../../../core/api/short-stay-listing-api.service';
import { LookupsApiService } from '../../../core/api/lookups-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/services/toast.service';

describe('ShortStayListingFormPage — local validation before POST', () => {
  let page: ShortStayListingFormPage;
  let api: jasmine.SpyObj<ShortStayListingApiService>;
  let toast: jasmine.SpyObj<ToastService>;

  beforeEach(() => {
    api = jasmine.createSpyObj('ShortStayListingApiService', ['getAccommodationTypes', 'create', 'update', 'setAmenities']);
    api.getAccommodationTypes.and.returnValue(of([]));
    api.create.and.returnValue(of({ id: 'new' } as never));
    toast = jasmine.createSpyObj('ToastService', ['show']);

    TestBed.configureTestingModule({
      imports: [ShortStayListingFormPage, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: ShortStayListingApiService, useValue: api },
        { provide: LookupsApiService, useValue: { getAmenities: () => of([]) } },
        { provide: AuthService, useValue: {} },
        { provide: ToastService, useValue: toast },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({}) } } }
      ]
    });

    page = TestBed.createComponent(ShortStayListingFormPage).componentInstance;
    page.ngOnInit();
    page.accommodationTypeId = 1;
    page.title = 'شاليه';
    page.description = 'وصف';
    page.defaultBasePricePerNight = 50;
  });

  it('sends currencyCode with a valid form', () => {
    page.currencyCode = 'USD';
    page.createListing();

    expect(api.create).toHaveBeenCalledWith(jasmine.objectContaining({ currencyCode: 'USD', defaultBasePricePerNight: 50 }));
    expect(toast.show).not.toHaveBeenCalledWith(jasmine.anything(), 'error');
  });

  it('sends check-in/out as HH:mm:ss — the API rejects the bare HH:mm a time input produces', () => {
    page.checkInTime = '14:00';
    page.checkOutTime = '11:30';
    page.createListing();

    expect(api.create).toHaveBeenCalledWith(jasmine.objectContaining({ checkInTime: '14:00:00', checkOutTime: '11:30:00' }));
  });

  it('marks the form as submitted and highlights instead of posting when a time is cleared', () => {
    page.checkOutTime = '';
    page.createListing();

    expect(page.submitAttempted()).toBeTrue();
    expect(api.create).not.toHaveBeenCalled();
  });

  const cases: Array<[string, () => void, string]> = [
    ['empty title', () => { page.title = '  '; }, 'SHORTSTAY.FORM.ERR_TITLE'],
    ['empty description', () => { page.description = ''; }, 'SHORTSTAY.FORM.ERR_DESCRIPTION'],
    ['cleared guests (null)', () => { (page as { capacity: number | null }).capacity = null; }, 'SHORTSTAY.FORM.ERR_CAPACITY'],
    ['zero guests', () => { page.capacity = 0; }, 'SHORTSTAY.FORM.ERR_CAPACITY'],
    ['cleared bedrooms', () => { (page as { bedrooms: number | null }).bedrooms = null; }, 'SHORTSTAY.FORM.ERR_BEDROOMS'],
    ['cleared bathrooms', () => { (page as { bathrooms: number | null }).bathrooms = null; }, 'SHORTSTAY.FORM.ERR_BATHROOMS'],
    ['cleared check-in time', () => { page.checkInTime = ''; }, 'SHORTSTAY.FORM.ERR_TIMES'],
    ['cleared latitude', () => { (page as { latitude: number | null }).latitude = null; }, 'SHORTSTAY.FORM.ERR_LOCATION']
  ];

  cases.forEach(([name, mutate, key]) => {
    it(`blocks the request and names the problem: ${name}`, () => {
      mutate();
      page.createListing();

      expect(api.create).not.toHaveBeenCalled();
      expect(toast.show).toHaveBeenCalledWith(key, 'error');
    });
  });
});

describe('ShortStayListingFormPage — photos picked on the create form', () => {
  let page: ShortStayListingFormPage;
  let api: jasmine.SpyObj<ShortStayListingApiService>;
  let toast: jasmine.SpyObj<ToastService>;
  let navigate: jasmine.Spy;

  const png = (name = 'a.png', size = 1000) => new File([new Uint8Array(size)], name, { type: 'image/png' });
  const pick = (...files: File[]) => page.onPendingPhotosSelected({ target: { files, value: 'x' } } as unknown as Event);

  beforeEach(() => {
    api = jasmine.createSpyObj('ShortStayListingApiService', ['getAccommodationTypes', 'create', 'uploadPhotos']);
    api.getAccommodationTypes.and.returnValue(of([]));
    api.create.and.returnValue(of({ id: 'new-id' } as never));
    api.uploadPhotos.and.returnValue(of(['https://cdn/a.png']));
    toast = jasmine.createSpyObj('ToastService', ['show']);

    TestBed.configureTestingModule({
      imports: [ShortStayListingFormPage, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: ShortStayListingApiService, useValue: api },
        { provide: LookupsApiService, useValue: { getAmenities: () => of([]) } },
        { provide: AuthService, useValue: {} },
        { provide: ToastService, useValue: toast },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({}) } } }
      ]
    });

    navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    page = TestBed.createComponent(ShortStayListingFormPage).componentInstance;
    page.ngOnInit();
    page.accommodationTypeId = 1;
    page.title = 'شاليه';
    page.description = 'وصف';
    page.defaultBasePricePerNight = 50;
  });

  it('uploads the picked photos to the NEW listing right after it is created, then opens it', () => {
    const a = png('a.png');
    const b = png('b.png');
    pick(a, b);
    page.createListing();

    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.uploadPhotos).toHaveBeenCalledWith('new-id', [a, b]);
    expect(navigate).toHaveBeenCalledWith(['/short-stay/manage', 'new-id']);
    expect(page.saving()).toBeFalse();
  });

  it('does not call the photo endpoint when no photos were picked', () => {
    page.createListing();

    expect(api.uploadPhotos).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/short-stay/manage', 'new-id']);
  });

  it('a failed upload never looks like a failed create: the user still lands on the listing with a clear message', () => {
    api.uploadPhotos.and.returnValue(throwError(() => ({ status: 500 })));
    pick(png());
    page.createListing();

    expect(api.create).toHaveBeenCalledTimes(1);
    expect(toast.show).toHaveBeenCalledWith('SHORTSTAY.FORM.CREATED_PHOTOS_FAILED', 'error');
    expect(navigate).toHaveBeenCalledWith(['/short-stay/manage', 'new-id']);
    expect(page.saving()).toBeFalse();
  });

  it('rejects unsupported types and oversized files with the file name, keeping the valid ones', () => {
    const ok = png('ok.png');
    pick(new File(['x'], 'doc.pdf', { type: 'application/pdf' }), png('big.png', 5 * 1024 * 1024 + 1), ok);

    expect(page.pendingPhotos().map(p => p.file)).toEqual([ok]);
    expect(toast.show).toHaveBeenCalledWith('SHORTSTAY.FORM.PHOTO_INVALID_TYPE', 'error');
    expect(toast.show).toHaveBeenCalledWith('SHORTSTAY.FORM.PHOTO_TOO_LARGE', 'error');
  });

  it('caps the selection at 10 photos and lets the user remove one', () => {
    pick(...Array.from({ length: 12 }, (_, i) => png(`p${i}.png`)));

    expect(page.pendingPhotos().length).toBe(10);
    expect(toast.show).toHaveBeenCalledWith('SHORTSTAY.FORM.PHOTO_LIMIT', 'error');

    page.removePendingPhoto(0);
    expect(page.pendingPhotos().length).toBe(9);
  });
});

describe('toApiTime', () => {
  it('pads HH:mm, keeps HH:mm:ss and maps empty to null', () => {
    expect(toApiTime('14:00')).toBe('14:00:00');
    expect(toApiTime('09:05:30')).toBe('09:05:30');
    expect(toApiTime('')).toBeNull();
    expect(toApiTime('  ')).toBeNull();
    expect(toApiTime(null)).toBeNull();
    expect(toApiTime(undefined)).toBeNull();
  });
});

describe('ShortStayListingFormPage — edit mode times', () => {
  let page: ShortStayListingFormPage;
  let api: jasmine.SpyObj<ShortStayListingApiService>;
  let toast: jasmine.SpyObj<ToastService>;

  beforeEach(() => {
    api = jasmine.createSpyObj('ShortStayListingApiService', ['getById', 'update', 'setAmenities', 'setPricingRules']);
    api.getById.and.returnValue(of({
      id: 'l1', currencyCode: 'SYP', title: 't', description: 'd', capacity: 2, bedrooms: 1, bathrooms: 1,
      checkInTime: '14:00:00', checkOutTime: '11:00:00', selfCheckInEnabled: false, instantBookingEnabled: true,
      requestBookingEnabled: false, latitude: 1, longitude: 2, city: null, locationVisibility: 'Exact',
      governorateId: null, districtId: null, neighborhoodId: null, poolType: null, poolLocation: null,
      poolIsSeasonal: null, poolIsHeated: null, cleaningFee: 0, extraGuestFee: 0, extraBedFee: 0,
      allowsSmoking: false, allowsParties: false, allowsPets: false, quietHoursStart: null, quietHoursEnd: null,
      customRulesText: null, cancellationFreeCancellationDays: 3, cancellationDepositRefundable: true,
      cancellationCustomTermsText: null, depositPercentage: null, amenityIds: [], roomTypes: [], photoUrls: [],
      isPublished: false
    } as never));
    api.update.and.returnValue(of({} as never));
    api.setAmenities.and.returnValue(of(undefined as never));
    toast = jasmine.createSpyObj('ToastService', ['show']);

    TestBed.configureTestingModule({
      imports: [ShortStayListingFormPage, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: ShortStayListingApiService, useValue: api },
        { provide: LookupsApiService, useValue: { getAmenities: () => of([]) } },
        { provide: AuthService, useValue: {} },
        { provide: ToastService, useValue: toast },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'l1' }) } } }
      ]
    });

    page = TestBed.createComponent(ShortStayListingFormPage).componentInstance;
    page.ngOnInit();
  });

  it('round-trips saved times as HH:mm:ss and sends empty quiet hours as null (never "")', () => {
    page.saveChanges();

    expect(api.update).toHaveBeenCalledWith('l1', jasmine.objectContaining({
      checkInTime: '14:00:00', checkOutTime: '11:00:00', quietHoursStart: null, quietHoursEnd: null
    }));
  });

  it('sends quiet hours as HH:mm:ss when both are set', () => {
    page.quietHoursStart = '22:00';
    page.quietHoursEnd = '07:00';
    page.saveChanges();

    expect(api.update).toHaveBeenCalledWith('l1', jasmine.objectContaining({
      quietHoursStart: '22:00:00', quietHoursEnd: '07:00:00'
    }));
  });

  it('blocks a half-filled quiet-hours pair and says why', () => {
    page.quietHoursStart = '22:00';
    page.quietHoursEnd = '';
    page.saveChanges();

    expect(api.update).not.toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalledWith('SHORTSTAY.FORM.ERR_QUIET_HOURS', 'error');
  });
});
