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
import { AgenciesApiService } from '../../core/api/agencies-api.service';
import { Agency } from '../../core/models/agency.model';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { Observable, of, throwError } from 'rxjs';

import { CLEARABLE_PROPERTY_FIELDS, PropertyFormPage, addMonthsToDateString, clearableFieldsLeftEmpty } from './property-form.page';
import { PropertyApiService } from '../../core/api/property-api.service';
import { LookupsApiService, PropertyTypeLookup } from '../../core/api/lookups-api.service';
import { LocationsApiService } from '../../core/api/locations-api.service';
import { EMPTY_GEO_VALUE, GeoPickerValue } from '../../shared/ui/geo/geo-picker.models';
import { locationsApiStub } from '../../shared/ui/geo/locations-api.stub.spec';
import { EnumService, EnumItem } from '../../core/services/enum.service';
import { LanguageService } from '../../core/services/language.service';
import { ToastService } from '../../shared/services/toast.service';
import { SKIP_ERROR_TOAST } from '../../core/interceptors/api-error.interceptor';

// The publisher's office (branch picker / "add to my office"); none by default.
let agenciesApi: { getMine: () => Observable<Partial<Agency> | null> } = { getMine: () => of(null) };

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
  afterEach(() => { agenciesApi = { getMine: () => of(null) }; });

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
        { provide: AgenciesApiService, useValue: agenciesApi },
        { provide: LookupsApiService, useValue: lookupsApiSpy },
        { provide: LocationsApiService, useValue: locationsApiStub() },
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

  describe('office branch (offices P4)', () => {
    const office = { id: 'o1', name: 'Office', branches: [
      { id: 'b1', name: 'Mezzeh', isMain: true, governorateId: 1 },
      { id: 'b2', name: 'Malki', isMain: false, governorateId: 1 }
    ] } as unknown as Partial<Agency>;

    const submit = (c: PropertyFormPage) => (c as unknown as { proceedWithSubmit(): void }).proceedWithSubmit();
    const lastPayload = () => propertyApiSpy.createProperty.calls.mostRecent().args[0] as Record<string, unknown>;

    async function editing(property: Record<string, unknown>): Promise<PropertyFormPage> {
      const c = createComponent('p1');
      propertyApiSpy.getPropertyForManagement.and.returnValue(of({ id: 'p1', ...property } as never));
      (propertyApiSpy as unknown as Record<string, jasmine.Spy>)['setPropertyBranch'] = jasmine.createSpy('setPropertyBranch').and.returnValue(of(undefined));
      await Promise.resolve();
      await new Promise(r => setTimeout(r));
      return c;
    }

    it('a member picks a branch of their office and it is sent with the new listing', () => {
      agenciesApi = { getMine: () => of(office) };
      component = createComponent();
      expect(component.showBranchPicker()).toBeTrue();

      component.onBranchChange('b2');
      submit(component);
      expect(lastPayload()['AgencyBranchId']).toBe('b2');
    });

    it('without an office there is no picker and no branch in the payload', () => {
      component = createComponent();
      expect(component.showBranchPicker()).toBeFalse();
      submit(component);
      expect('AgencyBranchId' in lastPayload()).toBeFalse();
    });

    it('an office without branches shows no picker', () => {
      agenciesApi = { getMine: () => of({ id: 'o1', name: 'Office', branches: [] }) };
      component = createComponent();
      expect(component.showBranchPicker()).toBeFalse();
    });

    it('editing: a changed branch is saved through its own endpoint after the update', async () => {
      agenciesApi = { getMine: () => of(office) };
      component = await editing({ agencyId: 'o1', agencyBranchId: 'b1' });
      expect(component.showBranchPicker()).toBeTrue();
      expect(component.selectedBranchId()).toBe('b1');

      component.onBranchChange('');
      submit(component);

      const setBranch = (propertyApiSpy as unknown as Record<string, jasmine.Spy>)['setPropertyBranch'];
      expect(propertyApiSpy.updateProperty).toHaveBeenCalled();
      expect(setBranch).toHaveBeenCalledOnceWith('p1', null);
      expect('AgencyBranchId' in (propertyApiSpy.updateProperty.calls.mostRecent().args[1] as object)).toBeFalse();
    });

    it('editing: an unchanged branch makes no extra call', async () => {
      agenciesApi = { getMine: () => of(office) };
      component = await editing({ agencyId: 'o1', agencyBranchId: 'b1' });
      submit(component);
      expect((propertyApiSpy as unknown as Record<string, jasmine.Spy>)['setPropertyBranch']).not.toHaveBeenCalled();
    });

    it('editing a listing of another office shows no picker', async () => {
      agenciesApi = { getMine: () => of(office) };
      component = await editing({ agencyId: 'someone-else', agencyBranchId: null });
      expect(component.showBranchPicker()).toBeFalse();
    });

    it('a branch removed meanwhile is explained and the list is refreshed', () => {
      let calls = 0;
      agenciesApi = { getMine: () => { calls++; return of(office); } };
      component = createComponent();
      propertyApiSpy.createProperty.and.returnValue(throwError(() => ({
        status: 422, error: { errorCodes: { AgencyBranchId: ['LISTING_BRANCH_INVALID'] } }
      })));
      component.onBranchChange('b2');
      submit(component);

      expect(component.submitError()).toBe('PROPERTY_FORM.BRANCH.INVALID');
      expect(component.selectedBranchId()).toBe('');
      expect(calls).toBe(2);
    });
  });

  describe('emptying optional fields on edit (audit P3-1)', () => {
    const submit = (c: PropertyFormPage) => (c as unknown as { proceedWithSubmit(): void }).proceedWithSubmit();
    const lastUpdate = () => propertyApiSpy.updateProperty.calls.mostRecent().args[1] as unknown as Record<string, unknown>;

    async function editing(property: Record<string, unknown>): Promise<PropertyFormPage> {
      const c = createComponent('p1');
      propertyApiSpy.getPropertyForManagement.and.returnValue(of({ id: 'p1', ...property } as never));
      await Promise.resolve();
      await new Promise(r => setTimeout(r));
      return c;
    }

    it('names the fields the owner emptied, and never a field that still has a value', async () => {
      component = await editing({ listingType: 'ForRent', additionalCosts: 120, deposit: 500, availableFrom: '2026-12-01T00:00:00' });
      component.form.patchValue({ additionalCosts: null, availableFrom: '' });
      submit(component);

      const payload = lastUpdate();
      const cleared = payload['ClearFields'] as string[];
      expect(cleared).toContain('AdditionalCosts');
      expect(cleared).toContain('AvailableFrom');
      expect(cleared).not.toContain('Deposit');
      expect(payload['Deposit']).toBe(500);
      expect(payload['AvailableFrom']).toBeNull();
    });

    it('a new listing sends no ClearFields', () => {
      component = createComponent();
      submit(component);
      expect('ClearFields' in (propertyApiSpy.createProperty.calls.mostRecent().args[0] as object)).toBeFalse();
    });

    it('only names fields the API accepts', () => {
      const cleared = clearableFieldsLeftEmpty({ Title: null, ColdRent: null, Deposit: 5 });
      expect(cleared).toEqual(CLEARABLE_PROPERTY_FIELDS.filter(f => f !== 'Deposit'));
      expect(cleared).not.toContain('ColdRent');
      expect(cleared).not.toContain('Title');
    });
  });

  // QA phase 25 (P25-D05): a failed photo upload after a successful save raised three toasts (the interceptor's
  // generic error, the warning and "saved"). It must be exactly one: the warning that says both things.
  describe('photo upload failing after the listing was saved', () => {
    it('shows one toast, skips the interceptor toast, and still goes to the new listing', () => {
      component = createComponent();
      propertyApiSpy.uploadImages.and.returnValue(throwError(() => new Error('cloudinary down')));
      const toast = TestBed.inject(ToastService) as jasmine.SpyObj<ToastService>;
      const router = TestBed.inject(Router) as jasmine.SpyObj<Router>;
      component.selectedFiles.set([new File(['x'], 'a.jpg', { type: 'image/jpeg' })]);

      (component as unknown as { uploadImages(id: string): void }).uploadImages('new-id');

      const options = propertyApiSpy.uploadImages.calls.mostRecent().args[2];
      expect(options?.context?.get(SKIP_ERROR_TOAST)).toBeTrue();
      expect(toast.error).toHaveBeenCalledTimes(1);
      expect(toast.success).not.toHaveBeenCalled();
      expect(router.navigate).toHaveBeenCalledWith(['/properties', 'new-id']);
    });

    it('a successful upload still announces the save once', () => {
      component = createComponent();
      propertyApiSpy.uploadImages.and.returnValue(of([]));
      const toast = TestBed.inject(ToastService) as jasmine.SpyObj<ToastService>;
      component.selectedFiles.set([new File(['x'], 'a.jpg', { type: 'image/jpeg' })]);

      (component as unknown as { uploadImages(id: string): void }).uploadImages('new-id');

      expect(toast.success).toHaveBeenCalledTimes(1);
      expect(toast.error).not.toHaveBeenCalled();
    });
  });

  function selectApartment(): void {
    component.form.patchValue({ propertyTypeId: 1 });
  }

  function selectLand(): void {
    component.form.patchValue({ propertyTypeId: 2 });
  }

  describe('Location (hybrid catalog)', () => {
    const value = (over: Partial<GeoPickerValue> = {}): GeoPickerValue => ({ ...EMPTY_GEO_VALUE, ...over });

    beforeEach(() => {
      component = createComponent();
    });

    it('only the governorate is mandatory: no street, city, district or neighborhood is needed', () => {
      expect(component.form.controls.governorateId.errors?.['required']).toBeTrue();
      expect(component.form.controls.street.errors).toBeNull();

      component.onGeoChange(value({ governorateId: 3, locationId: 2, city: 'دمشق' }));
      expect(component.form.controls.governorateId.errors).toBeNull();
      expect(component.form.controls.districtId.errors).toBeNull();
      expect(component.form.controls.neighborhoodId.errors).toBeNull();
    });

    it('the picker value fills the catalog place, the old ids and the readable address', () => {
      component.onGeoChange(value({
        locationId: 5, governorateId: 3, districtId: 30, neighborhoodId: 300, city: 'مدينة دمشق', region: 'المزة', street: 'شارع الأمين'
      }));

      expect(component.form.getRawValue()).toEqual(jasmine.objectContaining({
        locationId: 5, governorateId: 3, districtId: 30, neighborhoodId: 300, city: 'مدينة دمشق', region: 'المزة', street: 'شارع الأمين'
      }));
    });

    it('emptying the picker clears the place, so a stale one is never sent', () => {
      component.onGeoChange(value({ locationId: 5, governorateId: 3, districtId: 30 }));
      component.onGeoChange(value());
      expect(component.form.controls.locationId.value).toBeNull();
      expect(component.form.controls.governorateId.value).toBeNull();
      expect(component.form.controls.districtId.value).toBeNull();
    });

    it('typed places the catalog lacks are proposed after the listing is saved, never before', () => {
      const locations = TestBed.inject(LocationsApiService) as jasmine.SpyObj<LocationsApiService>;
      locations.submitRequest.and.returnValue(of({ id: 'r', status: 'Pending' } as never));
      component.onGeoChange(value({
        locationId: 4, governorateId: 3,
        proposals: [{ type: 'Street', parentLocationId: 4, name: 'شارع جديد', proof: 'signed', latitude: null, longitude: null }]
      }));
      expect(locations.submitRequest).not.toHaveBeenCalled();

      component.form.patchValue({ latitude: 33.5, longitude: 36.3 });
      (component as unknown as { submitGeoProposals(id: string): void }).submitGeoProposals('prop-1');

      expect(locations.submitRequest).toHaveBeenCalledOnceWith({
        type: 'Street', parentLocationId: 4, name: 'شارع جديد', proof: 'signed', latitude: 33.5, longitude: 36.3, propertyId: 'prop-1'
      });
    });

    it('a failing proposal does not break the save, and each proposal is sent once', () => {
      const locations = TestBed.inject(LocationsApiService) as jasmine.SpyObj<LocationsApiService>;
      locations.submitRequest.and.returnValue(throwError(() => new Error('403')));
      component.onGeoChange(value({
        locationId: 4, governorateId: 3,
        proposals: [{ type: 'Street', parentLocationId: 4, name: 'شارع', proof: null, latitude: null, longitude: null }]
      }));

      const run = () => (component as unknown as { submitGeoProposals(id: string): void }).submitGeoProposals('prop-1');
      expect(run).not.toThrow();
      run();
      expect(locations.submitRequest).toHaveBeenCalledTimes(1);
    });
  });

  // ────────────── Rent: تفاصيل الإيجار ──────────────
  describe('whole-number rooms and floor (P26-D02)', () => {
    // Jasmine runs specs in random order. These specs read the shared `component` but never created it, so
    // they only passed when an earlier spec had happened to assign it (TypeError on `form` otherwise).
    beforeEach(() => {
      component = createComponent();
    });

    it('rejects half rooms: the server stores rooms as an integer', () => {
      component.form.patchValue({ rooms: 2.5 });
      expect(component.f.rooms.errors?.['wholeNumber']).toBeTrue();
    });

    it('accepts whole rooms and an empty value', () => {
      component.form.patchValue({ rooms: 3 });
      expect(component.f.rooms.errors).toBeFalsy();
      component.form.patchValue({ rooms: null });
      expect(component.f.rooms.errors).toBeFalsy();
    });

    it('rejects a fractional floor', () => {
      component.form.patchValue({ floor: 1.5 });
      expect(component.f.floor.errors?.['wholeNumber']).toBeTrue();
      component.form.patchValue({ floor: 2 });
      expect(component.f.floor.errors).toBeFalsy();
    });
  });

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

