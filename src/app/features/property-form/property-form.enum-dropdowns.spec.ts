// Renders the real property-form template (Map/Location children stubbed out) with the real
// EnumService to guard the regression where a failed startup enum fetch left the
// ownership-type (Sale) and furnishing (Sale + Rent) dropdowns empty for the whole session.
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';

import { PropertyFormPage } from './property-form.page';
import { EnumService } from '../../core/services/enum.service';
import { LookupsApiService } from '../../core/api/lookups-api.service';
import { LocationsApiService } from '../../core/api/locations-api.service';
import { locationsApiStub } from '../../shared/ui/geo/locations-api.stub.spec';
import { PropertyApiService } from '../../core/api/property-api.service';
import { LanguageService } from '../../core/services/language.service';
import { MapPickerComponent } from '../../map-picker/map-picker.component';
import { LocationComboComponent } from '../../shared/ui/location-combo.component';

const ENUMS: Record<string, unknown> = {
  OwnershipType: [{ id: 0, key: 'GreenDeed' }, { id: 4, key: 'CourtJudgment' }],
  AreaUnit: [{ id: 0, key: 'SquareMeter' }],
  RentalDurationType: [{ id: 0, key: 'Monthly' }],
  FurnishingStatus: [{ id: 0, key: 'Unfurnished' }, { id: 1, key: 'SemiFurnished' }, { id: 2, key: 'Furnished' }]
};

describe('PropertyFormPage enum dropdowns', () => {
  let http: HttpTestingController;
  let enums: EnumService;

  const enumName = (url: string) => url.split('/enums/')[1];

  function flushEnums(fail: boolean): void {
    for (const req of http.match(r => r.url.includes('/enums/'))) {
      if (fail) req.flush('boom', { status: 503, statusText: 'Unavailable' });
      else req.flush(ENUMS[enumName(req.request.url)] ?? []);
    }
  }

  beforeEach(() => {
    spyOn(console, 'warn');
    const lookups = jasmine.createSpyObj('LookupsApiService', [
      'getGovernorates', 'getDistricts', 'getNeighborhoods', 'getPropertyTypeCatalog', 'getAmenities', 'getCities'
    ]);
    lookups.getGovernorates.and.returnValue(of([]));
    lookups.getDistricts.and.returnValue(of([]));
    lookups.getNeighborhoods.and.returnValue(of([]));
    lookups.getPropertyTypeCatalog.and.returnValue(of([
      { id: 1, code: 'apartment', nameAr: 'شقة', nameEn: 'Apartment', category: 'Residential', icon: null }
    ]));
    lookups.getAmenities.and.returnValue(of([]));
    lookups.getCities.and.returnValue(of([]));

    TestBed.configureTestingModule({
      imports: [PropertyFormPage, TranslateModule.forRoot()],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: LookupsApiService, useValue: lookups },
        { provide: LocationsApiService, useValue: locationsApiStub() },
        { provide: PropertyApiService, useValue: jasmine.createSpyObj('PropertyApiService', ['checkDuplicate']) },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({}) } } },
        { provide: LanguageService, useValue: { getCurrentLang: () => 'ar', currentLang$: of('ar') } }
      ]
    });
    TestBed.overrideComponent(PropertyFormPage, {
      remove: { imports: [MapPickerComponent, LocationComboComponent] },
      add: { schemas: [NO_ERRORS_SCHEMA] }
    });

    http = TestBed.inject(HttpTestingController);
    enums = TestBed.inject(EnumService);
  });

  function optionCount(root: HTMLElement, id: string): number | null {
    const select = root.querySelector(`#${id}`) as HTMLSelectElement | null;
    return select ? select.options.length : null;
  }

  // +1 in every count = the "select…" placeholder option.
  it('shows ownership (Sale) and furnishing (Sale + Rent) options when enums loaded at startup', async () => {
    const preload = enums.loadAll();
    flushEnums(false);
    await preload;

    const fixture = TestBed.createComponent(PropertyFormPage);
    fixture.detectChanges();
    const form = fixture.componentInstance;
    await fixture.whenStable();

    form.setListingType(2);
    form.form.patchValue({ propertyTypeId: 1 });
    fixture.detectChanges();
    expect(optionCount(fixture.nativeElement, 'ownershipType')).toBe(3);
    expect(optionCount(fixture.nativeElement, 'furnishingStatus')).toBe(4);

    form.setListingType(1);
    fixture.detectChanges();
    expect(optionCount(fixture.nativeElement, 'ownershipType')).toBeNull();
    expect(optionCount(fixture.nativeElement, 'furnishingStatus')).toBe(4);
  });

  it('recovers when the startup enum fetch failed: the form retries and fills the dropdowns', async () => {
    const preload = enums.loadAll();
    flushEnums(true);
    await preload;
    expect(enums.getList('OwnershipType')).toEqual([]);

    const fixture = TestBed.createComponent(PropertyFormPage);
    fixture.detectChanges();
    const form = fixture.componentInstance;
    flushEnums(false); // the form's own ensureLoaded retry
    await fixture.whenStable();

    form.setListingType(2);
    form.form.patchValue({ propertyTypeId: 1 });
    fixture.detectChanges();
    expect(form.enumOptionsLoadFailed()).toBeFalse();
    expect(optionCount(fixture.nativeElement, 'ownershipType')).toBe(3);
    expect(optionCount(fixture.nativeElement, 'furnishingStatus')).toBe(4);
  });

  it('tells the user when the options cannot be loaded even after the retry', async () => {
    const fixture = TestBed.createComponent(PropertyFormPage);
    fixture.detectChanges();
    flushEnums(true);
    await fixture.whenStable();

    fixture.componentInstance.setListingType(2);
    fixture.componentInstance.form.patchValue({ propertyTypeId: 1 });
    fixture.detectChanges();
    expect(fixture.componentInstance.enumOptionsLoadFailed()).toBeTrue();
    expect(optionCount(fixture.nativeElement, 'ownershipType')).toBe(1);
  });
});
