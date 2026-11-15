// =====================================================================
// ✅ Unit Tests – property-list.page.spec.ts
// أول تغطية لهذا المكوّن (Phase 3). يغطي البحث النصي (كان معطوباً — القيمة
// المكتوبة لم تكن تصل أبداً إلى الـ API)، دمج Search+Filters في طلب واحد،
// إعادة الصفحة إلى 1 عند تغيير الفلاتر، الحفاظ على الفلاتر أثناء التنقل بين
// الصفحات، Reset الكامل (state + URL)، ربط الحالة بـ URL (query params) بدل
// قراءة لمرة واحدة فقط، وحماية من Race Conditions عبر switchMap.
//
// المنهجية: بدون fixture.detectChanges() (نفس نهج property-form.page.spec.ts) —
// نستدعي ngOnInit() يدوياً ونتحقق من منطق الفئة مباشرة، متفادين تصيير القالب
// الكامل. Router.navigate مُموَّه (faked) ليغذّي Subject يمثّل queryParamMap
// الحيّ فعلياً، بحيث يُحاكي الاختبار دورة "المستخدم يغيّر فلتر → تنتقل الحالة
// إلى الـ URL → الاشتراك في queryParamMap يعيد الجلب" بالكامل، لا فقط استدعاء
// دالة داخلية بمعزل عن البقية.
// =====================================================================
import { fakeAsync, TestBed, tick, discardPeriodicTasks } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, ParamMap, Router, UrlTree } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { BehaviorSubject, of, Subject, throwError } from 'rxjs';

import { PropertyListPage } from './property-list.page';
import { PropertyApiService } from '../../../core/api/property-api.service';
import { SavedSearchApiService } from '../../../core/api/saved-search-api.service';
import { CurrencyLookup, LookupsApiService } from '../../../core/api/lookups-api.service';
import { LocationsApiService } from '../../../core/api/locations-api.service';
import { GeoLocation, GeoLocationType } from '../../../core/models/geo-location.model';
import { locationsApiStub } from '../../../shared/ui/geo/locations-api.stub.spec';
import { PageMetaService } from '../../../core/services/page-meta.service';
import { PreferencesService } from '../../../core/services/preferences.service';
import { InterestAreasService } from '../../../core/services/interest-areas.service';
import { RecentAreasService, RECENT_AREAS_STORAGE_KEY } from '../../../core/services/recent-areas.service';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../../core/auth/auth.service';
import { LanguageService } from '../../../core/services/language.service';
import { ToastService } from '../../../shared/services/toast.service';
import { PagedResult } from '../../../core/models/api.model';
import { AvailableFloors, Property, PropertyFilterDto } from '../../../core/models/property.model';

function currencyRow(code: string, rate: number, isBase = false): CurrencyLookup {
  return { code, nameEn: code, nameAr: code, symbol: code, decimalPlaces: 2, exchangeRateToUsd: rate, rateUpdatedAt: '2026-10-01T00:00:00Z', isBase };
}

function pagedResult(items: Property[], page: number, totalCount: number, pageSize = 20): PagedResult<Property> {
  const totalPages = Math.ceil(totalCount / pageSize) || 1;
  return {
    items,
    page,
    pageSize,
    totalCount,
    totalPages,
    hasNext: page < totalPages,
    hasPrevious: page > 1
  };
}

/** Mirrors how Angular's real Router drops null/undefined query param values from the URL. */
function toParamMap(queryParams: Record<string, unknown>): ParamMap {
  const clean: Record<string, string | string[]> = {};
  Object.entries(queryParams).forEach(([key, value]) => {
    if (value === null || value === undefined) return;
    clean[key] = Array.isArray(value) ? value.map(String) : String(value);
  });
  return convertToParamMap(clean);
}

/** What the real router would put in the address bar for these query params (null/undefined are dropped). */
function serializeQuery(queryParams: Record<string, unknown>): string {
  const parts: string[] = [];
  Object.entries(queryParams).forEach(([key, value]) => {
    if (value === null || value === undefined) return;
    (Array.isArray(value) ? value : [value]).forEach(v => parts.push(`${key}=${encodeURIComponent(String(v))}`));
  });
  return `/properties${parts.length ? `?${parts.join('&')}` : ''}`;
}

function place(id: number, type: GeoLocationType, nameAr: string, nameEn: string): GeoLocation {
  return {
    id, type, parentId: 1, countryCode: 'SY', officialName: nameEn, nameAr, nameEn, nameDe: null, latitude: null, longitude: null,
    path: [], legacy: { governorateId: null, districtId: null, neighborhoodId: null }, matchedAlias: null
  };
}

