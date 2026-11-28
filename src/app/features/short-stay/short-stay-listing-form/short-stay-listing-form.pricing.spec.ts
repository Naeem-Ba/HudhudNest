import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { Observable, of, throwError } from 'rxjs';

import {
  DayPriceRow,
  PeriodPriceRow,
  SHORT_STAY_HIDDEN_AMENITIES,
  ShortStayListingFormPage,
  firstPricingProblem,
  rowsToRules,
  rulesToRows
} from './short-stay-listing-form.page';
import { ShortStayListingApiService } from '../../../core/api/short-stay-listing-api.service';
import { LookupsApiService } from '../../../core/api/lookups-api.service';
import { LocationsApiService } from '../../../core/api/locations-api.service';
import { locationsApiStub } from '../../../shared/ui/geo/locations-api.stub.spec';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/services/toast.service';
import { EMPTY_GEO_VALUE } from '../../../shared/ui/geo/geo-picker.models';
import { PricingRuleDto } from '../../../core/models/short-stay.model';

const FRIDAY = 5;
const rule = (over: Partial<PricingRuleDto>): PricingRuleDto => ({
  id: 'r', ruleType: 'Weekday', dayOfWeek: null, dateRangeStart: null, dateRangeEnd: null, pricePerNight: 100, ...over
});

describe('price rows <-> API rules', () => {
  it('turns days with one price into one rule per day (Friday = DayOfWeek 5)', () => {
    const rules = rowsToRules([{ days: [4, FRIDAY, 6], pricePerNight: 150 }], []);

    expect(rules.map(r => [r.ruleType, r.dayOfWeek, r.pricePerNight])).toEqual([
      ['Weekday', 4, 150], ['Weekday', 5, 150], ['Weekday', 6, 150]
    ]);
    expect(rules.every(r => r.dateRangeStart === null && r.dateRangeEnd === null)).toBeTrue();
  });

  it('keeps period rules with their dates and type', () => {
    const rules = rowsToRules([], [{ ruleType: 'Holiday', dateRangeStart: '2027-04-01', dateRangeEnd: '2027-04-05', pricePerNight: 200 }]);

    expect(rules).toEqual([{ ruleType: 'Holiday', dayOfWeek: null, dateRangeStart: '2027-04-01', dateRangeEnd: '2027-04-05', pricePerNight: 200 }]);
  });

  it('loads saved rules: groups days by price, drops Base and day rules that never applied (no day)', () => {
    const { dayRows, periodRows } = rulesToRows([
      rule({ ruleType: 'Base', pricePerNight: 80 }),
      rule({ ruleType: 'Weekend', dayOfWeek: null, pricePerNight: 0 }),
      rule({ ruleType: 'Weekday', dayOfWeek: 5, pricePerNight: 150 }),
      rule({ ruleType: 'Weekend', dayOfWeek: 6, pricePerNight: 150 }),
      rule({ ruleType: 'Seasonal', dateRangeStart: '2027-07-01T00:00:00', dateRangeEnd: '2027-08-31', pricePerNight: 300 })
    ]);

    expect(dayRows).toEqual([{ days: [6, 5], pricePerNight: 150 }]);
    expect(periodRows).toEqual([{ ruleType: 'Seasonal', dateRangeStart: '2027-07-01', dateRangeEnd: '2027-08-31', pricePerNight: 300 }]);
  });
});

