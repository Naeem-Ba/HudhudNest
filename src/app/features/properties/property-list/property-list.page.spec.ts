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
import { BehaviorSubject, of, Subject } from 'rxjs';

import { PropertyListPage } from './property-list.page';
import { PropertyApiService } from '../../../core/api/property-api.service';
import { FavoritesApiService } from '../../../core/api/favorites-api.service';
import { SavedSearchApiService } from '../../../core/api/saved-search-api.service';
import { LookupsApiService } from '../../../core/api/lookups-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { LanguageService } from '../../../core/services/language.service';
import { ToastService } from '../../../shared/services/toast.service';
import { PagedResult } from '../../../core/models/api.model';
import { Property, PropertyFilterDto } from '../../../core/models/property.model';

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
  let routerSpy: jasmine.SpyObj<Router>;
  let paramMapSubject: BehaviorSubject<ParamMap>;

  function createComponent(initialParams: Record<string, unknown> = {}): PropertyListPage {
    // Some tests (deep-link) build a second component within the same `it`, after the
    // outer beforeEach already instantiated one — TestBed requires an explicit reset
    // between two configureTestingModule calls within a single test.
    TestBed.resetTestingModule();

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

    const favoritesApiSpy = jasmine.createSpyObj('FavoritesApiService', ['getFavorites']);
    favoritesApiSpy.getFavorites.and.returnValue(of([]));

    const lookupsApiSpy = jasmine.createSpyObj('LookupsApiService', [
      'getCities', 'getAmenities', 'getGovernorates', 'getPropertyTypeCatalog', 'getDistricts', 'getNeighborhoods'
    ]);
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
        { provide: FavoritesApiService, useValue: favoritesApiSpy },
        { provide: SavedSearchApiService, useValue: jasmine.createSpyObj('SavedSearchApiService', ['create']) },
        { provide: LookupsApiService, useValue: lookupsApiSpy },
        { provide: AuthService, useValue: authSpy },
        { provide: LanguageService, useValue: { getCurrent: () => 'ar' } },
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
      amenityIds: undefined,
      sortBy: 'CreatedAt',
      sortDescending: true,
      governorateId: undefined,
      districtId: undefined,
      neighborhoodId: undefined,
      propertyTypeId: undefined
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