describe('PropertyListPage', () => {
  let component: PropertyListPage;
  let propertyApiSpy: jasmine.SpyObj<PropertyApiService>;
  let lookupsApiSpy: jasmine.SpyObj<LookupsApiService>;
  let locationsApiSpy: jasmine.SpyObj<LocationsApiService>;
  let routerSpy: jasmine.SpyObj<Router>;
  let paramMapSubject: BehaviorSubject<ParamMap>;
  let interestParam: string | undefined;
  /** What the floors endpoint answers (the floors that exist for the other filters). */
  let floorsResponse: AvailableFloors;

  function createComponent(initialParams: Record<string, unknown> = {}, preferredCurrency: string | null = null): PropertyListPage {
    // Some tests (deep-link) build a second component within the same `it`, after the
    // outer beforeEach already instantiated one — TestBed requires an explicit reset
    // between two configureTestingModule calls within a single test.
    TestBed.resetTestingModule();
    localStorage.removeItem(RECENT_AREAS_STORAGE_KEY);
    interestParam = undefined;

    paramMapSubject = new BehaviorSubject<ParamMap>(toParamMap(initialParams));

    propertyApiSpy = jasmine.createSpyObj('PropertyApiService', ['getPropertiesPaged', 'geoSearch', 'getAvailableFloors']);
    floorsResponse = { min: 0, max: 5, floors: [0, 1, 2, 5].map(floor => ({ floor, count: 3 })) };
    propertyApiSpy.getAvailableFloors.and.callFake(() => of(floorsResponse));
    // Echoes back the requested page and reports enough total results for multi-page
    // pagination tests, mirroring the real backend's PagedResult contract (PagedResult.cs:
    // Page is always the clamped requested page; TotalCount reflects the filtered set).
    propertyApiSpy.getPropertiesPaged.and.callFake((filter: PropertyFilterDto = {}) =>
      of(pagedResult([], filter.page ?? 1, 100))
    );

    // The geo search answers with the page that was asked for, like the list does.
    propertyApiSpy.geoSearch.and.callFake((_lat: number, _lng: number, _radius?: number, filter: PropertyFilterDto = {}) =>
      of(pagedResult([], filter.page ?? 1, 40))
    );

    // Like the real router, a navigation to the URL it is already on does nothing (no emission), and the page asks the
    // router what the URL would be before navigating (createUrlTree + serializeUrl + url).
    let currentUrl = serializeQuery(initialParams);
    routerSpy = jasmine.createSpyObj('Router', ['navigate', 'createUrlTree', 'serializeUrl']);
    Object.defineProperty(routerSpy, 'url', { get: () => currentUrl });
    routerSpy.createUrlTree.and.callFake((_commands: unknown[], extras?: { queryParams?: Record<string, unknown> }) =>
      ({ queryParams: extras?.queryParams ?? {} }) as unknown as UrlTree);
    routerSpy.serializeUrl.and.callFake((tree: UrlTree) => serializeQuery((tree as unknown as { queryParams: Record<string, unknown> }).queryParams));
    routerSpy.navigate.and.callFake((_commands: unknown[], extras?: { queryParams?: Record<string, unknown> }) => {
      const params = extras?.queryParams ?? {};
      const next = serializeQuery(params);
      if (next !== currentUrl) {
        currentUrl = next;
        paramMapSubject.next(toParamMap(params));
      }
      return Promise.resolve(true);
    });

    lookupsApiSpy = jasmine.createSpyObj('LookupsApiService', [
      'getCities', 'getAmenities', 'getGovernorates', 'getPropertyTypeCatalog', 'getDistricts', 'getNeighborhoods', 'getCurrencies'
    ]);
    lookupsApiSpy.getCurrencies.and.returnValue(of([currencyRow('USD', 1, true), currencyRow('SYP', 14000), currencyRow('EUR', 0.9)]));
    lookupsApiSpy.getCities.and.returnValue(of([]));
    lookupsApiSpy.getAmenities.and.returnValue(of([]));
    lookupsApiSpy.getGovernorates.and.returnValue(of([]));
    lookupsApiSpy.getPropertyTypeCatalog.and.returnValue(of([]));
    lookupsApiSpy.getDistricts.and.returnValue(of([]));
    lookupsApiSpy.getNeighborhoods.and.returnValue(of([]));

    locationsApiSpy = locationsApiStub();
    locationsApiSpy.get.and.returnValue(of(place(77, 'Neighborhood', 'الجادات', 'Jadat')));

    const authSpy = jasmine.createSpyObj('AuthService', ['getAccessToken']);
    authSpy.getAccessToken.and.returnValue(null);

    TestBed.configureTestingModule({
      imports: [PropertyListPage],
      providers: [
        { provide: PropertyApiService, useValue: propertyApiSpy },
        { provide: SavedSearchApiService, useValue: jasmine.createSpyObj('SavedSearchApiService', ['create']) },
        { provide: LookupsApiService, useValue: lookupsApiSpy },
        { provide: LocationsApiService, useValue: locationsApiSpy },
        { provide: AuthService, useValue: authSpy },
        { provide: LanguageService, useValue: { getCurrent: () => 'ar', currentLang$: of('ar') } },
        { provide: PreferencesService, useValue: { currency: preferredCurrency } },
        { provide: InterestAreasService, useValue: { current: () => interestParam } },
        { provide: PageMetaService, useValue: jasmine.createSpyObj<PageMetaService>('PageMetaService', ['applyTranslated']) },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'error', 'info']) },
        {
          provide: TranslateService,
          useValue: jasmine.createSpyObj('TranslateService', ['instant', 'get'], {
            onLangChange: of({}), onTranslationChange: of({}), onDefaultLangChange: of({})
          })
        },
        { provide: Router, useValue: routerSpy },
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: paramMapSubject.asObservable(), snapshot: { queryParamMap: paramMapSubject.value } }
        }
      ]
    });

    const fixture = TestBed.createComponent(PropertyListPage);
    const instance = fixture.componentInstance;
    instance.ngOnInit(); // see file header — deliberately not fixture.detectChanges()
    return instance;
  }

  function lastRequest(): PropertyFilterDto {
    const calls = propertyApiSpy.getPropertiesPaged.calls.all();
    return calls[calls.length - 1].args[0] as PropertyFilterDto;
  }

  beforeEach(() => {
    component = createComponent();
  });

  it('✅ التحميل الأولي بلا query params يرسل طلباً بالإعدادات الافتراضية', () => {
    expect(propertyApiSpy.getPropertiesPaged).toHaveBeenCalledTimes(1);
    expect(lastRequest()).toEqual({
      page: 1,
      pageSize: 20,
      searchTerm: undefined,
      placeText: undefined,
      city: undefined,
      listingType: undefined,
      minPrice: undefined,
      maxPrice: undefined,
      currencyCode: undefined,
      amenityIds: undefined,
      sortBy: 'CreatedAt',
      sortDescending: true,
      interestGovernorateIds: undefined,
      governorateId: undefined,
      districtId: undefined,
      neighborhoodId: undefined,
      locationId: undefined,
      propertyTypeId: undefined,
      floorFrom: undefined,
      floorTo: undefined,
      floorMode: undefined
    });
  });

  describe('ترتيب الإعلانات المميزة حسب المنطقة', () => {
    it('✅ الترتيب الافتراضي بلا فلتر محافظة يرسل مناطق اهتمام الزائر', () => {
      interestParam = '3,7';
      component.searchText = 'شقة';
      component.applyFilters();

      expect(lastRequest().interestGovernorateIds).toBe('3,7');
    });

    it('✅ داخل محافظة واحدة لا يُرسَل شيء (لا ما يُفضَّل هناك، ولا تفتيت للكاش)', () => {
      interestParam = '3,7';
      component.governorateId = 3;
      component.applyFilters();

      expect(lastRequest().interestGovernorateIds).toBeUndefined();
    });

    it('✅ الفرز الصريح بالسعر لا يحمل مناطق الاهتمام', () => {
      interestParam = '3,7';
      component.selectedListingType = 'ForSale';
      component.sortBy = 'Price';
      component.applyFilters();

      expect(lastRequest().sortBy).toBe('Price');
      expect(lastRequest().interestGovernorateIds).toBeUndefined();
    });

    it('✅ المحافظة التي بحث فيها تُحفظ على الجهاز (3 كحد أقصى، الأحدث أولًا)', () => {
      const recent = TestBed.inject(RecentAreasService);
      for (const id of [1, 2, 3, 4]) {
        component.governorateId = id;
        component.applyFilters();
      }

      expect(recent.list()).toEqual([4, 3, 2]);
    });

    it('✅ التصفح بلا فلتر محافظة لا يضيف شيئًا إلى المناطق الأخيرة', () => {
      component.applyFilters();

      expect(TestBed.inject(RecentAreasService).list()).toEqual([]);
    });
  });

  describe('البحث النصي', () => {
    it('✅ نص البحث يصل فعلياً إلى الـ API (كان مفقوداً تماماً قبل هذا الإصلاح)', () => {
      component.searchText = 'شقة دمشق';
      component.applyFilters();

      expect(lastRequest().searchTerm).toBe('شقة دمشق');
    });

    it('✅ نص فارغ/مسافات فقط لا يُرسَل كفلتر', () => {
      component.searchText = '   ';
      component.applyFilters();

      expect(lastRequest().searchTerm).toBeUndefined();
    });
  });

  describe('دمج Search + Filters في طلب واحد', () => {
    it('✅ كل الفلاتر النشطة تُرسَل معاً ضمن نفس الطلب', () => {
      component.searchText = 'apartment';
      component.cityFilter = 'Damascus';
      component.governorateId = 3;
      component.minPrice = 100;
      component.maxPrice = 500;
      component.selectedListingType = 'ForRent';

      component.applyFilters();

      expect(propertyApiSpy.getPropertiesPaged).toHaveBeenCalledTimes(2); // initial load + apply
      const req = lastRequest();
      expect(req.searchTerm).toBe('apartment');
      expect(req.city).toBe('Damascus');
      expect(req.governorateId).toBe(3);
      expect(req.minPrice).toBe(100);
      expect(req.maxPrice).toBe(500);
      expect(req.listingType).toBe('ForRent');
    });
  });

  describe('Pagination', () => {
    it('✅ تغيير فلتر يعيد الصفحة إلى 1', () => {
      component.goToPage(3);
      expect(lastRequest().page).toBe(3);

      component.cityFilter = 'Aleppo';
      component.applyFilters();

      expect(lastRequest().page).toBe(1);
    });

    it('✅ الانتقال بين الصفحات يحافظ على الفلاتر الحالية', () => {
      component.cityFilter = 'Homs';
      component.minPrice = 200;
      component.applyFilters();

      component.goToPage(2);

      const req = lastRequest();
      expect(req.page).toBe(2);
      expect(req.city).toBe('Homs');
      expect(req.minPrice).toBe(200);
    });
  });

  describe('Reset Filters', () => {
    it('✅ يمسح كل حالة الفلاتر ويُصفّر الـ URL بالكامل', () => {
      component.searchText = 'x';
      component.cityFilter = 'Latakia';
      component.governorateId = 2;
      component.minPrice = 50;
      component.selectedAmenityIds = ['a1'];
      component.goToPage(3);

      component.resetFilters();

      // The URL ends up clean: every parameter is dropped (null), nothing of the old search survives.
      expect(routerSpy.navigate).toHaveBeenCalledWith([], jasmine.objectContaining({
        queryParams: jasmine.objectContaining({ search: null, city: null, governorateId: null, minPrice: null, amenityIds: null, page: null })
      }));
      expect(component.searchText).toBe('');
      expect(component.cityFilter).toBe('');
      expect(component.governorateId).toBeNull();
      expect(component.minPrice).toBeNull();
      expect(component.selectedAmenityIds).toEqual([]);

      const req = lastRequest();
      expect(req.page).toBe(1);
      expect(req.city).toBeUndefined();
      expect(req.searchTerm).toBeUndefined();
    });
  });

  describe('اسم المحافظة المكتوب كمدينة يُرسَل كفلتر محافظة', () => {
    const damascus = { id: 1, nameAr: 'دمشق', nameEn: 'Damascus' };
    const ruralDamascus = { id: 2, nameAr: 'ريف دمشق', nameEn: 'Rural Damascus' };

    beforeEach(() => component.governorates.set([damascus, ruralDamascus]));

    it('✅ بلا محافظة مختارة: «دمشق» تصبح governorateId=1 ولا تُرسَل مدينة', () => {
      component.cityFilter = 'دمشق';
      component.applyFilters();

      const req = lastRequest();
      expect(req.governorateId).toBe(1);
      expect(req.city).toBeUndefined();
      expect(routerSpy.navigate).toHaveBeenCalledWith([], jasmine.objectContaining({
        queryParams: jasmine.objectContaining({ governorateId: 1, city: null })
      }));
    });

    it('✅ الاسم الإنجليزي بأي حالة أحرف يعطي النتيجة نفسها، و«ريف دمشق» لا تختلط بـ«دمشق»', () => {
      component.cityFilter = '  damascus ';
      component.applyFilters();
      expect(lastRequest().governorateId).toBe(1);

      component.cityFilter = 'RURAL DAMASCUS';
      component.governorateId = null;
      component.applyFilters();
      expect(lastRequest().governorateId).toBe(2);
      expect(lastRequest().city).toBeUndefined();
    });

    it('✅ مع المحافظة نفسها مختارة تُحذف المدينة ويبقى فلتر المحافظة', () => {
      component.governorateId = 1;
      component.cityFilter = 'Damascus';
      component.applyFilters();

      expect(lastRequest().governorateId).toBe(1);
      expect(lastRequest().city).toBeUndefined();
    });

    it('✅ اسم محافظة أخرى غير المختارة ينقل الاختيار إليها ويمسح المنطقة والحي القديمين', () => {
      component.governorateId = 1;
      component.districtId = 11;
      component.neighborhoodId = 111;
      component.cityFilter = 'ريف دمشق';
      component.applyFilters();

      const req = lastRequest();
      expect(req.governorateId).toBe(2);
      expect(req.districtId).toBeUndefined();
      expect(req.neighborhoodId).toBeUndefined();
      expect(req.city).toBeUndefined();
    });

    it('✅ اسم المحافظة المختارة نفسها لا يمسح المنطقة والحي', () => {
      component.governorateId = 1;
      component.districtId = 11;
      component.neighborhoodId = 111;
      component.cityFilter = 'دمشق';
      component.applyFilters();

      const req = lastRequest();
      expect(req.governorateId).toBe(1);
      expect(req.districtId).toBe(11);
      expect(req.neighborhoodId).toBe(111);
    });

    it('✅ مدينة عادية (ليست اسم محافظة) تبقى بحثًا نصيًا كما هي', () => {
      component.cityFilter = 'Jaramana';
      component.applyFilters();

      expect(lastRequest().city).toBe('Jaramana');
      expect(lastRequest().governorateId).toBeUndefined();
    });

    it('✅ البحث المحفوظ يحفظ المحافظة لا نص المدينة', () => {
      const savedSearchApi = TestBed.inject(SavedSearchApiService) as jasmine.SpyObj<SavedSearchApiService>;
      savedSearchApi.create.and.returnValue(of({} as never));
      spyOn(window, 'prompt').and.returnValue('بحثي');

      component.cityFilter = 'دمشق';
      component.saveCurrentSearch();

      expect(savedSearchApi.create).toHaveBeenCalledWith(jasmine.objectContaining({ City: null, GovernorateId: 1 }));
    });
  });

  describe('العملة (P7-D01)', () => {
    it('✅ تبدأ بعملة العرض المفضلة للمستخدم إن كانت في القائمة، وإلا بالدولار (الأساس)', () => {
      expect(component.currencyCode).toBe('USD');
      expect(createComponent({}, 'SYP').currencyCode).toBe('SYP');
      expect(createComponent({}, 'SAR').currencyCode).toBe('USD');
    });

    it('✅ لا تُرسَل العملة (ولا تظهر في الرابط) بلا حدّ سعر', () => {
      component.currencyCode = 'SYP';
      component.searchText = 'شقة';
      component.applyFilters();

      expect(lastRequest().currencyCode).toBeUndefined();
      expect(routerSpy.navigate).toHaveBeenCalledWith([], jasmine.objectContaining({
        queryParams: jasmine.objectContaining({ currency: null })
      }));
    });

    it('✅ مع حدّ سعر تُرسَل العملة إلى الـ API وتُحفظ في الرابط', () => {
      component.currencyCode = 'SYP';
      component.maxPrice = 500000;
      component.applyFilters();

      expect(lastRequest().currencyCode).toBe('SYP');
      expect(lastRequest().maxPrice).toBe(500000);
      expect(routerSpy.navigate).toHaveBeenCalledWith([], jasmine.objectContaining({
        queryParams: jasmine.objectContaining({ currency: 'SYP', maxPrice: 500000 })
      }));
    });

    it('✅ رابط قديم بعملة لم تعد قابلة للبحث (TRY) يعود إلى العملة الافتراضية بدل أن يرفضه الخادم', () => {
      const instance = createComponent({ minPrice: '100', currency: 'try' });

      expect(instance.currencyCode).toBe('USD');
      expect(lastRequest().currencyCode).toBe('USD');
    });

    it('✅ رابط يحمل currency=eur يُقرأ بأحرف كبيرة ويُرسَل مع السعر', () => {
      const instance = createComponent({ minPrice: '100', currency: 'eur' });

      expect(instance.currencyCode).toBe('EUR');
      expect(lastRequest().currencyCode).toBe('EUR');
    });

    it('✅ البحث المحفوظ يحفظ العملة مع المدى', () => {
      const savedSearchApi = TestBed.inject(SavedSearchApiService) as jasmine.SpyObj<SavedSearchApiService>;
      savedSearchApi.create.and.returnValue(of({} as never));
      spyOn(window, 'prompt').and.returnValue('');

      component.currencyCode = 'SYP';
      component.minPrice = 1000;
      component.saveCurrentSearch();

      expect(savedSearchApi.create).toHaveBeenCalledWith(jasmine.objectContaining({ MinPrice: 1000, CurrencyCode: 'SYP' }));
    });

    it('✅ السعر المكافئ التقريبي يظهر فقط أثناء فلترة السعر ولإعلان بعملة مختلفة', () => {
      const flatInDollars = { id: 'a', currencyCode: 'USD', purchasePrice: 100 } as Property;
      const flatInPounds = { id: 'b', currencyCode: 'SYP', purchasePrice: 1_400_000 } as Property;

      expect(component.equivalentPrice(flatInDollars)).toBeNull(); // no price filter -> nothing to explain

      component.currencyCode = 'SYP';
      component.maxPrice = 5_000_000;
      expect(component.equivalentPrice(flatInDollars)).toContain('≈');
      expect(component.equivalentPrice(flatInPounds)).toBeNull(); // already in the chosen currency
    });
  });

  describe('الفرز بالسعر (P7-D02)', () => {
    it('✅ تحت «الكل» لا يُرسَل فرز السعر ويُستعمل الأحدث أولًا', () => {
      component.sortBy = 'PriceDesc';
      component.applyFilters();

      expect(lastRequest().sortBy).toBe('CreatedAt');
      expect(component.canSortByPrice).toBeFalse();
    });

    it('✅ مع نوع إعلان يُرسَل sortBy=Price الموحّد للبيع وللإيجار', () => {
      component.selectListingType('ForSale');
      component.sortBy = 'Price';
      component.applyFilters();
      expect(lastRequest().sortBy).toBe('Price');
      expect(lastRequest().sortDescending).toBeFalse();

      component.selectListingType('ForRent');
      component.sortBy = 'PriceDesc';
      component.applyFilters();
      expect(lastRequest().sortBy).toBe('Price');
      expect(lastRequest().sortDescending).toBeTrue();
    });

    it('✅ العودة إلى «الكل» تُرجع الفرز إلى الأحدث بدل ترك فرز لا يعمل', () => {
      component.selectListingType('ForSale');
      component.sortBy = 'Price';

      component.selectListingType('');

      expect(component.sortBy).toBe('CreatedAt');
    });
  });

  describe('أخطاء المدخلات والرابط (P7-D06, P7-D07)', () => {
    it('✅ مدى سعر معكوس لا يُرسَل للخادم ويظهر سببه مترجمًا', () => {
      const before = propertyApiSpy.getPropertiesPaged.calls.count();
      component.minPrice = 900;
      component.maxPrice = 100;

      component.applyFilters();

      expect(propertyApiSpy.getPropertiesPaged.calls.count()).toBe(before);
      expect(component.filterError()).toBe('PROPERTY_LIST.PRICE_RANGE_INVERTED');

      component.minPrice = 50;
      component.applyFilters();
      expect(component.filterError()).toBe('');
      expect(propertyApiSpy.getPropertiesPaged.calls.count()).toBe(before + 1);
    });

    it('✅ رفض الخادم للفلاتر (422) يظهر كخطأ فلاتر لا كعطل تحميل', () => {
      propertyApiSpy.getPropertiesPaged.and.returnValue(throwError(() => new HttpErrorResponse({ status: 422 })));
      component.searchText = 'أ';
      component.applyFilters();
      expect(component.error()).toBe('PROPERTY_LIST.INVALID_FILTERS');

      propertyApiSpy.getPropertiesPaged.and.returnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
      component.searchText = 'ب';
      component.applyFilters();
      expect(component.error()).toBe('PROPERTY_LIST.LOAD_ERROR');
    });

    it('✅ page أكبر من الأخير يرجع تلقائيًا إلى آخر صفحة صالحة بدل قائمة فارغة', () => {
      propertyApiSpy.getPropertiesPaged.and.callFake((filter: PropertyFilterDto = {}) =>
        of(filter.page === 5 ? pagedResult([{ id: 'last' } as Property], 5, 100) : pagedResult([], filter.page ?? 1, 100))
      );

      paramMapSubject.next(toParamMap({ page: '99' }));

      expect(routerSpy.navigate).toHaveBeenCalledWith([], jasmine.objectContaining({ replaceUrl: true }));
      expect(component.currentPage()).toBe(5);
      expect(component.properties().map(p => p.id)).toEqual(['last']);
    });

    it('✅ page وpageSize خارج المدى المسموح يُقصّان قبل الإرسال', () => {
      const withItems = (filter: PropertyFilterDto = {}) => of(pagedResult([{ id: 'x' } as Property], filter.page ?? 1, 100_000, filter.pageSize ?? 20));
      propertyApiSpy.getPropertiesPaged.and.callFake(withItems);

      paramMapSubject.next(toParamMap({ page: '999999', pageSize: '500' }));
      expect(lastRequest().pageSize).toBe(100);
      expect(lastRequest().page).toBe(100); // 10 000 rows / 100 per page

      paramMapSubject.next(toParamMap({ page: '-4', pageSize: 'abc' }));
      expect(lastRequest().page).toBe(1);
      expect(lastRequest().pageSize).toBe(20);
    });
  });

  describe('محجوز (P7-D08)', () => {
    it('✅ البطاقة المحجوزة تُميَّز، والعادية لا', () => {
      expect(component.isReserved({ id: 'a', status: 'Reserved' } as Property)).toBeTrue();
      expect(component.isReserved({ id: 'b', status: 'Available' } as Property)).toBeFalse();
    });
  });

  describe('ربط الحالة بالـ URL (deep link / refresh / back-forward)', () => {
    it('✅ فتح الصفحة بمعاملات موجودة مسبقاً (رابط محفوظ بحث/hero search) يملأ لوحة الفلاتر ويُنفّذ الطلب المطابق', () => {
      const instance = createComponent({ city: 'Damascus', page: '2', minPrice: '300', governorateId: '5' });

      expect(instance.cityFilter).toBe('Damascus');
      expect(instance.currentPage()).toBe(2);
      expect(instance.minPrice).toBe(300);
      expect(instance.governorateId).toBe(5);

      const calls = propertyApiSpy.getPropertiesPaged.calls.all();
      const req = calls[calls.length - 1].args[0] as PropertyFilterDto;
      expect(req.city).toBe('Damascus');
      expect(req.page).toBe(2);
      expect(req.minPrice).toBe(300);
      expect(req.governorateId).toBe(5);
    });

    it('✅ تغيّر خارجي في queryParamMap (محاكاة زر رجوع/تقدّم المتصفح) يُعيد مزامنة الحالة والطلب', () => {
      paramMapSubject.next(toParamMap({ city: 'Aleppo', page: '4' }));

      expect(component.cityFilter).toBe('Aleppo');
      expect(component.currentPage()).toBe(4);
      expect(lastRequest().city).toBe('Aleppo');
      expect(lastRequest().page).toBe(4);
    });
  });

  describe('حماية من Race Conditions', () => {
    it('✅ استجابة بطيئة لطلب قديم لا تطغى على نتيجة طلب أحدث (switchMap)', () => {
      const firstResponse$ = new Subject<PagedResult<Property>>();
      const secondResponse$ = new Subject<PagedResult<Property>>();
      // The initial load already happened in the outer beforeEach's createComponent() call,
      // consuming the default .and.returnValue(...) — these two values map to the two
      // applyFilters() calls below, in order.
      propertyApiSpy.getPropertiesPaged.and.returnValues(firstResponse$, secondResponse$);

      component.cityFilter = 'Damascus';
      component.applyFilters(); // fires the first (slow) request

      component.cityFilter = 'Aleppo';
      component.applyFilters(); // fires the second (fast) request — should cancel the first

      // The newer request's response arrives first...
      secondResponse$.next(pagedResult([{ id: 'aleppo-1' } as Property], 1, 1));
      secondResponse$.complete();

      // ...and the older, slower request's response arrives after — switchMap has already
      // unsubscribed from it, so it must NOT overwrite the newer result.
      firstResponse$.next(pagedResult([{ id: 'damascus-1' } as Property], 1, 1));
      firstResponse$.complete();

      expect(component.properties()).toEqual([{ id: 'aleppo-1' } as Property]);
    });
  });

  describe('بحث المكان (locationId)', () => {
    it('✅ اختيار مكان يرسل locationId ويمسح فلتر المحافظة والمنطقة والمدينة', () => {
      component.governorateId = 1;
      component.districtId = 11;
      component.cityFilter = 'Damascus';

      component.onPlaceFilterPicked(place(77, 'Neighborhood', 'الجادات', 'Jadat'));
      component.applyFilters();

      const req = lastRequest();
      expect(req.locationId).toBe(77);
      expect(req.governorateId).toBeUndefined();
      expect(req.districtId).toBeUndefined();
      expect(req.city).toBeUndefined();
    });

    it('✅ locationId في الرابط يُرسل للـ API ويُجلب اسم المكان للعرض', () => {
      component = createComponent({ locationId: '77' });

      expect(lastRequest().locationId).toBe(77);
      expect(locationsApiSpy.get).toHaveBeenCalledWith(77);
      expect(component.locationPlace()?.nameEn).toBe('Jadat');
    });

    it('✅ locationId غير صالح في الرابط يُتجاهل', () => {
      component = createComponent({ locationId: 'abc' });
      expect(lastRequest().locationId).toBeUndefined();
      expect(locationsApiSpy.get).not.toHaveBeenCalled();
    });

    it('✅ تغيير المحافظة يمسح المكان المحدّد، وإعادة الضبط تمسحه من الحالة', () => {
      component.onPlaceFilterPicked(place(77, 'Neighborhood', 'الجادات', 'Jadat'));
      component.governorateId = 2;
      component.onGovernorateChange();
      expect(component.locationId).toBeNull();
      expect(component.locationPlace()).toBeNull();

      component.onPlaceFilterPicked(place(78, 'Street', 'شارع', 'Street'));
      component.resetFilters();
      expect(component.locationId).toBeNull();
    });
  });


  describe('district / neighborhood typed by hand', () => {
    it('✅ الكلمات المكتوبة تذهب إلى placeText (كلها مطلوبة)، ونص البحث يبقى وحده في searchTerm', () => {
      component.governorateId = 1;
      component.searchText = 'شقة';
      component.onDistrictTyped('الميدان');
      component.onNeighborhoodTyped('الحارة الجديدة');
      component.applyFilters();

      expect(lastRequest().searchTerm).toBe('شقة');
      expect(lastRequest().placeText).toBe('الميدان الحارة الجديدة');
      expect(lastRequest().districtId).toBeUndefined();
      expect(component.activeFiltersCount).toBeGreaterThanOrEqual(4);
    });

    it('✅ تحفظ في الرابط وتُستعاد عند فتحه أو عند إعادة التحميل', () => {
      component.governorateId = 1;
      component.onDistrictTyped('الميدان');
      component.applyFilters();
      const url = routerSpy.navigate.calls.mostRecent().args[1] as { queryParams: Record<string, unknown> };
      expect(url.queryParams['districtText']).toBe('الميدان');

      component = createComponent({ governorateId: '1', districtText: 'الميدان' });
      expect(component.districtText).toBe('الميدان');
      expect(lastRequest().searchTerm).toBeUndefined();
      expect(lastRequest().placeText).toBe('الميدان');
    });

    it('✅ المسافة بين كلمتين تبقى أثناء الكتابة (لا يُقصّ النص المخزَّن)', () => {
      component.onDistrictTyped('باب ');
      expect(component.districtText).toBe('باب ');
    });

    it('✅ اختيار عنصر من القائمة يمسح النص المكتوب، وكتابة نص تمسح الاختيار', () => {
      component.districtId = 5;
      component.onDistrictTyped('اسم حر');
      expect(component.districtId).toBeNull();

      component.onDistrictTyped(null);
      expect(component.districtText).toBe('');
    });

    it('✅ تغيير المحافظة وإعادة الضبط يمسحان النصوص المكتوبة', () => {
      component.onDistrictTyped('الميدان');
      component.onNeighborhoodTyped('الحارة');
      component.governorateId = 2;
      component.onGovernorateChange();
      expect(component.districtText).toBe('');
      expect(component.neighborhoodText).toBe('');

      component.onDistrictTyped('x');
      component.resetFilters();
      expect(component.districtText).toBe('');
    });
  });

  describe('المدينة لم تعد حقلًا في اللوحة', () => {
    it('✅ مدينة قادمة من رابط قديم تبقى فعّالة وتُرسَل، حتى لا يوجد فلتر مخفي', () => {
      component = createComponent({ city: 'Jaramana' });
      expect(component.cityFilter).toBe('Jaramana');
      expect(lastRequest().city).toBe('Jaramana');
      expect(component.activeFiltersCount).toBe(1);
    });

    it('✅ إزالة الشريحة تمسح المدينة من الطلب ومن الرابط', () => {
      component = createComponent({ city: 'Jaramana' });
      component.removeCityFilter();
      component.applyFilters();

      expect(lastRequest().city).toBeUndefined();
      expect(routerSpy.navigate.calls.mostRecent().args[1]).toEqual(jasmine.objectContaining({
        queryParams: jasmine.objectContaining({ city: null })
      }));
      expect(component.activeFiltersCount).toBe(0);
    });

    it('✅ لا يُطلب اقتراح المدن من الخادم بعد الآن', () => {
      component.governorateId = 1;
      component.onGovernorateChange();
      expect(lookupsApiSpy.getCities).not.toHaveBeenCalled();
    });
  });

  describe('مربع المكان: نص العنوان (placeText)', () => {
    it('✅ «ابحث عن X في عناوين الإعلانات» يُطبَّق كـ placeText وينتقل إلى الرابط ويُستعاد منه', () => {
      component.onPlaceTextPicked('  بغداد ');
      component.applyFilters();

      expect(lastRequest().placeText).toBe('بغداد');
      expect(lastRequest().searchTerm).toBeUndefined();
      expect(routerSpy.navigate.calls.mostRecent().args[1]).toEqual(jasmine.objectContaining({
        queryParams: jasmine.objectContaining({ placeText: 'بغداد' })
      }));
      expect(component.activeFiltersCount).toBe(1);

      component = createComponent({ placeText: 'بغداد' });
      expect(component.addressText).toBe('بغداد');
      expect(lastRequest().placeText).toBe('بغداد');
    });

    it('✅ النص المكتوب في المربع ولم يُختَر شيء يُطبَّق عند «تطبيق» بدل أن يضيع بصمت', () => {
      component.onPlaceTyped('شارع الثورة');
      component.applyFilters();

      expect(component.addressText).toBe('شارع الثورة');
      expect(lastRequest().placeText).toBe('شارع الثورة');
    });

    it('✅ مكان من الكتالوج ونص عنوان لا يجتمعان: كل منهما يلغي الآخر', () => {
      component.onPlaceTextPicked('بغداد');
      component.onPlaceFilterPicked(place(77, 'Neighborhood', 'الجادات', 'Jadat'));
      expect(component.addressText).toBe('');
      expect(component.locationId).toBe(77);

      component.onPlaceTextPicked('بغداد');
      expect(component.locationId).toBeNull();
      expect(component.locationPlace()).toBeNull();
    });

    it('✅ المكان المختار نفسه المكتوب في المربع لا يتحوّل إلى نص عنوان', () => {
      component.onPlaceFilterPicked(place(77, 'Neighborhood', 'الجادات', 'Jadat'));
      component.onPlaceTyped('الجادات');
      component.applyFilters();

      expect(component.addressText).toBe('');
      expect(lastRequest().locationId).toBe(77);
      expect(lastRequest().placeText).toBeUndefined();
    });

    it('✅ إفراغ المربع (مسح المكان) يزيل النص المطبَّق، وإعادة الضبط تمسحه', () => {
      component.onPlaceTextPicked('بغداد');
      component.onPlaceFilterPicked(null);
      expect(component.addressText).toBe('');

      component.onPlaceTextPicked('بغداد');
      component.resetFilters();
      expect(component.addressText).toBe('');
      expect(lastRequest().placeText).toBeUndefined();
    });

    it('✅ placeText يُدمج مع الحي المكتوب، وكلاهما شرط (لا يوسّع البحث)', () => {
      component.governorateId = 1;
      component.onPlaceTextPicked('بغداد');
      component.onDistrictTyped('الميدان');
      component.applyFilters();

      expect(lastRequest().placeText).toBe('بغداد الميدان');
    });
  });

  describe('«القريبة مني» تحترم كل الفلاتر وتبقى فعّالة', () => {
    let getCurrentPosition: jasmine.Spy;

    beforeEach(() => {
      getCurrentPosition = spyOn(navigator.geolocation, 'getCurrentPosition').and.callFake(
        ((success: PositionCallback) => success({ coords: { latitude: 33.5, longitude: 36.3 } } as GeolocationPosition)) as typeof navigator.geolocation.getCurrentPosition
      );
    });

    function lastGeoCall() {
      const calls = propertyApiSpy.geoSearch.calls.all();
      return calls[calls.length - 1].args as [number, number, number, PropertyFilterDto];
    }

    it('✅ التفعيل يرسل الإحداثيات ونصف القطر وكل الفلاتر المعتمدة (لا نوع الإعلان وحده)', () => {
      component.searchText = 'شقة';
      component.selectedListingType = 'ForSale';
      component.minPrice = 100;
      component.propertyTypeId = 4;
      component.selectedAmenityIds = ['a1'];
      component.onPlaceTextPicked('بغداد');
      propertyApiSpy.getPropertiesPaged.calls.reset();

      component.toggleGeoMode();

      expect(component.geoModeActive()).toBeTrue();
      expect(propertyApiSpy.getPropertiesPaged).not.toHaveBeenCalled();
      const [lat, lng, radius, filter] = lastGeoCall();
      expect([lat, lng, radius]).toEqual([33.5, 36.3, 5]);
      expect(filter).toEqual(jasmine.objectContaining({
        page: 1, searchTerm: 'شقة', placeText: 'بغداد', listingType: 'ForSale', minPrice: 100, propertyTypeId: 4, amenityIds: ['a1']
      }));
    });

    it('✅ لا يُرسل إلى البحث القريب ترتيب ولا مناطق اهتمام (النتائج حسب القرب)', () => {
      interestParam = '3,7';
      component.toggleGeoMode();
      const filter = lastGeoCall()[3];
      expect('sortBy' in filter).toBeFalse();
      expect('sortDescending' in filter).toBeFalse();
      expect('interestGovernorateIds' in filter).toBeFalse();
    });

    it('✅ الترقيم في الوضع القريب يبقى قريبًا (صفحة 2 من البحث القريب، لا من القائمة العادية)', () => {
      component.toggleGeoMode();
      propertyApiSpy.getPropertiesPaged.calls.reset();
      propertyApiSpy.geoSearch.calls.reset();

      component.goToPage(2);

      expect(propertyApiSpy.getPropertiesPaged).not.toHaveBeenCalled();
      expect(lastGeoCall()[3].page).toBe(2);
      expect(component.geoModeActive()).toBeTrue();
      expect(component.currentPage()).toBe(2);
    });

    it('✅ «تطبيق الفلاتر» داخل الوضع القريب يبقيه فعّالًا ويضيف الفلتر إلى طلب البحث القريب', () => {
      component.toggleGeoMode();
      propertyApiSpy.geoSearch.calls.reset();

      component.selectedListingType = 'ForRent';
      component.applyFilters();

      expect(component.geoModeActive()).toBeTrue();
      expect(propertyApiSpy.geoSearch).toHaveBeenCalledTimes(1);
      expect(lastGeoCall()[3].listingType).toBe('ForRent');
    });

    it('✅ «تطبيق» دون تغيير داخل الوضع القريب لا يطلب مرة ثانية', () => {
      component.toggleGeoMode();
      propertyApiSpy.geoSearch.calls.reset();
      component.applyFilters();
      expect(propertyApiSpy.geoSearch).not.toHaveBeenCalled();
    });

    it('✅ تغيير نصف القطر يعيد البحث بالموقع المعروف دون طلب إذن موقع جديد', () => {
      component.toggleGeoMode();
      expect(getCurrentPosition).toHaveBeenCalledTimes(1);
      propertyApiSpy.geoSearch.calls.reset();

      component.radiusKm = 20;
      component.onRadiusChange();

      expect(getCurrentPosition).toHaveBeenCalledTimes(1);
      expect(propertyApiSpy.geoSearch).toHaveBeenCalledTimes(1);
      expect(lastGeoCall()[2]).toBe(20);
    });

    it('✅ الإلغاء يعود إلى القائمة العادية بطلب واحد وبالفلاتر نفسها، ويمسح الموقع', () => {
      component.searchText = 'شقة';
      component.applyFilters();
      component.toggleGeoMode();
      propertyApiSpy.getPropertiesPaged.calls.reset();
      propertyApiSpy.geoSearch.calls.reset();

      component.toggleGeoMode();

      expect(component.geoModeActive()).toBeFalse();
      expect(propertyApiSpy.geoSearch).not.toHaveBeenCalled();
      expect(propertyApiSpy.getPropertiesPaged).toHaveBeenCalledTimes(1);
      expect(lastRequest().searchTerm).toBe('شقة');
      component.onRadiusChange();
      expect(propertyApiSpy.geoSearch).not.toHaveBeenCalled();
    });

    it('✅ إعادة التعيين تُخرج من الوضع القريب وتُحدّث النتائج حتى لو كان الرابط نظيفًا أصلًا', () => {
      component.toggleGeoMode();
      propertyApiSpy.getPropertiesPaged.calls.reset();

      component.resetFilters();

      expect(component.geoModeActive()).toBeFalse();
      expect(propertyApiSpy.getPropertiesPaged).toHaveBeenCalledTimes(1);
    });

    it('✅ رفض الإذن لا يفعّل الوضع ولا يرسل طلبًا', () => {
      getCurrentPosition.and.callFake(((_ok: PositionCallback, fail: PositionErrorCallback) => fail({ code: 1 } as GeolocationPositionError)) as typeof navigator.geolocation.getCurrentPosition);
      propertyApiSpy.geoSearch.calls.reset();

      component.toggleGeoMode();

      expect(component.geoModeActive()).toBeFalse();
      expect(component.geoLoading()).toBeFalse();
      expect(propertyApiSpy.geoSearch).not.toHaveBeenCalled();
    });

    it('✅ خطأ البحث القريب يظهر كخطأ قابل لإعادة المحاولة بنفس الوضع', () => {
      component.toggleGeoMode();
      propertyApiSpy.geoSearch.and.returnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
      component.loadProperties();
      expect(component.error()).toBe('PROPERTY_LIST.LOAD_ERROR');

      propertyApiSpy.geoSearch.and.callFake((_a: number, _b: number, _c?: number, f: PropertyFilterDto = {}) => of(pagedResult([], f.page ?? 1, 5)));
      component.loadProperties();
      expect(component.error()).toBe('');
      expect(component.totalCount()).toBe(5);
    });
  });

  describe('«تطبيق» دون تغيير في الرابط', () => {
    it('✅ لا طلب جديد، لكن النتائج تُعرض فورًا (الزر ليس ميتًا)', async () => {
      const region = document.createElement('main');
      spyOn(region, 'scrollIntoView');
      spyOn(region, 'focus');
      component['resultsRegion'] = { nativeElement: region };
      propertyApiSpy.getPropertiesPaged.calls.reset();

      component.applyFilters();
      await new Promise<void>(resolve => setTimeout(resolve, 0));

      expect(propertyApiSpy.getPropertiesPaged).not.toHaveBeenCalled();
      expect(region.scrollIntoView).toHaveBeenCalledTimes(1);
    });
  });

  describe('قسم المرافق القابل للطي', () => {
    it('✅ مغلق افتراضيًا، والنقر على الرأس يفتحه ويغلقه، والاختيارات تبقى', () => {
      expect(component.amenitiesOpen).toBeFalse();
      component.toggleAmenityFilter('a1');
      component.toggleAmenityFilter('a2');

      component.toggleAmenitiesSection();
      expect(component.amenitiesOpen).toBeTrue();
      component.toggleAmenitiesSection();
      expect(component.amenitiesOpen).toBeFalse();

      expect(component.selectedAmenityIds).toEqual(['a1', 'a2']);
      expect(component.isAmenitySelected('a2')).toBeTrue();
    });

    it('✅ الاختيارات تُرسل مع الفلتر وتُحسب، وإعادة الضبط تمسحها', () => {
      component.toggleAmenityFilter('a1');
      component.applyFilters();
      expect(lastRequest().amenityIds).toEqual(['a1']);
      expect(component.activeFiltersCount).toBe(1);

      component.resetFilters();
      expect(component.selectedAmenityIds).toEqual([]);
    });
  });

  describe('تطبيق الفلاتر يوصل إلى النتائج', () => {
    function fakeRegion() {
      const region = document.createElement('main');
      spyOn(region, 'scrollIntoView');
      spyOn(region, 'focus');
      component['resultsRegion'] = { nativeElement: region };
      return region;
    }

    const nextTask = () => new Promise<void>(resolve => setTimeout(resolve, 0));

    it('✅ بعد الضغط على «تطبيق» وبعد وصول الجواب تُعرض بداية النتائج وتأخذ التركيز', async () => {
      const region = fakeRegion();
      component.applyFilters();
      await nextTask();

      expect(region.scrollIntoView).toHaveBeenCalledTimes(1);
      expect(region.focus).toHaveBeenCalled();
    });

    it('✅ الجواب الفارغ («لا توجد عقارات مطابقة») يُعرض أيضًا بالطريقة نفسها', async () => {
      const region = fakeRegion();
      propertyApiSpy.getPropertiesPaged.and.returnValue(of(pagedResult([], 1, 0)));
      component.searchText = 'لا شيء';
      component.applyFilters();
      await nextTask();

      expect(component.properties().length).toBe(0);
      expect(component.activeFiltersCount).toBeGreaterThan(0);
      expect(region.scrollIntoView).toHaveBeenCalled();
    });

    it('✅ الخطأ يُعرض كذلك، ولا يحدث تمرير عند مجرد فتح الصفحة أو تغيير الصفحة', async () => {
      const region = fakeRegion();
      component.goToPage(2);
      await nextTask();
      expect(region.scrollIntoView).not.toHaveBeenCalled();

      propertyApiSpy.getPropertiesPaged.and.returnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
      component.applyFilters();
      await nextTask();
      expect(component.error()).toBeTruthy();
      expect(region.scrollIntoView).toHaveBeenCalledTimes(1);
    });
  });


  describe('فلتر الطابق', () => {
    /** The one request the floors endpoint received last (its argument is the list's filters without the floor). */
    function lastFloorsScope(): PropertyFilterDto {
      const calls = propertyApiSpy.getAvailableFloors.calls.all();
      return calls[calls.length - 1].args[0] as PropertyFilterDto;
    }

    it('✅ الطابق الأرضي (0) يصل إلى الطلب ولا يُعامَل كقيمة فارغة', () => {
      component = createComponent({ floorFrom: '0', floorTo: '0' });

      expect(component.floorFrom).toBe(0);
      expect(component.floorTo).toBe(0);
      expect(component.specificFloor).toBe(0);
      expect(lastRequest()).toEqual(jasmine.objectContaining({ floorFrom: 0, floorTo: 0 }));
    });

    it('✅ المدى من الرابط يملأ الحقلين ويصل إلى الطلب', () => {
      component = createComponent({ floorFrom: '1', floorTo: '5' });

      expect(component.specificFloor).toBeNull();
      expect(lastRequest()).toEqual(jasmine.objectContaining({ floorFrom: 1, floorTo: 5 }));
      expect(lastRequest().floorMode).toBeUndefined();
    });

    it('✅ أعلى/أدنى طابق متاح من الرابط يصل كـ floorMode ويُلغي المدى', () => {
      component = createComponent({ floorMode: 'highest', floorFrom: '2', floorTo: '3' });

      expect(component.floorMode).toBe('highest');
      expect(component.floorFrom).toBeNull();
      expect(component.floorTo).toBeNull();
      expect(lastRequest()).toEqual(jasmine.objectContaining({ floorMode: 'highest' }));
      expect(lastRequest().floorFrom).toBeUndefined();
    });

    it('✅ قيمة طابق غير صالحة في الرابط (سالبة، كسر، نص، فوق 200) تُهمل ولا تُرسل', () => {
      component = createComponent({ floorFrom: '-3', floorTo: 'abc', floorMode: 'middle' });
      expect(component.floorFrom).toBeNull();
      expect(component.floorTo).toBeNull();
      expect(component.floorMode).toBeNull();

      component = createComponent({ floorFrom: '2.5', floorTo: '201' });
      expect(component.floorFrom).toBeNull();
      expect(component.floorTo).toBeNull();
      expect(lastRequest().floorFrom).toBeUndefined();
    });

    it('✅ طابق فوق 50 يُقبل: 50 افتراضٌ في الواجهة لا حدٌّ للبيانات', () => {
      component = createComponent({ floorFrom: '120', floorTo: '120' });

      expect(lastRequest()).toEqual(jasmine.objectContaining({ floorFrom: 120, floorTo: 120 }));
      expect(component.floorList()).toContain(120);
    });

    it('✅ «تطبيق» يضع الطابق في الرابط (0 يبقى 0) وبقية الصفحات تحفظه', () => {
      component.onSpecificFloor(0);
      component.applyFilters();

      expect(routerSpy.navigate).toHaveBeenCalledWith([], jasmine.objectContaining({
        queryParams: jasmine.objectContaining({ floorFrom: 0, floorTo: 0, floorMode: null })
      }));

      component.goToPage(3);
      expect(lastRequest()).toEqual(jasmine.objectContaining({ page: 3, floorFrom: 0, floorTo: 0 }));
    });

    it('✅ اختيار أعلى طابق ثم تطبيق: floorMode في الرابط ولا مدى', () => {
      component.toggleFloorMode('highest');
      component.applyFilters();

      expect(routerSpy.navigate).toHaveBeenCalledWith([], jasmine.objectContaining({
        queryParams: jasmine.objectContaining({ floorMode: 'highest', floorFrom: null, floorTo: null })
      }));
      expect(lastRequest().floorMode).toBe('highest');
    });

    it('✅ الأوضاع الثلاثة لا تتعارض: الخيار السريع يمسح المدى، والمدى يمسح الخيار السريع، والطابق المحدد يملأ الحدّين', () => {
      component.onFloorFrom(1);
      component.onFloorTo(4);
      component.toggleFloorMode('lowest');
      expect([component.floorMode, component.floorFrom, component.floorTo]).toEqual(['lowest', null, null]);

      component.onSpecificFloor(3);
      expect([component.floorMode, component.floorFrom, component.floorTo]).toEqual([null, 3, 3]);
      expect(component.specificFloor).toBe(3);

      component.toggleFloorMode('highest');
      component.toggleFloorMode('highest');
      expect(component.floorMode).toBeNull();

      component.onSpecificFloor(3);
      component.onFloorFrom(0);
      expect(component.specificFloor).toBeNull();
      expect([component.floorFrom, component.floorTo]).toEqual([0, 3]);
    });

    it('✅ لا يمكن بناء مدى مقلوب من الواجهة: رفع أحد الحدّين فوق الآخر يرفع الآخر معه', () => {
      component.onFloorFrom(1);
      component.onFloorTo(3);
      expect([component.floorFrom, component.floorTo]).toEqual([1, 3]);

      component.onFloorFrom(5);
      expect([component.floorFrom, component.floorTo]).toEqual([5, 5]);

      component.onFloorTo(2);
      expect([component.floorFrom, component.floorTo]).toEqual([2, 2]);

      component.onFloorFrom(null);
      component.onFloorTo(4);
      expect([component.floorFrom, component.floorTo]).toEqual([null, 4]);
    });

    it('✅ «مسح الفلتر» يرجع كل الطوابق، ويُحسب الفلتر في عدّاد الفلاتر الفعّالة', () => {
      expect(component.activeFiltersCount).toBe(0);

      component.onSpecificFloor(0);
      expect(component.hasFloorFilter).toBeTrue();
      expect(component.activeFiltersCount).toBe(1);

      component.clearFloorFilter();
      expect(component.hasFloorFilter).toBeFalse();
      expect(component.activeFiltersCount).toBe(0);

      component.toggleFloorMode('lowest');
      expect(component.activeFiltersCount).toBe(1);
    });

    it('✅ «إعادة الضبط» تمسح الطابق من الحالة والرابط', () => {
      component = createComponent({ floorFrom: '2', floorTo: '4' });

      component.resetFilters();

      expect(component.hasFloorFilter).toBeFalse();
      expect(routerSpy.navigate).toHaveBeenCalledWith([], jasmine.objectContaining({
        queryParams: jasmine.objectContaining({ floorFrom: null, floorTo: null, floorMode: null })
      }));
      expect(lastRequest().floorFrom).toBeUndefined();
    });

    describe('الطوابق المتاحة (ديناميكية)', () => {
      it('✅ تُطلب من الخادم بفلاتر القائمة نفسها دون الطابق والترقيم والفرز', fakeAsync(() => {
        component = createComponent({ propertyTypeId: '3', listingType: 'ForSale', floorFrom: '2', floorTo: '2', page: '4', sort: 'Price' });
        tick(250);

        expect(propertyApiSpy.getAvailableFloors).toHaveBeenCalledTimes(1);
        const scope = lastFloorsScope();
        expect(scope.propertyTypeId).toBe(3);
        expect(scope.listingType).toBe('ForSale');
        expect(scope.floorFrom).toBeUndefined();
        expect(scope.floorTo).toBeUndefined();
        expect(scope.page).toBeUndefined();
        expect(scope.sortBy).toBeUndefined();
        expect(component.floorOptions()).toEqual(floorsResponse);
        discardPeriodicTasks();
      }));

      it('✅ تتغير الخيارات عند تغيير نوع العقار، بطلب واحد لسلسلة تغييرات متتالية', fakeAsync(() => {
        component = createComponent();
        tick(250);
        propertyApiSpy.getAvailableFloors.calls.reset();

        floorsResponse = { min: 1, max: 9, floors: [1, 9].map(floor => ({ floor, count: 1 })) };
        component.propertyTypeId = 2;
        component.onFloorScopeChanged();
        component.propertyTypeId = 4;
        component.onFloorScopeChanged();
        tick(250);

        expect(propertyApiSpy.getAvailableFloors).toHaveBeenCalledTimes(1);
        expect(lastFloorsScope().propertyTypeId).toBe(4);
        expect(component.floorList()).toEqual([1, 9]);
      }));

      it('✅ لا طلب مكرّر عندما لا يتغير شيء يؤثر في الطوابق', fakeAsync(() => {
        component = createComponent();
        tick(250);
        propertyApiSpy.getAvailableFloors.calls.reset();

        component.onFloorScopeChanged();
        component.onFloorScopeChanged();
        tick(250);

        expect(propertyApiSpy.getAvailableFloors).not.toHaveBeenCalled();
      }));

      it('✅ تغيير نوع العقار يمسح طابقاً اختاره المستخدم ولم يعد موجوداً', fakeAsync(() => {
        component = createComponent();
        tick(250);
        component.onSpecificFloor(5);

        floorsResponse = { min: 0, max: 1, floors: [0, 1].map(floor => ({ floor, count: 2 })) };
        component.propertyTypeId = 3;
        component.onFloorScopeChanged();
        tick(250);

        expect(component.hasFloorFilter).toBeFalse();
        expect(component.floorList()).toEqual([0, 1]);
      }));

      it('✅ ويُبقي طابقاً ما زال موجوداً، وكذلك أعلى/أدنى طابق متاح', fakeAsync(() => {
        component = createComponent();
        tick(250);
        component.onFloorFrom(0);
        component.onFloorTo(1);

        floorsResponse = { min: 0, max: 1, floors: [0, 1].map(floor => ({ floor, count: 2 })) };
        component.propertyTypeId = 3;
        component.onFloorScopeChanged();
        tick(250);
        expect([component.floorFrom, component.floorTo]).toEqual([0, 1]);

        component.toggleFloorMode('highest');
        floorsResponse = { min: null, max: null, floors: [] };
        component.propertyTypeId = 4;
        component.onFloorScopeChanged();
        tick(250);
        expect(component.floorMode).toBe('highest');
      }));

      it('✅ طابق جاء من الرابط يبقى ظاهراً حتى لو لم يعد في الخيارات (هو ما طُلبت به القائمة)', fakeAsync(() => {
        component = createComponent({ floorFrom: '7', floorTo: '7' });
        floorsResponse = { min: 0, max: 1, floors: [0, 1].map(floor => ({ floor, count: 2 })) };
        tick(250);

        expect(component.specificFloor).toBe(7);
        expect(component.floorList()).toEqual([0, 1, 7]);
      }));

      it('✅ لا طوابق متاحة: حالة واضحة، ولا يُعامَل المجهول كطابق أرضي', fakeAsync(() => {
        component = createComponent();
        floorsResponse = { min: null, max: null, floors: [] };
        tick(250);

        expect(component.noFloorsAvailable()).toBeTrue();
        expect(component.floorList()).toEqual([]);
      }));

      it('✅ فشل طلب الطوابق لا يعطّل البحث: الخيارات المجهولة تعني 0 إلى 50', fakeAsync(() => {
        component = createComponent();
        propertyApiSpy.getAvailableFloors.and.returnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
        tick(250);

        expect(component.floorOptions()).toBeNull();
        expect(component.noFloorsAvailable()).toBeFalse();
        expect(component.floorList().length).toBe(51);
        expect(component.floorList()[0]).toBe(0);
        expect(component.floorList()[50]).toBe(50);
        expect(component.error()).toBe('');
      }));
    });

    describe('«القريبة مني»', () => {
      beforeEach(() => {
        spyOn(navigator.geolocation, 'getCurrentPosition').and.callFake(
          ((success: PositionCallback) => success({ coords: { latitude: 33.5, longitude: 36.3 } } as GeolocationPosition)) as typeof navigator.geolocation.getCurrentPosition
        );
      });

      function lastGeoFilter(): PropertyFilterDto {
        const calls = propertyApiSpy.geoSearch.calls.all();
        return calls[calls.length - 1].args[3] as PropertyFilterDto;
      }

      it('✅ مدى الطوابق يصل إلى البحث القريب', () => {
        component.onFloorFrom(1);
        component.onFloorTo(3);
        component.toggleGeoMode();

        expect(lastGeoFilter()).toEqual(jasmine.objectContaining({ floorFrom: 1, floorTo: 3 }));
      });

      it('✅ أعلى طابق متاح يُرسَل رقماً واحداً (البحث القريب لا يعرف floorMode)', fakeAsync(() => {
        component = createComponent();
        tick(250);
        component.toggleFloorMode('highest');
        component.toggleGeoMode();

        const filter = lastGeoFilter();
        expect(filter.floorFrom).toBe(5);
        expect(filter.floorTo).toBe(5);
        expect(filter.floorMode).toBeUndefined();

        component.toggleFloorMode('highest');
        component.toggleFloorMode('lowest');
        component.onRadiusChange();
        expect(lastGeoFilter()).toEqual(jasmine.objectContaining({ floorFrom: 0, floorTo: 0 }));
      }));
    });
  });

});