describe('firstPricingProblem', () => {
  const ok: DayPriceRow = { days: [FRIDAY], pricePerNight: 150 };
  const period = (over: Partial<PeriodPriceRow> = {}): PeriodPriceRow =>
    ({ ruleType: 'Seasonal', dateRangeStart: '2027-07-01', dateRangeEnd: '2027-07-31', pricePerNight: 200, ...over });

  it('accepts a clean set', () => expect(firstPricingProblem(100, [ok], [period()])).toBeNull());
  it('needs a base price above zero', () => {
    expect(firstPricingProblem(0, [], [])).toBe('SHORTSTAY.FORM.PRICE_REQUIRED');
    expect(firstPricingProblem(null, [], [])).toBe('SHORTSTAY.FORM.PRICE_REQUIRED');
  });
  it('never allows a default rule at price 0 or without a day', () => {
    expect(firstPricingProblem(100, [{ days: [], pricePerNight: 150 }], [])).toBe('SHORTSTAY.FORM.ERR_RULE_DAYS');
    expect(firstPricingProblem(100, [{ days: [FRIDAY], pricePerNight: 0 }], [])).toBe('SHORTSTAY.FORM.ERR_RULE_PRICE');
    expect(firstPricingProblem(100, [{ days: [FRIDAY], pricePerNight: null }], [])).toBe('SHORTSTAY.FORM.ERR_RULE_PRICE');
  });
  it('rejects the same day twice', () => {
    expect(firstPricingProblem(100, [ok, { days: [FRIDAY, 6], pricePerNight: 120 }], [])).toBe('SHORTSTAY.FORM.ERR_RULE_DUP_DAY');
  });
  it('needs both dates, in order, and a price', () => {
    expect(firstPricingProblem(100, [], [period({ dateRangeEnd: null })])).toBe('SHORTSTAY.FORM.ERR_RULE_DATES');
    expect(firstPricingProblem(100, [], [period({ dateRangeStart: '2027-08-01' })])).toBe('SHORTSTAY.FORM.ERR_RULE_DATE_ORDER');
    expect(firstPricingProblem(100, [], [period({ pricePerNight: 0 })])).toBe('SHORTSTAY.FORM.ERR_RULE_PRICE');
  });
});

