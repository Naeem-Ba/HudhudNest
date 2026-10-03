import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';

import { ShortStayListingFormPage, cityMapFor, toApiTime } from './short-stay-listing-form.page';
import { ShortStayListingApiService } from '../../../core/api/short-stay-listing-api.service';
import { LookupsApiService } from '../../../core/api/lookups-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/services/toast.service';

/** Catalog stub: Damascus (id 3) has one district (30) which has one neighborhood (300). */
const lookupsStub = () => ({
  getAmenities: () => of([]),
  getGovernorates: () => of([{ id: 3, nameAr: 'دمشق', nameEn: 'Damascus' }]),
  getDistricts: jasmine.createSpy('getDistricts').and.returnValue(of([{ id: 30, nameAr: 'المزة', nameEn: 'Mezzeh' }])),
  getNeighborhoods: jasmine.createSpy('getNeighborhoods').and.returnValue(of([{ id: 300, nameAr: 'الجادات', nameEn: 'Jadat' }]))
});

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
        { provide: LookupsApiService, useValue: lookupsStub() },
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
    page.governorateId = 3;
    page.setPin(33.5138, 36.2765);
  });

  it('sends the structured location and the pin with the create request', () => {
    page.districtId = 30;
    page.neighborhoodId = 300;
    page.locationVisibility = 'Approximate';
    page.createListing();

    expect(api.create).toHaveBeenCalledWith(jasmine.objectContaining({
      latitude: 33.5138, longitude: 36.2765, governorateId: 3, districtId: 30, neighborhoodId: 300,
      locationVisibility: 'Approximate'
    }));
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
    ['no governorate', () => { page.governorateId = null; }, 'SHORTSTAY.FORM.ERR_GOVERNORATE'],
    ['no pin on the map', () => { page.setPin(null, null); }, 'SHORTSTAY.FORM.ERR_PIN']
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
        { provide: LookupsApiService, useValue: lookupsStub() },
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
    page.governorateId = 3;
    page.setPin(33.5138, 36.2765);
  });

  it('uploads the picked photos to the NEW listing right after it is created, then opens it', async () => {
    const a = png('a.png');
    const b = png('b.png');
    await pick(a, b);
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

  it('a failed upload never looks like a failed create: the user still lands on the listing with a clear message', async () => {
    api.uploadPhotos.and.returnValue(throwError(() => ({ status: 500 })));
    await pick(png());
    page.createListing();

    expect(api.create).toHaveBeenCalledTimes(1);
    expect(toast.show).toHaveBeenCalledWith('SHORTSTAY.FORM.CREATED_PHOTOS_FAILED', 'error');
    expect(navigate).toHaveBeenCalledWith(['/short-stay/manage', 'new-id']);
    expect(page.saving()).toBeFalse();
  });

  it('rejects unsupported types and oversized files with the file name, keeping the valid ones', async () => {
    const ok = png('ok.png');
    // 5,000,001 bytes of zeros cannot be decoded, so shrinking leaves it oversized and it is refused (server cap is 5,000,000).
    await pick(new File(['x'], 'doc.pdf', { type: 'application/pdf' }), png('big.png', 5_000_001), ok);

    expect(page.pendingPhotos().map(p => p.file)).toEqual([ok]);
    expect(toast.show).toHaveBeenCalledWith('SHORTSTAY.FORM.PHOTO_INVALID_TYPE', 'error');
    expect(toast.show).toHaveBeenCalledWith('SHORTSTAY.FORM.PHOTO_TOO_LARGE', 'error');
  });

  it('caps the selection at 10 photos and lets the user remove one', async () => {
    await pick(...Array.from({ length: 12 }, (_, i) => png(`p${i}.png`)));

    expect(page.pendingPhotos().length).toBe(10);
    expect(toast.show).toHaveBeenCalledWith('SHORTSTAY.FORM.PHOTO_LIMIT', 'error');

    page.removePendingPhoto(0);
    expect(page.pendingPhotos().length).toBe(9);
  });

  it('shrinks a camera-sized photo instead of rejecting it, and keeps it as a jpeg under the ceiling', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 3000;
    canvas.height = 2000;
    const context = canvas.getContext('2d')!;
    const pixels = context.createImageData(canvas.width, canvas.height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      pixels.data[i] = Math.random() * 256;
      pixels.data[i + 1] = Math.random() * 256;
      pixels.data[i + 2] = Math.random() * 256;
      pixels.data[i + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    const blob = await new Promise<Blob>(resolve => canvas.toBlob(b => resolve(b!), 'image/jpeg', 0.98));
    const camera = new File([blob], 'IMG_1234.jpg', { type: 'image/jpeg' });
    expect(camera.size).toBeGreaterThan(5_000_000);

    await pick(camera);

    const [accepted] = page.pendingPhotos();
    expect(page.pendingPhotos().length).toBe(1);
    expect(accepted.file.size).toBeLessThanOrEqual(1_800_000);
    expect(accepted.file.type).toBe('image/jpeg');
    expect(toast.show).not.toHaveBeenCalledWith('SHORTSTAY.FORM.PHOTO_TOO_LARGE', 'error');
  }, 30000);
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
      requestBookingEnabled: false, latitude: 33.5, longitude: 36.3, city: 'دمشق', locationVisibility: 'Exact',
      governorateId: 3, districtId: 30, neighborhoodId: null, poolType: null, poolLocation: null,
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
        { provide: LookupsApiService, useValue: lookupsStub() },
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

describe('ShortStayListingFormPage — location', () => {
  let page: ShortStayListingFormPage;
  let api: jasmine.SpyObj<ShortStayListingApiService>;
  let toast: jasmine.SpyObj<ToastService>;
  let lookups: ReturnType<typeof lookupsStub>;

  const listing = (over: Record<string, unknown> = {}) => ({
    id: 'l1', currencyCode: 'SYP', title: 't', description: 'd', capacity: 2, bedrooms: 1, bathrooms: 1,
    checkInTime: '14:00:00', checkOutTime: '11:00:00', selfCheckInEnabled: false, instantBookingEnabled: true,
    requestBookingEnabled: false, latitude: null, longitude: null, city: null, locationVisibility: 'Exact',
    governorateId: null, districtId: null, neighborhoodId: null, poolType: null, poolLocation: null,
    poolIsSeasonal: null, poolIsHeated: null, cleaningFee: 0, extraGuestFee: 0, extraBedFee: 0,
    allowsSmoking: false, allowsParties: false, allowsPets: false, quietHoursStart: null, quietHoursEnd: null,
    customRulesText: null, cancellationFreeCancellationDays: 3, cancellationDepositRefundable: true,
    cancellationCustomTermsText: null, depositPercentage: null, amenityIds: [], roomTypes: [], photoUrls: [],
    isPublished: false, ...over
  });

  const setup = (id: string | null, loaded?: Record<string, unknown>) => {
    api = jasmine.createSpyObj('ShortStayListingApiService',
      ['getAccommodationTypes', 'getById', 'update', 'setAmenities', 'publish', 'unpublish']);
    api.getAccommodationTypes.and.returnValue(of([]));
    api.getById.and.returnValue(of(listing(loaded) as never));
    api.update.and.returnValue(of({} as never));
    api.setAmenities.and.returnValue(of(undefined as never));
    api.publish.and.returnValue(of(undefined as never));
    toast = jasmine.createSpyObj('ToastService', ['show']);
    lookups = lookupsStub();

    TestBed.configureTestingModule({
      imports: [ShortStayListingFormPage, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: ShortStayListingApiService, useValue: api },
        { provide: LookupsApiService, useValue: lookups },
        { provide: AuthService, useValue: {} },
        { provide: ToastService, useValue: toast },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap(id ? { id } : {}) } } }
      ]
    });

    page = TestBed.createComponent(ShortStayListingFormPage).componentInstance;
    page.ngOnInit();
  };

  it('loads the governorates and cascades districts then neighborhoods, clearing children on change', () => {
    setup(null);
    expect(page.governorates().length).toBe(1);

    page.onGovernorateChange(3);
    expect(lookups.getDistricts).toHaveBeenCalledWith(3);
    expect(page.districts().length).toBe(1);

    page.onDistrictChange(30);
    expect(lookups.getNeighborhoods).toHaveBeenCalledWith(30);
    page.neighborhoodId = 300;

    page.onDistrictChange(null);
    expect(page.neighborhoodId).toBeNull();
    expect(page.neighborhoods()).toEqual([]);

    page.onDistrictChange(30);
    page.onGovernorateChange(null);
    expect(page.districtId).toBeNull();
    expect(page.districts()).toEqual([]);
  });

  it('restores the saved pin and structured location when editing', () => {
    setup('l1', { latitude: 33.5, longitude: 36.3, city: 'دمشق', governorateId: 3, districtId: 30 });

    expect(page.pin()).toEqual({ lat: 33.5, lng: 36.3 });
    expect(page.governorateId).toBe(3);
    expect(lookups.getDistricts).toHaveBeenCalledWith(3);
    expect(lookups.getNeighborhoods).toHaveBeenCalledWith(30);
  });

  it('keeps a listing without a location as "no pin" instead of inventing 0,0', () => {
    setup('l1');

    expect(page.pin()).toBeNull();
    expect(page.latitude).toBeNull();
    page.saveChanges();

    expect(api.update).not.toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalledWith('SHORTSTAY.FORM.ERR_GOVERNORATE', 'error');
  });

  it('a click on the map sets the pin and the coordinates that get saved', () => {
    setup('l1', { latitude: 33.5, longitude: 36.3, city: 'دمشق', governorateId: 3 });

    page.onMapPinSelected({ lat: 34.1, lng: 36.9 });
    expect(page.pin()).toEqual({ lat: 34.1, lng: 36.9 });
    page.saveChanges();

    expect(api.update).toHaveBeenCalledWith('l1', jasmine.objectContaining({
      latitude: 34.1, longitude: 36.9, governorateId: 3
    }));
  });

  it('explains instead of calling the API when publishing a listing that has no location', () => {
    setup('l1');
    page.togglePublish();

    expect(api.publish).not.toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalledWith('SHORTSTAY.FORM.PUBLISH_NEEDS_LOCATION', 'error');
  });

  it('publishes a listing that has a city and a pin', () => {
    setup('l1', { latitude: 33.5, longitude: 36.3, city: 'دمشق', governorateId: 3 });
    page.togglePublish();

    expect(api.publish).toHaveBeenCalledWith('l1');
  });

  describe('use my location', () => {
    const stubGeolocation = (impl: Geolocation['getCurrentPosition'] | undefined) =>
      spyOnProperty(navigator, 'geolocation', 'get').and.returnValue(
        impl ? ({ getCurrentPosition: impl } as Geolocation) : (undefined as unknown as Geolocation));

    it('turns a GPS fix into the pin', () => {
      setup(null);
      stubGeolocation(success => success({ coords: { latitude: 36.2, longitude: 37.1 } } as GeolocationPosition));

      page.useMyLocation();

      expect(page.pin()).toEqual({ lat: 36.2, lng: 37.1 });
      expect(page.locating()).toBeFalse();
    });

    it('tells the user how to recover when permission is denied', () => {
      setup(null);
      stubGeolocation((_ok, fail) => fail?.({ code: 1 } as GeolocationPositionError));

      page.useMyLocation();

      expect(page.pin()).toBeNull();
      expect(toast.show).toHaveBeenCalledWith('SHORTSTAY.FORM.GPS_DENIED', 'error');
      expect(page.locating()).toBeFalse();
    });

    it('reports an unavailable fix and a missing GPS separately', () => {
      setup(null);
      stubGeolocation((_ok, fail) => fail?.({ code: 2 } as GeolocationPositionError));
      page.useMyLocation();
      expect(toast.show).toHaveBeenCalledWith('SHORTSTAY.FORM.GPS_FAILED', 'error');
    });

    it('reports a browser without geolocation', () => {
      setup(null);
      stubGeolocation(undefined);
      page.useMyLocation();
      expect(toast.show).toHaveBeenCalledWith('SHORTSTAY.FORM.GPS_UNSUPPORTED', 'error');
    });
  });
});

describe('cityMapFor', () => {
  it('finds the bundled map for a governorate despite spelling differences', () => {
    expect(cityMapFor('Damascus')?.lat).toBeCloseTo(33.5138, 3);
    expect(cityMapFor('Latakia')).not.toBeNull();     // bundled key is LATTAKIA
    expect(cityMapFor('Deir ez-Zor')).not.toBeNull(); // bundled key is DEIR_EZZOR
    expect(cityMapFor('Rif Dimashq')).not.toBeNull();
  });

  it('returns null for an unknown or empty name', () => {
    expect(cityMapFor('Atlantis')).toBeNull();
    expect(cityMapFor('')).toBeNull();
  });
});
