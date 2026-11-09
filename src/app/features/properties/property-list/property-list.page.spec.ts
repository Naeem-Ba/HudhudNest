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
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, ParamMap, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { BehaviorSubject, of, Subject, throwError } from 'rxjs';

import { PropertyListPage } from './property-list.page';
import { PropertyApiService } from '../../../core/api/property-api.service';
import { SavedSearchApiService } from '../../../core/api/saved-search-api.service';
import { CurrencyLookup, LookupsApiService } from '../../../core/api/lookups-api.service';
import { PageMetaService } from '../../../core/services/page-meta.service';
import { PreferencesService } from '../../../core/services/preferences.service';
import { InterestAreasService } from '../../../core/services/interest-areas.service';
import { RecentAreasService, RECENT_AREAS_STORAGE_KEY } from '../../../core/services/recent-areas.service';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../../core/auth/auth.service';
import { LanguageService } from '../../../core/services/language.service';
import { ToastService } from '../../../shared/services/toast.service';
import { PagedResult } from '../../../core/models/api.model';
import { Property, PropertyFilterDto } from '../../../core/models/property.model';

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

describe('PropertyListPage', () => {
  let component: PropertyListPage;
  let propertyApiSpy: jasmine.SpyObj<PropertyApiService>;
  let lookupsApiSpy: jasmine.SpyObj<LookupsApiService>;
  let routerSpy: jasmine.SpyObj<Router>;
  let paramMapSubject: BehaviorSubject<ParamMap>;
  let interestParam: string | undefined;

  function createComponent(initialParams: Record<string, unknown> = {}, preferredCurrency: string | null = null): PropertyListPage {
    // Some tests (deep-link) build a second component within the same `it`, after the
    // outer beforeEach already instantiated one — TestBed requires an explicit reset
    // between two configureTestingModule calls within a single test.
    TestBed.resetTestingModule();
    localStorage.removeItem(RECENT_AREAS_STORAGE_KEY);
    interestParam = undefined;

    paramMapSubject = new BehaviorSubject<ParamMap>(toParamMap(initialParams));

    propertyApiSpy = jasmine.createSpyObj('PropertyApiService', ['getPropertiesPaged', 'geoSearch']);
    // Echoes back the requested page and reports enough total results for multi-page
    // pagination tests, mirroring the real backend's PagedResult contract (PagedResult.cs:
    // Page is always the clamped requested page; TotalCount reflects the filtered set).
    propertyApiSpy.getPropertiesPaged.and.callFake((filter: PropertyFilterDto = {}) =>
      of(pagedResult([], filter.page ?? 1, 100))
    );

    routerSpy = jasmine.createSpyObj('Router', ['navigate']);
    routerSpy.navigate.and.callFake((_commands: unknown[], extras?: { queryParams?: Record<string, unknown> }) => {
      paramMapSubject.next(toParamMap(extras?.queryParams ?? {}));
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

    const authSpy = jasmine.createSpyObj('AuthService', ['getAccessToken']);
    authSpy.getAccessToken.and.returnValue(null);

    TestBed.configureTestingModule({
      imports: [PropertyListPage],
      providers: [
        { provide: PropertyApiService, useValue: propertyApiSpy },
        { provide: SavedSearchApiService, useValue: jasmine.createSpyObj('SavedSearchApiService', ['create']) },
        { provide: LookupsApiService, useValue: lookupsApiSpy },
        { provide: AuthService, useValue: authSpy },
        { provide: LanguageService, useValue: { getCurrent: () => 'ar' } },
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
      propertyTypeId: undefined
    });
  });

  describe('ترتيب الإعلانات المميزة حسب المنطقة', () => {
    it('✅ الترتيب الافتراضي بلا فلتر محافظة يرسل مناطق اهتمام الزائر', () => {
      interestParam = '3,7';
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

      expect(routerSpy.navigate).toHaveBeenCalledWith([], jasmine.objectContaining({ queryParams: {} }));
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

  describe('اقتراحات المدينة تتبع المحافظة المختارة', () => {
    it('✅ بلا محافظة تُجلب كل المدن', () => {
      expect(lookupsApiSpy.getCities).toHaveBeenCalledTimes(1);
      expect(lookupsApiSpy.getCities).toHaveBeenCalledWith(null);
    });

    it('✅ اختيار محافظة يجلب مدنها فقط، ومسحها يعيد كل المدن', () => {
      component.governorateId = 3;
      component.onGovernorateChange();
      expect(lookupsApiSpy.getCities).toHaveBeenCalledWith(3);

      component.governorateId = null;
      component.onGovernorateChange();
      expect(lookupsApiSpy.getCities.calls.mostRecent().args[0]).toBeNull();
    });

    it('✅ تغيير المحافظة يمسح المدينة المكتوبة لأنها تخص المحافظة السابقة', () => {
      component.cityFilter = 'Aleppo';
      component.governorateId = 1;

      component.onGovernorateChange();

      expect(component.cityFilter).toBe('');
    });

    it('✅ رابط يحمل governorateId يجلب مدن تلك المحافظة عند فتح الصفحة', () => {
      createComponent({ governorateId: '5' });

      expect(lookupsApiSpy.getCities).toHaveBeenCalledWith(5);
    });

    it('✅ اختيار المحافظة نفسها مرتين متتاليتين لا يعيد الطلب', () => {
      component.governorateId = 3;
      component.onGovernorateChange();
      component.onGovernorateChange();

      expect(lookupsApiSpy.getCities.calls.allArgs().filter(a => a[0] === 3).length).toBe(1);
    });

    it('✅ إعادة الضبط تعيد كل المدن', () => {
      component.governorateId = 3;
      component.onGovernorateChange();

      component.resetFilters();

      expect(lookupsApiSpy.getCities.calls.mostRecent().args[0]).toBeNull();
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
      component.applyFilters();
      expect(component.error()).toBe('PROPERTY_LIST.INVALID_FILTERS');

      propertyApiSpy.getPropertiesPaged.and.returnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
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
});
