// =====================================================================
// ✅ Unit Tests – short-stay-list.page.spec.ts
// أول تغطية لصفحة قائمة الإقامات القصيرة (مراجعة البحث والفلاتر 2026-11-14).
// المنهجية نفسها كما في property-list.page.spec.ts: بدون تصيير القالب؛ Router مُموَّه
// يغذّي Subject يمثّل queryParamMap، فتُختبر دورة "إجراء ← URL ← طلب واحد" كاملة.
// =====================================================================
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, ParamMap, Router, UrlTree } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { ShortStayListPage } from './short-stay-list.page';
import { ShortStayListingApiService } from '../../../core/api/short-stay-listing-api.service';
import { CurrencyLookup, LookupsApiService } from '../../../core/api/lookups-api.service';
import { LocationsApiService } from '../../../core/api/locations-api.service';
import { PagedResult } from '../../../core/models/api.model';
import { GeoLocation } from '../../../core/models/geo-location.model';
import { ShortStayListingSearchFilter, ShortStayListingSummary } from '../../../core/models/short-stay.model';
import { LanguageService } from '../../../core/services/language.service';
import { PageMetaService } from '../../../core/services/page-meta.service';
import { PreferencesService } from '../../../core/services/preferences.service';
import { locationsApiStub } from '../../../shared/ui/geo/locations-api.stub.spec';

function currencyRow(code: string, rate: number, isBase = false): CurrencyLookup {
  return { code, nameEn: code, nameAr: code, symbol: code, decimalPlaces: 2, exchangeRateToUsd: rate, rateUpdatedAt: '2026-10-01T00:00:00Z', isBase };
}

function paged(items: ShortStayListingSummary[], page: number, totalCount: number, pageSize = 20): PagedResult<ShortStayListingSummary> {
  const totalPages = Math.ceil(totalCount / pageSize) || 1;
  return { items, page, pageSize, totalCount, totalPages, hasNext: page < totalPages, hasPrevious: page > 1 };
}

function summary(id: string): ShortStayListingSummary {
  return { id, title: id, currencyCode: 'USD', fromPricePerNight: 50 } as unknown as ShortStayListingSummary;
}

/** Mirrors how the real Router drops null/undefined query param values. */
function toParamMap(queryParams: Record<string, unknown>): ParamMap {
  const clean: Record<string, string | string[]> = {};
  Object.entries(queryParams).forEach(([key, value]) => {
    if (value === null || value === undefined) return;
    clean[key] = Array.isArray(value) ? value.map(String) : String(value);
  });
  return convertToParamMap(clean);
}

function serializeQuery(queryParams: Record<string, unknown>): string {
  const parts: string[] = [];
  Object.entries(queryParams).forEach(([key, value]) => {
    if (value === null || value === undefined) return;
    (Array.isArray(value) ? value : [value]).forEach(v => parts.push(`${key}=${encodeURIComponent(String(v))}`));
  });
  return `/short-stay${parts.length ? `?${parts.join('&')}` : ''}`;
}

