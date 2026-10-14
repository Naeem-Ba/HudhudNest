// =====================================================================
// ✅ Unit Tests – property-form.page.spec.ts
// تغطية: النموذج الديناميكي حسب نوع الإعلان (Rent/Sale) ونوع العقار
// (Residential/Land) — أول ملف اختبار لهذا المكوّن (لم يكن له أي تغطية
// من قبل).
//
// النطاق: منطق الفئة (form state, validators, computed getters) عبر
// استدعاء ngOnInit() يدويًا دون fixture.detectChanges() — هذا يتفادى
// عرض القالب الفعلي (وبالتالي MapPickerComponent/LocationComboComponent
// الحقيقيَّين، اللذين يحتاجان بيئة أوسع)، بينما يبقى تغطية حقيقية لأن
// كل *ngIf/*disabled بالقالب مربوط مباشرة بنفس الـ getters/الـ form
// المُختبَرة هنا (isRent/isSale/isLandCategory/form.errors).
// =====================================================================
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';

import { PropertyFormPage, addMonthsToDateString } from './property-form.page';
import { PropertyApiService } from '../../core/api/property-api.service';
import { LookupsApiService, PropertyTypeLookup } from '../../core/api/lookups-api.service';
import { EnumService, EnumItem } from '../../core/services/enum.service';
import { LanguageService } from '../../core/services/language.service';
import { ToastService } from '../../shared/services/toast.service';

const PROPERTY_TYPES: PropertyTypeLookup[] = [
  { id: 1, code: 'apartment', nameAr: 'شقة سكنية', nameEn: 'Apartment', category: 'Residential', icon: null },
  { id: 2, code: 'residential-land', nameAr: 'أرض سكنية', nameEn: 'Residential Land', category: 'Land', icon: null }
];

const OWNERSHIP_TYPE_OPTIONS: EnumItem[] = [
  { Id: 0, Key: 'GreenDeed' },
  { Id: 4, Key: 'CourtJudgment' },
  { Id: 7, Key: 'AssociationTransfer' }
];

const AREA_UNIT_OPTIONS: EnumItem[] = [
  { Id: 0, Key: 'SquareMeter' },
  { Id: 1, Key: 'Qasabah' },
  { Id: 2, Key: 'Dunum' },
  { Id: 3, Key: 'Hectare' }
];

