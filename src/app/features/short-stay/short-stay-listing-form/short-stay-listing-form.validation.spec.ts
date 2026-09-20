import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';

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
