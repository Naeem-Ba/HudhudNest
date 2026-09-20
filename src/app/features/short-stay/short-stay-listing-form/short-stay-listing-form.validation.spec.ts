import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';

import { ShortStayListingFormPage } from './short-stay-listing-form.page';
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