describe('ShortStayListingFormPage — edit save (price, place, pets, order)', () => {
  let page: ShortStayListingFormPage;
  let api: jasmine.SpyObj<ShortStayListingApiService>;
  let toast: jasmine.SpyObj<ToastService>;
  let calls: string[];

  const listing = {
    id: 'l1', currencyCode: 'SYP', title: 't', description: 'd', capacity: 2, bedrooms: 1, bathrooms: 1,
    checkInTime: '14:00:00', checkOutTime: '11:00:00', selfCheckInEnabled: false, instantBookingEnabled: true,
    requestBookingEnabled: false, latitude: 33.5, longitude: 36.3, city: 'دمشق', locationVisibility: 'Exact',
    governorateId: 3, districtId: 30, neighborhoodId: null, locationId: 77, poolType: null, poolLocation: null,
    poolIsSeasonal: null, poolIsHeated: null, cleaningFee: 0, extraGuestFee: 0, extraBedFee: 12,
    allowsSmoking: false, allowsParties: false, allowsPets: true, quietHoursStart: null, quietHoursEnd: null,
    customRulesText: null, cancellationFreeCancellationDays: 3, cancellationDepositRefundable: true,
    cancellationCustomTermsText: null, depositPercentage: null, isPublished: false,
    amenityIds: ['hidden-id', 'wifi-id'], photoUrls: [],
    roomTypes: [{
      id: 'rt1', name: 'x', basePricePerNight: 80, capacity: null, isActive: true, units: [],
      pricingRules: [rule({ ruleType: 'Base', pricePerNight: 80 }), rule({ ruleType: 'Weekday', dayOfWeek: 5, pricePerNight: 150 })],
      minimumStayRules: [
        { id: 'm1', minimumNights: 2, dateRangeStart: null, dateRangeEnd: null },
        { id: 'm2', minimumNights: 5, dateRangeStart: '2027-12-20', dateRangeEnd: '2027-12-31' }
      ]
    }]
  };

  const track = <T>(name: string, value: Observable<T>) => { calls.push(name); return value; };

  beforeEach(() => {
    calls = [];
    api = jasmine.createSpyObj('ShortStayListingApiService', ['getById', 'update', 'setAmenities', 'setPricingRules', 'setMinimumStayRules']);
    api.getById.and.returnValue(of(listing as never));
    api.update.and.callFake((() => track('update', of({}))) as never);
    api.setAmenities.and.callFake((() => track('amenities', of(undefined))) as never);
    api.setPricingRules.and.callFake((() => track('pricing', of(undefined))) as never);
    api.setMinimumStayRules.and.callFake((() => track('minstay', of(undefined))) as never);
    toast = jasmine.createSpyObj('ToastService', ['show']);

    TestBed.configureTestingModule({
      imports: [ShortStayListingFormPage, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: ShortStayListingApiService, useValue: api },
        {
          provide: LookupsApiService,
          useValue: {
            getAmenities: () => of([
              { id: 'hidden-id', name: 'x', iconName: 'pets-allowed' },
              { id: 'gen-id', name: 'y', iconName: 'generator' },
              { id: 'wifi-id', name: 'wifi', iconName: 'wifi' }
            ]),
            getGovernorates: () => of([]), getDistricts: () => of([]), getNeighborhoods: () => of([])
          }
        },
        { provide: LocationsApiService, useValue: locationsApiStub() },
        { provide: AuthService, useValue: {} },
        { provide: ToastService, useValue: toast },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'l1' }) } } }
      ]
    });
    page = TestBed.createComponent(ShortStayListingFormPage).componentInstance;
    page.ngOnInit();
  });

  it('loads the room price, the place, the pets policy and the rules the form can show', () => {
    expect(page.defaultBasePricePerNight).toBe(80);
    expect(page.locationId).toBe(77);
    expect(page.petsPolicy).toBe('Allowed');
    expect(page.dayRows()).toEqual([{ days: [5], pricePerNight: 150 }]);
    expect(page.minimumNights).toBe(2);
  });

  it('offers short-stay amenities only, and still saves one that is hidden but already on the listing', () => {
    expect(page.offeredAmenities().map(a => a.iconName)).toEqual(['wifi']);
    expect(SHORT_STAY_HIDDEN_AMENITIES.has('pets-allowed')).toBeTrue();

    page.saveChanges();

    expect(api.setAmenities).toHaveBeenCalledWith('l1', ['hidden-id', 'wifi-id']);
  });

  it('sends the price, the catalog place and the pets policy, and echoes the hidden extra-bed fee', () => {
    page.defaultBasePricePerNight = 95;
    page.petsPolicy = 'Conditional';
    page.saveChanges();

    expect(api.update).toHaveBeenCalledWith('l1', jasmine.objectContaining({
      basePricePerNight: 95, locationId: 77, petsPolicy: 'Conditional', allowsPets: true, extraBedFee: 12
    }));
  });

  it('keeps the place picked in the geo picker and sends it', () => {
    page.onGeoChange({ ...EMPTY_GEO_VALUE, locationId: 901, governorateId: 3, districtId: 30, city: 'دمشق' });
    page.saveChanges();

    expect(api.update).toHaveBeenCalledWith('l1', jasmine.objectContaining({ locationId: 901 }));
  });

  it('saves one request after the other and stores the dated minimum stay untouched; the Base rule is not sent back', () => {
    page.saveChanges();

    expect(calls).toEqual(['update', 'amenities', 'pricing', 'minstay']);
    expect(api.setPricingRules).toHaveBeenCalledWith('rt1', [
      { ruleType: 'Weekday', dayOfWeek: 5, dateRangeStart: null, dateRangeEnd: null, pricePerNight: 150 }
    ]);
    expect(api.setMinimumStayRules).toHaveBeenCalledWith('rt1', [
      { minimumNights: 2, dateRangeStart: null, dateRangeEnd: null },
      { minimumNights: 5, dateRangeStart: '2027-12-20', dateRangeEnd: '2027-12-31' }
    ]);
  });

  it('stops at the first refused step and says the save is incomplete', () => {
    api.setAmenities.and.callFake((() => track('amenities', throwError(() => ({ status: 500 })))) as never);

    page.saveChanges();

    expect(calls).toEqual(['update', 'amenities']);
    expect(toast.show).toHaveBeenCalledWith('SHORTSTAY.FORM.SAVE_PARTIAL', 'error');
    expect(page.saving()).toBeFalse();
  });

  it('sends nothing when a price rule is invalid, and names the problem', () => {
    page.addDayRow();

    page.saveChanges();

    expect(api.update).not.toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalledWith('SHORTSTAY.FORM.ERR_RULE_DAYS', 'error');
  });

  it('refuses a base price of zero before any request', () => {
    page.defaultBasePricePerNight = 0;

    page.saveChanges();

    expect(api.update).not.toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalledWith('SHORTSTAY.FORM.PRICE_REQUIRED', 'error');
  });

  it('stores no undated minimum-stay rule for one night', () => {
    page.minimumNights = 1;
    page.saveChanges();

    expect(api.setMinimumStayRules).toHaveBeenCalledWith('rt1', [
      { minimumNights: 5, dateRangeStart: '2027-12-20', dateRangeEnd: '2027-12-31' }
    ]);
  });

  it('does not let a day sit in two rows', () => {
    page.addDayRow();
    const second = page.dayRows()[1];

    expect(page.dayTakenElsewhere(second, 5)).toBeTrue();
    expect(page.dayTakenElsewhere(second, 4)).toBeFalse();
  });
});