function futureIso(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function pickedPlace(id: number): GeoLocation {
  return {
    id, type: 'Neighborhood', parentId: 1, countryCode: 'SY', officialName: 'Mazzeh', nameAr: 'المزة', nameEn: 'Mazzeh', nameDe: null,
    latitude: null, longitude: null, path: [], legacy: { governorateId: null, districtId: null, neighborhoodId: null }, matchedAlias: null
  } as unknown as GeoLocation;
}

describe('ShortStayListPage', () => {
  let component: ShortStayListPage;
  let apiSpy: jasmine.SpyObj<ShortStayListingApiService>;
  let routerSpy: jasmine.SpyObj<Router>;
  let paramMapSubject: BehaviorSubject<ParamMap>;
  let lookupsSpy: jasmine.SpyObj<LookupsApiService>;

  function createComponent(initialParams: Record<string, unknown> = {}, searchError?: unknown): ShortStayListPage {
    TestBed.resetTestingModule();
    paramMapSubject = new BehaviorSubject<ParamMap>(toParamMap(initialParams));

    apiSpy = jasmine.createSpyObj('ShortStayListingApiService', ['search', 'getAccommodationTypes']);
    apiSpy.search.and.callFake((filter: ShortStayListingSearchFilter = {}) =>
      searchError ? throwError(() => searchError) : of(paged([summary('a')], filter.page ?? 1, 100)));
    apiSpy.getAccommodationTypes.and.returnValue(of([]));

    let currentUrl = serializeQuery(initialParams);
    routerSpy = jasmine.createSpyObj('Router', ['navigate', 'createUrlTree', 'serializeUrl']);
    Object.defineProperty(routerSpy, 'url', { get: () => currentUrl });
    routerSpy.createUrlTree.and.callFake((_c: unknown[], extras?: { queryParams?: Record<string, unknown> }) =>
      ({ queryParams: extras?.queryParams ?? {} }) as unknown as UrlTree);
    routerSpy.serializeUrl.and.callFake((tree: UrlTree) => serializeQuery((tree as unknown as { queryParams: Record<string, unknown> }).queryParams));
    routerSpy.navigate.and.callFake((_c: unknown[], extras?: { queryParams?: Record<string, unknown> }) => {
      const params = extras?.queryParams ?? {};
      const next = serializeQuery(params);
      if (next !== currentUrl) {
        currentUrl = next;
        paramMapSubject.next(toParamMap(params));
      }
      return Promise.resolve(true);
    });

    lookupsSpy = jasmine.createSpyObj('LookupsApiService', [
      'getAmenities', 'getCurrencies', 'getGovernorates', 'getDistricts', 'getNeighborhoods', 'getCities'
    ]);
    lookupsSpy.getAmenities.and.returnValue(of([]));
    lookupsSpy.getCurrencies.and.returnValue(of([currencyRow('USD', 1, true), currencyRow('SYP', 14000), currencyRow('EUR', 0.9)]));
    lookupsSpy.getGovernorates.and.returnValue(of([]));
    lookupsSpy.getDistricts.and.returnValue(of([]));
    lookupsSpy.getNeighborhoods.and.returnValue(of([]));
    lookupsSpy.getCities.and.returnValue(of([]));

    const locationsSpy = locationsApiStub();
    locationsSpy.get.and.returnValue(of(pickedPlace(77)));

    TestBed.configureTestingModule({
      imports: [ShortStayListPage],
      providers: [
        { provide: ShortStayListingApiService, useValue: apiSpy },
        { provide: LookupsApiService, useValue: lookupsSpy },
        { provide: LocationsApiService, useValue: locationsSpy },
        { provide: LanguageService, useValue: { getCurrent: () => 'ar', currentLang$: of('ar') } },
        { provide: PreferencesService, useValue: { currency: null } },
        { provide: PageMetaService, useValue: jasmine.createSpyObj<PageMetaService>('PageMetaService', ['applyTranslated']) },
        {
          provide: TranslateService,
          useValue: jasmine.createSpyObj('TranslateService', ['instant', 'get'], {
            onLangChange: of({}), onTranslationChange: of({}), onDefaultLangChange: of({})
          })
        },
        { provide: Router, useValue: routerSpy },
        { provide: ActivatedRoute, useValue: { queryParamMap: paramMapSubject.asObservable(), snapshot: { queryParamMap: paramMapSubject.value } } }
      ]
    });

    const instance = TestBed.createComponent(ShortStayListPage).componentInstance;
    instance.ngOnInit(); // deliberately not detectChanges(): see file header
    return instance;
  }

  function lastRequest(): ShortStayListingSearchFilter {
    const calls = apiSpy.search.calls.all();
    return calls[calls.length - 1].args[0] as ShortStayListingSearchFilter;
  }

  beforeEach(() => { component = createComponent(); });

  it('✅ التحميل الأول بلا معاملات يرسل طلباً واحداً بالقيم الافتراضية', () => {
    expect(apiSpy.search).toHaveBeenCalledTimes(1);
    const r = lastRequest();
    expect(r.page).toBe(1);
    expect(r.pageSize).toBe(20);
    expect(r.searchTerm).toBeUndefined();
    expect(r.sortBy).toBeUndefined();
    expect(r.currencyCode).toBeUndefined();
    expect(component.listings().length).toBe(1);
    expect(component.totalCount()).toBe(100);
  });

  it('✅ "بحث" يرسل كل الفلاتر في طلب واحد ويعيد الصفحة إلى 1', () => {
    const checkIn = futureIso(10), checkOut = futureIso(13);
    component.searchText = ' مطل ';
    component.guests = 3;
    component.minBedrooms = 2;
    component.accommodationTypeId = 4;
    component.checkIn = checkIn;
    component.checkOut = checkOut;
    component.instantOnly = true;
    component.minPrice = 20;
    component.maxPrice = 90;
    component.currencyCode = 'EUR';
    component.sort = 'priceDesc';
    component.selectedAmenityIds = ['11111111-1111-1111-1111-111111111111'];
    apiSpy.search.calls.reset();

    component.applyFilters();

    expect(apiSpy.search).toHaveBeenCalledTimes(1);
    expect(lastRequest()).toEqual(jasmine.objectContaining({
      searchTerm: 'مطل', guests: 3, minBedrooms: 2, accommodationTypeId: 4, checkIn, checkOut, instantBooking: true,
      minPrice: 20, maxPrice: 90, currencyCode: 'EUR', sortBy: 'price', sortDescending: true,
      amenityIds: ['11111111-1111-1111-1111-111111111111'], page: 1
    }));
  });

  it('✅ العملة لا تُرسل ما لم يُكتب حدّ سعر', () => {
    component.currencyCode = 'SYP';
    component.applyFilters();
    expect(lastRequest().currencyCode).toBeUndefined();

    component.minPrice = 100;
    component.applyFilters();
    expect(lastRequest().currencyCode).toBe('SYP');
  });

  it('✅ الضغط على "بحث" مرتين بلا تغيير يعيد الطلب (لا يبقى الزر ميتاً)', () => {
    component.searchText = 'x';
    component.applyFilters();
    const before = apiSpy.search.calls.count();
    component.applyFilters();
    expect(apiSpy.search.calls.count()).toBe(before + 1);
  });

  it('✅ تغيير الصفحة يحافظ على الفلاتر', () => {
    component.searchText = 'بحر';
    component.guests = 2;
    component.applyFilters();
    component.nextPage();

    expect(lastRequest()).toEqual(jasmine.objectContaining({ searchTerm: 'بحر', guests: 2, page: 2 }));
    expect(component.currentPage()).toBe(2);
  });

  it('✅ الصفحة والفلاتر تُستعاد من الرابط (رابط مشترك/إعادة تحميل)', () => {
    const checkIn = futureIso(5), checkOut = futureIso(8);
    component = createComponent({
      search: 'شاليه', guests: '4', type: '2', bedrooms: '3', minPrice: '10', maxPrice: '80', currency: 'SYP',
      instant: '1', sort: 'priceAsc', checkIn, checkOut, page: '3', amenityIds: ['22222222-2222-2222-2222-222222222222']
    });

    expect(component.searchText).toBe('شاليه');
    expect(component.instantOnly).toBeTrue();
    expect(component.sort).toBe('priceAsc');
    expect(lastRequest()).toEqual(jasmine.objectContaining({
      searchTerm: 'شاليه', guests: 4, accommodationTypeId: 2, minBedrooms: 3, minPrice: 10, maxPrice: 80, currencyCode: 'SYP',
      instantBooking: true, sortBy: 'price', sortDescending: undefined, checkIn, checkOut, page: 3,
      amenityIds: ['22222222-2222-2222-2222-222222222222']
    }));
  });

  it('✅ قيم الرابط غير الصالحة تُصلَح بدل أن يرفضها الخادم (422)', () => {
    component = createComponent({
      guests: '9999', minBedrooms: 'abc', minPrice: '-5', currency: 'XYZ', sort: 'drop table',
      checkIn: '2020-01-01', checkOut: '2020-01-05', amenityIds: ['not-a-guid'], pageSize: '9999', page: '-4'
    });

    const r = lastRequest();
    expect(r.guests).toBeUndefined();
    expect(r.minBedrooms).toBeUndefined();
    expect(r.minPrice).toBeUndefined();
    expect(r.currencyCode).toBeUndefined();
    expect(r.sortBy).toBeUndefined();
    expect(r.checkIn).toBeUndefined();
    expect(r.checkOut).toBeUndefined();
    expect(r.amenityIds).toBeUndefined();
    expect(r.pageSize).toBe(100);
    expect(r.page).toBe(1);
  });

  it('✅ مدخلة بتاريخ خروج قبل الدخول تُهمَل', () => {
    component = createComponent({ checkIn: futureIso(9), checkOut: futureIso(7) });
    expect(lastRequest().checkIn).toBeUndefined();
    expect(component.checkIn).toBeNull();
  });

  describe('صندوق المكان', () => {
    it('✅ مكان من الفهرس يُرسَل locationId فقط', () => {
      component.onPlaceTextPicked('دمشق');
      component.onPlacePicked(pickedPlace(77));
      component.applyFilters();

      expect(lastRequest().locationId).toBe(77);
      expect(lastRequest().city).toBeUndefined();
    });

    it('✅ نص مكتوب يُرسَل city ويلغي المكان المختار', () => {
      component.onPlacePicked(pickedPlace(77));
      component.onPlaceTextPicked(' حلب ');
      component.applyFilters();

      expect(lastRequest().city).toBe('حلب');
      expect(lastRequest().locationId).toBeUndefined();
    });

    it('✅ نص تُرك في الصندوق دون اختيار يُطبَّق عند "بحث" ولا يضيع', () => {
      component.onPlaceTyped('اللاذقية');
      component.applyFilters();

      expect(lastRequest().city).toBe('اللاذقية');
    });

    it('✅ locationId من الرابط يُستعاد اسمه من الفهرس', () => {
      component = createComponent({ locationId: '77' });

      expect(lastRequest().locationId).toBe(77);
      expect(component.locationPlace()?.id).toBe(77);
    });
  });

  describe('إعادة الضبط', () => {
    it('✅ تمسح كل شيء وترسل طلباً واحداً بلا فلاتر', () => {
      component.searchText = 'x';
      component.guests = 2;
      component.minPrice = 5;
      component.instantOnly = true;
      component.sort = 'priceAsc';
      component.selectedAmenityIds = ['11111111-1111-1111-1111-111111111111'];
      component.applyFilters();
      apiSpy.search.calls.reset();

      component.resetFilters();

      expect(apiSpy.search).toHaveBeenCalledTimes(1);
      const r = lastRequest();
      expect(r.searchTerm).toBeUndefined();
      expect(r.guests).toBeUndefined();
      expect(r.minPrice).toBeUndefined();
      expect(r.instantBooking).toBeUndefined();
      expect(r.sortBy).toBeUndefined();
      expect(r.amenityIds).toBeUndefined();
      expect(component.hasActiveFilters).toBeFalse();
    });
  });

  describe('المرافق', () => {
    it('✅ القسم مطوي افتراضياً ويُفتح بالتبديل', () => {
      expect(component.amenitiesOpen).toBeFalse();
      component.toggleAmenitiesSection();
      expect(component.amenitiesOpen).toBeTrue();
    });

    it('✅ اختيار مرفق وإلغاؤه', () => {
      component.toggleAmenityFilter('a');
      component.toggleAmenityFilter('b');
      component.toggleAmenityFilter('a');
      expect(component.selectedAmenityIds).toEqual(['b']);
    });
  });

  describe('الأخطاء والنتائج', () => {
    it('✅ رفض الفلاتر (422) يعرض نصاً يشرح السبب لا "حاول لاحقاً"', () => {
      component = createComponent({}, new HttpErrorResponse({ status: 422 }));
      expect(component.error()).toBe('SHORTSTAY.LIST.INVALID_FILTERS');
      expect(component.loading()).toBeFalse();
    });

    it('✅ خطأ شبكة يعرض رسالة التحميل العامة وزر إعادة المحاولة يعيد الطلب', () => {
      component = createComponent({}, new HttpErrorResponse({ status: 0 }));
      expect(component.error()).toBe('SHORTSTAY.LIST.LOAD_ERROR');
      const before = apiSpy.search.calls.count();
      component.retry();
      expect(apiSpy.search.calls.count()).toBe(before + 1);
    });

    it('✅ صفحة بعد النهاية في رابط مشترك تنتقل إلى آخر صفحة حقيقية', () => {
      createComponent({ page: '9' });
      apiSpy.search.and.callFake((filter: ShortStayListingSearchFilter = {}) =>
        (filter.page ?? 1) > 3 ? of(paged([], filter.page ?? 1, 50)) : of(paged([summary('z')], filter.page ?? 1, 50)));
      paramMapSubject.next(toParamMap({ page: '9' }));

      expect(lastRequest().page).toBe(3);
    });
  });

  describe('الانتقال إلى التفاصيل', () => {
    it('✅ يحمل التواريخ وعدد الضيوف ليُملأ نموذج الحجز', () => {
      const checkIn = futureIso(10), checkOut = futureIso(12);
      component.checkIn = checkIn;
      component.checkOut = checkOut;
      component.guests = 2;

      component.goToDetails('abc');

      expect(routerSpy.navigate).toHaveBeenCalledWith(['/short-stay', 'abc'], { queryParams: { checkIn, checkOut, guests: 2 } });
    });

    it('✅ بلا تواريخ لا يحمل شيئاً', () => {
      component.goToDetails('abc');
      expect(routerSpy.navigate).toHaveBeenCalledWith(['/short-stay', 'abc'], { queryParams: {} });
    });
  });
});