describe('PropertyFormPage', () => {
  let component: PropertyFormPage;
  let propertyApiSpy: jasmine.SpyObj<PropertyApiService>;
  let lookupsApiSpy: jasmine.SpyObj<LookupsApiService>;
  let enumServiceSpy: jasmine.SpyObj<EnumService>;

  function createComponent(routeId: string | null = null): PropertyFormPage {
    propertyApiSpy = jasmine.createSpyObj('PropertyApiService', [
      'getPropertyForManagement', 'createProperty', 'updateProperty',
      'uploadImages', 'setMainImage', 'deleteImage', 'checkDuplicate'
    ]);
    propertyApiSpy.createProperty.and.returnValue(of({ id: 'new-id' }));
    propertyApiSpy.updateProperty.and.returnValue(of({}));

    lookupsApiSpy = jasmine.createSpyObj('LookupsApiService', [
      'getGovernorates', 'getDistricts', 'getNeighborhoods',
      'getPropertyTypeCatalog', 'getAmenities', 'getCities'
    ]);
    lookupsApiSpy.getGovernorates.and.returnValue(of([]));
    lookupsApiSpy.getDistricts.and.returnValue(of([]));
    lookupsApiSpy.getNeighborhoods.and.returnValue(of([]));
    lookupsApiSpy.getPropertyTypeCatalog.and.returnValue(of(PROPERTY_TYPES));
    lookupsApiSpy.getAmenities.and.returnValue(of([]));
    lookupsApiSpy.getCities.and.returnValue(of([]));

    enumServiceSpy = jasmine.createSpyObj('EnumService', ['getList', 'getKey', 'loadAll', 'ensureLoaded']);
    enumServiceSpy.ensureLoaded.and.returnValue(Promise.resolve());
    enumServiceSpy.getList.and.callFake((group: string) => {
      if (group === 'OwnershipType') return OWNERSHIP_TYPE_OPTIONS;
      if (group === 'AreaUnit') return AREA_UNIT_OPTIONS;
      return [];
    });

    TestBed.configureTestingModule({
      imports: [PropertyFormPage],
      providers: [
        { provide: PropertyApiService, useValue: propertyApiSpy },
        { provide: LookupsApiService, useValue: lookupsApiSpy },
        { provide: EnumService, useValue: enumServiceSpy },
        { provide: Router, useValue: jasmine.createSpyObj('Router', ['navigate']) },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap(routeId ? { id: routeId } : {}) } }
        },
        {
          provide: LanguageService,
          useValue: { getCurrentLang: () => 'ar', currentLang$: of('ar') }
        },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'error']) },
        {
          provide: TranslateService,
          useValue: jasmine.createSpyObj('TranslateService', ['instant', 'get'], { onLangChange: of({}), onTranslationChange: of({}), onDefaultLangChange: of({}) })
        }
      ]
    });

    const fixture = TestBed.createComponent(PropertyFormPage);
    const instance = fixture.componentInstance;
    instance.ngOnInit(); // see file header — deliberately not fixture.detectChanges()
    return instance;
  }

  function selectApartment(): void {
    component.form.patchValue({ propertyTypeId: 1 });
  }

  function selectLand(): void {
    component.form.patchValue({ propertyTypeId: 2 });
  }

  // ────────────── Rent: تفاصيل الإيجار ──────────────
  describe('Rent', () => {
    beforeEach(() => {
      component = createComponent();
      component.setListingType(1);
      selectApartment();
    });

    it('✅ isRent صحيحة و isSale خاطئة عند اختيار الإيجار', () => {
      expect(component.isRent).toBeTrue();
      expect(component.isSale).toBeFalse();
    });

    it('✅ التسعير بالدولار واليورو والليرة السورية فقط؛ غيرها يفشل التحقق', () => {
      for (const code of ['USD', 'EUR', 'SYP']) {
        component.form.patchValue({ currencyCode: code });
        expect(component.form.errors?.['invalidCurrencyCode']).toBeUndefined();
      }

      for (const code of ['TRY', 'AED', 'GBP']) {
        component.form.patchValue({ currencyCode: code });
        expect(component.form.errors?.['invalidCurrencyCode']).toBeTrue();
      }
    });

    it('❌ الإيجار بدون تاريخ بداية/نهاية/مدة يفشل التحقق', () => {
      component.form.patchValue({ coldRent: 500, rentalStartDate: null, rentalEndDate: null, rentalDurationType: null });

      expect(component.form.errors?.['rentalStartDateRequired']).toBeTrue();
      expect(component.form.errors?.['rentalEndDateRequired']).toBeTrue();
      expect(component.form.errors?.['rentalDurationRequired']).toBeTrue();
    });

    it('✅ اختيار "6 أشهر" يحسب تاريخ النهاية تلقائياً من تاريخ البداية', () => {
      component.form.patchValue({ rentalStartDate: '2026-01-01', rentalDurationType: 0 });

      expect(component.form.controls.rentalEndDate.value).toBe('2026-07-01');
      expect(component.isCustomRentalDuration).toBeFalse();
    });

    it('✅ اختيار "سنة واحدة" يحسب تاريخ النهاية تلقائياً من تاريخ البداية', () => {
      component.form.patchValue({ rentalStartDate: '2026-01-01', rentalDurationType: 1 });

      expect(component.form.controls.rentalEndDate.value).toBe('2027-01-01');
    });

    it('✅ "مدة مخصصة" تترك تاريخ النهاية قابلاً للتعديل اليدوي الكامل', () => {
      component.form.patchValue({ rentalStartDate: '2026-01-01', rentalDurationType: 2 });
      expect(component.isCustomRentalDuration).toBeTrue();

      component.form.patchValue({ rentalEndDate: '2026-03-15' });
      expect(component.form.controls.rentalEndDate.value).toBe('2026-03-15');
    });

    it('❌ تاريخ النهاية قبل أو يساوي تاريخ البداية يفشل التحقق', () => {
      component.form.patchValue({
        coldRent: 500,
        rentalStartDate: '2026-06-01',
        rentalEndDate: '2026-06-01',
        rentalDurationType: 2
      });

      expect(component.form.errors?.['rentalEndBeforeStart']).toBeTrue();
    });

    it('✅ الإيجار لا يتطلب نوع الملكية (OwnershipType)', () => {
      component.form.patchValue({ ownershipType: null });
      expect(component.form.errors?.['ownershipTypeRequired']).toBeFalsy();
    });
  });

  // ────────────── Sale: نوع الملكية ──────────────
  describe('Sale', () => {
    beforeEach(() => {
      component = createComponent();
      component.setListingType(2);
      selectApartment();
    });

    it('✅ isSale صحيحة و isRent خاطئة عند اختيار البيع', () => {
      expect(component.isSale).toBeTrue();
      expect(component.isRent).toBeFalse();
    });

    it('❌ البيع بدون نوع ملكية يفشل التحقق', () => {
      component.form.patchValue({ purchasePrice: 100000, ownershipType: null });
      expect(component.form.errors?.['ownershipTypeRequired']).toBeTrue();
    });

    it('✅ البيع مع نوع ملكية صحيح ينجح', () => {
      component.form.patchValue({ purchasePrice: 100000, ownershipType: 4 }); // CourtJudgment
      expect(component.form.errors?.['ownershipTypeRequired']).toBeFalsy();
    });

    it('✅ البيع لا يعرض/يتطلب حقول الإيجار', () => {
      component.form.patchValue({ purchasePrice: 100000, ownershipType: 0 });
      expect(component.form.errors?.['rentalStartDateRequired']).toBeFalsy();
      expect(component.form.errors?.['rentalEndDateRequired']).toBeFalsy();
      expect(component.form.errors?.['rentalDurationRequired']).toBeFalsy();
    });

    it('✅ التحويل من بيع إلى إيجار يمسح نوع الملكية', () => {
      component.form.patchValue({ ownershipType: 0 });
      component.setListingType(1);
      expect(component.form.controls.ownershipType.value).toBeNull();
    });
  });

  // ────────────── Land: المساحة/الغرف ──────────────
  describe('Land', () => {
    beforeEach(() => {
      component = createComponent();
      component.setListingType(2);
      component.form.patchValue({ purchasePrice: 50000, ownershipType: 0 });
    });

    it('✅ اختيار نوع عقار من فئة Land يفعّل isLandCategory', () => {
      selectLand();
      expect(component.isLandCategory).toBeTrue();
    });

    it('✅ اختيار نوع عقار سكني لا يفعّل isLandCategory', () => {
      selectApartment();
      expect(component.isLandCategory).toBeFalse();
    });

    it('❌ الأرض بدون مساحة تفشل التحقق', () => {
      selectLand();
      component.form.patchValue({ area: null });
      expect(component.form.errors?.['areaRequiredForLand']).toBeTrue();
    });

    it('✅ الأرض بمساحة محددة تنجح (Rooms ليست مطلوبة)', () => {
      selectLand();
      component.form.patchValue({ area: 500 });
      expect(component.form.errors?.['areaRequiredForLand']).toBeFalsy();
      expect(component.f.rooms.errors).toBeFalsy();
    });

    it('✅ التحويل إلى Land يمسح Rooms/Floor/الميزات', () => {
      selectApartment();
      component.form.patchValue({ rooms: 3, floor: 2, hasBalcony: true });

      selectLand();

      expect(component.form.controls.rooms.value).toBeNull();
      expect(component.form.controls.floor.value).toBeNull();
      expect(component.form.controls.hasBalcony.value).toBeFalse();
    });

    it('✅ التحويل من Land إلى شقة يعيد إظهار الحقول (لا تبقى معطَّلة)', () => {
      selectLand();
      selectApartment();

      expect(component.isLandCategory).toBeFalse();
      // rooms/floor بقيت null بعد المسح، لكنها الآن قابلة للتعبئة من جديد
      // (غير مقفلة) — لا وجود لأي قيد يمنع كتابتها.
      component.form.patchValue({ rooms: 4 });
      expect(component.form.controls.rooms.value).toBe(4);
    });
  });

  // ────────────── تركيبات ListingType × PropertyType ──────────────
  describe('Combinations', () => {
    it('✅ Rent + Apartment: يتطلب تفاصيل الإيجار فقط', () => {
      component = createComponent();
      component.setListingType(1);
      selectApartment();
      component.form.patchValue({
        districtId: 1, // group-level districtRequired — غير موضوع هذا الاختبار
        coldRent: 500,
        rentalStartDate: '2026-01-01',
        rentalEndDate: '2026-07-01',
        rentalDurationType: 0
      });

      expect(component.form.errors).toBeNull();
    });

    it('✅ Sale + Land: يتطلب نوع الملكية والمساحة معاً', () => {
      component = createComponent();
      component.setListingType(2);
      selectLand();
      component.form.patchValue({
        districtId: 1,
        purchasePrice: 80000,
        ownershipType: 0,
        area: 3,
        areaUnit: 2
      });

      expect(component.form.errors).toBeNull();
    });
  });
});

describe('addMonthsToDateString', () => {
  it('adds months in UTC', () => {
    expect(addMonthsToDateString('2026-01-01', 6)).toBe('2026-07-01');
    expect(addMonthsToDateString('2026-08-31', 12)).toBe('2027-08-31');
  });

  it('returns null instead of throwing for an incomplete or malformed date', () => {
    expect(addMonthsToDateString('2026-01', 6)).toBeNull();
    expect(addMonthsToDateString('not-a-date', 6)).toBeNull();
    expect(addMonthsToDateString('', 12)).toBeNull();
  });
});
