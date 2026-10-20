// Core E2E audit F-2. Two defects around the heating <select>:
//  1. its option values were hard-coded and did not match the backend HeatingType enum
//     (Gas=2, Electric=3, FloorHeating=4), so choosing "Gas" saved Electric;
//  2. edit mode never loaded the saved heating type, so saving any edit reset it to Unknown.
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';

import { PropertyFormPage } from './property-form.page';
import { LookupsApiService } from '../../core/api/lookups-api.service';
import { PropertyApiService } from '../../core/api/property-api.service';
import { LanguageService } from '../../core/services/language.service';
import { MapPickerComponent } from '../../map-picker/map-picker.component';
import { LocationComboComponent } from '../../shared/ui/location-combo.component';

// Same ids/keys the real GET /api/enums/HeatingType returns.
const HEATING_ENUM = [
  { id: 0, key: 'Unknown' }, { id: 1, key: 'Central' }, { id: 2, key: 'Gas' }, { id: 3, key: 'Electric' },
  { id: 4, key: 'FloorHeating' }, { id: 5, key: 'Oil' }, { id: 6, key: 'Fireplace' }, { id: 7, key: 'Solar' },
  { id: 8, key: 'HeatPump' }
];
const ENUMS: Record<string, unknown> = {
  OwnershipType: [{ id: 0, key: 'GreenDeed' }],
  AreaUnit: [{ id: 0, key: 'SquareMeter' }],
  RentalDurationType: [{ id: 0, key: 'Monthly' }],
  FurnishingStatus: [{ id: 0, key: 'Unfurnished' }],
  HeatingType: HEATING_ENUM
};

describe('PropertyFormPage heating type', () => {
  let http: HttpTestingController;
  let propertyApi: jasmine.SpyObj<PropertyApiService>;

  function setup(editId?: string): void {
    const lookups = jasmine.createSpyObj('LookupsApiService', [
      'getGovernorates', 'getDistricts', 'getNeighborhoods', 'getPropertyTypeCatalog', 'getAmenities', 'getCities'
    ]);
    for (const name of ['getGovernorates', 'getDistricts', 'getNeighborhoods', 'getAmenities', 'getCities']) {
      lookups[name].and.returnValue(of([]));
    }
    lookups.getPropertyTypeCatalog.and.returnValue(of([
      { id: 1, code: 'apartment', nameAr: 'شقة', nameEn: 'Apartment', category: 'Residential', icon: null }
    ]));
    propertyApi = jasmine.createSpyObj('PropertyApiService', ['checkDuplicate', 'getPropertyForManagement']);
    propertyApi.getPropertyForManagement.and.returnValue(of({
      id: editId, title: 'Edit me', description: 'd', listingType: 'ForRent', heatingType: 'Gas', countryCode: 'SY'
    } as never));

    TestBed.configureTestingModule({
      imports: [PropertyFormPage, TranslateModule.forRoot()],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: LookupsApiService, useValue: lookups },
        { provide: PropertyApiService, useValue: propertyApi },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap(editId ? { id: editId } : {}) } } },
        { provide: LanguageService, useValue: { getCurrentLang: () => 'ar', currentLang$: of('ar') } }
      ]
    });
    TestBed.overrideComponent(PropertyFormPage, {
      remove: { imports: [MapPickerComponent, LocationComboComponent] },
      add: { schemas: [NO_ERRORS_SCHEMA] }
    });
    http = TestBed.inject(HttpTestingController);
  }

  function flushEnums(): void {
    for (const req of http.match(r => r.url.includes('/enums/'))) {
      req.flush(ENUMS[req.request.url.split('/enums/')[1]] ?? []);
    }
  }

  it('every heating option carries the backend enum id of the key it is labelled with', async () => {
    setup();
    const fixture = TestBed.createComponent(PropertyFormPage);
    fixture.detectChanges();
    flushEnums();
    await fixture.whenStable();
    fixture.detectChanges();

    const select = fixture.nativeElement.querySelector('#heatingType') as HTMLSelectElement;
    const idByLabel = new Map(
      Array.from(select.options).map(o => [(o.textContent ?? '').trim(), Number(o.value)])
    );
    const expected: Record<string, string> = {
      'HEATING.CENTRAL': 'Central',
      'HEATING.FLOOR': 'FloorHeating',
      'HEATING.GAS': 'Gas',
      'HEATING.ELECTRIC': 'Electric',
      'HEATING.OIL': 'Oil',
      'HEATING.OTHER': 'Unknown'
    };
    for (const [label, key] of Object.entries(expected)) {
      expect(idByLabel.get(label)).withContext(label).toBe(HEATING_ENUM.find(e => e.key === key)!.id);
    }
  });

  it('edit mode loads the saved heating type instead of resetting it to Unknown', async () => {
    setup('11111111-1111-1111-1111-111111111111');
    const fixture = TestBed.createComponent(PropertyFormPage);
    fixture.detectChanges();
    flushEnums();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(propertyApi.getPropertyForManagement).toHaveBeenCalled();
    expect(fixture.componentInstance.form.get('heatingType')?.value).toBe(2);
  });
});

describe('PropertyFormPage heating type in the save payload', () => {
  function createForm(editId?: string): PropertyFormPage {
    const lookups = jasmine.createSpyObj('LookupsApiService', [
      'getGovernorates', 'getDistricts', 'getNeighborhoods', 'getPropertyTypeCatalog', 'getAmenities', 'getCities'
    ]);
    for (const name of ['getGovernorates', 'getDistricts', 'getNeighborhoods', 'getAmenities', 'getCities', 'getPropertyTypeCatalog']) {
      lookups[name].and.returnValue(of([]));
    }
    const api = jasmine.createSpyObj('PropertyApiService', ['checkDuplicate', 'getPropertyForManagement']);
    api.getPropertyForManagement.and.returnValue(of({ id: editId, countryCode: 'SY' } as never));
    TestBed.configureTestingModule({
      imports: [PropertyFormPage, TranslateModule.forRoot()],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: LookupsApiService, useValue: lookups },
        { provide: PropertyApiService, useValue: api },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap(editId ? { id: editId } : {}) } } },
        { provide: LanguageService, useValue: { getCurrentLang: () => 'ar', currentLang$: of('ar') } }
      ]
    });
    TestBed.overrideComponent(PropertyFormPage, {
      remove: { imports: [MapPickerComponent, LocationComboComponent] },
      add: { schemas: [NO_ERRORS_SCHEMA] }
    });
    return TestBed.createComponent(PropertyFormPage).componentInstance;
  }

  it('create: always sends the chosen heating type (Unknown when untouched)', () => {
    const component = createForm();
    expect(component.heatingTypeForSave()).toBe(0);
    component.form.patchValue({ heatingType: 2 });
    expect(component.heatingTypeForSave()).toBe(2);
  });

  it('edit: an untouched heating type is omitted so the stored value is kept', () => {
    const component = createForm('11111111-1111-1111-1111-111111111111');
    component.isEditMode.set(true);
    expect(component.heatingTypeForSave()).toBeUndefined();
  });

  it('edit: a heating type the user changed is sent', () => {
    const component = createForm('11111111-1111-1111-1111-111111111111');
    component.isEditMode.set(true);
    component.form.controls.heatingType.setValue(3);
    component.form.controls.heatingType.markAsDirty();
    expect(component.heatingTypeForSave()).toBe(3);
  });
});