describe('PropertyFormPage amenities loading', () => {
  it('shows a failure (not a misleading empty list) when the lookup fails, and a retry loads them', () => {
    const lookups = jasmine.createSpyObj('LookupsApiService', [
      'getGovernorates', 'getDistricts', 'getNeighborhoods', 'getPropertyTypeCatalog', 'getAmenities', 'getCities'
    ]);
    lookups.getGovernorates.and.returnValue(of([]));
    lookups.getDistricts.and.returnValue(of([]));
    lookups.getNeighborhoods.and.returnValue(of([]));
    lookups.getPropertyTypeCatalog.and.returnValue(of([]));
    lookups.getCities.and.returnValue(of([]));
    lookups.getAmenities.and.returnValues(throwError(() => new Error('down')), of([{ id: 'a1', name: 'مسبح', category: null, iconName: 'pool' }]));
    const enumSvc = jasmine.createSpyObj('EnumService', ['getList', 'getKey', 'loadAll', 'ensureLoaded']);
    enumSvc.ensureLoaded.and.returnValue(Promise.resolve());
    enumSvc.getList.and.returnValue([]);

    TestBed.configureTestingModule({
      imports: [PropertyFormPage],
      providers: [
        { provide: PropertyApiService, useValue: jasmine.createSpyObj('PropertyApiService', ['checkDuplicate']) },
        { provide: AgenciesApiService, useValue: agenciesApi },
        { provide: LookupsApiService, useValue: lookups },
        { provide: LocationsApiService, useValue: locationsApiStub() },
        { provide: EnumService, useValue: enumSvc },
        { provide: Router, useValue: jasmine.createSpyObj('Router', ['navigate']) },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({}) } } },
        { provide: LanguageService, useValue: { getCurrentLang: () => 'ar', currentLang$: of('ar') } },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'error']) },
        { provide: TranslateService, useValue: jasmine.createSpyObj('TranslateService', ['instant', 'get'], { onLangChange: of({}), onTranslationChange: of({}), onDefaultLangChange: of({}) }) }
      ]
    });
    const component = TestBed.createComponent(PropertyFormPage).componentInstance;
    component.ngOnInit();

    expect(component.amenitiesLoadFailed()).toBeTrue();
    expect(component.amenities().length).toBe(0);

    component.loadAmenities();

    expect(component.amenitiesLoadFailed()).toBeFalse();
    expect(component.amenitiesLoading()).toBeFalse();
    expect(component.amenities().length).toBe(1);
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
