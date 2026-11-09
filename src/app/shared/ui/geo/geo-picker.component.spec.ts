import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';

import { LocationsApiService } from '../../../core/api/locations-api.service';
import { GeoReverseResult } from '../../../core/models/geo-location.model';
import { GeoPickerComponent } from './geo-picker.component';
import { GeoPickerValue } from './geo-picker.models';
import { ALEPPO, DAMASCUS, DAMASCUS_CITY, MAZZEH, VILLAT, place } from './geo-fixtures.spec';
import { locationsApiStub } from './locations-api.stub.spec';

describe('GeoPickerComponent', () => {
  let api: jasmine.SpyObj<LocationsApiService>;
  let fixture: ComponentFixture<GeoPickerComponent>;
  let picker: GeoPickerComponent;
  let emitted: GeoPickerValue[];

  function create(initial: GeoPickerComponent['initial'] = null): void {
    fixture = TestBed.createComponent(GeoPickerComponent);
    picker = fixture.componentInstance;
    emitted = [];
    picker.valueChange.subscribe(v => emitted.push(v));
    setInitial(initial);
    fixture.detectChanges();
  }
  function setInitial(initial: GeoPickerComponent['initial']): void {
    if (initial) fixture.componentRef.setInput('initial', initial);
  }
  const last = () => emitted[emitted.length - 1];

  beforeEach(() => {
    api = locationsApiStub();
    api.getTopLevel.and.returnValue(of([place(DAMASCUS), place(ALEPPO)]));
    TestBed.configureTestingModule({
      imports: [GeoPickerComponent, TranslateModule.forRoot()],
      providers: [{ provide: LocationsApiService, useValue: api }]
    });
  });

  it('loads the governorates', () => {
    create();
    expect(api.getTopLevel).toHaveBeenCalledWith('SY');
    expect(picker.governorates().map(g => g.nameEn)).toEqual(['Damascus', 'Aleppo']);
  });

  it('a governorate alone is a complete value: no city, district or street needed', () => {
    create();
    picker.onGovernorate(String(DAMASCUS.id));

    expect(last().governorateId).toBe(3);
    expect(last().locationId).toBe(DAMASCUS.id);
    expect(last().city).toBe('دمشق'); // the address line falls back to the governorate
    expect(last().street).toBe('');
    expect(last().proposals).toEqual([]);
  });

  it('a deeper pick fills the places above it and hands the old ids to the legacy columns', () => {
    create();
    picker.onGovernorate(String(DAMASCUS.id));
    picker.onPicked('Neighborhood', place(VILLAT)); // skipping city and district is allowed

    expect(picker.pickOf('City')?.id).toBe(DAMASCUS_CITY.id);
    expect(picker.pickOf('District')?.id).toBe(MAZZEH.id);
    expect(last()).toEqual(jasmine.objectContaining({
      locationId: VILLAT.id, governorateId: 3, districtId: 30, neighborhoodId: 300, city: 'مدينة دمشق', region: 'المزة'
    }));
  });

  it('changing a level clears everything below it; changing the governorate clears all', () => {
    create();
    picker.onGovernorate(String(DAMASCUS.id));
    picker.onPicked('District', place(MAZZEH));
    picker.onTyped('Street', 'شارع تجريبي');

    picker.onTyped('City', 'جرمانا');
    expect(picker.pickOf('District')).toBeNull();
    expect(picker.textOf('Street')).toBeNull();

    picker.onPicked('District', place(MAZZEH));
    picker.onGovernorate(String(ALEPPO.id));
    expect(picker.pickOf('City')).toBeNull();
    expect(picker.pickOf('District')).toBeNull();
    expect(last().governorateId).toBe(4);
  });

  it('a typed street under a known district becomes a proposal, never an invented catalog place', () => {
    create();
    picker.onGovernorate(String(DAMASCUS.id));
    picker.onPicked('District', place(MAZZEH));
    picker.onTyped('Street', '  شارع جديد  ');

    expect(last().street).toBe('شارع جديد');
    expect(last().proposals).toEqual([
      jasmine.objectContaining({ type: 'Street', parentLocationId: MAZZEH.id, name: 'شارع جديد', proof: null })
    ]);
    expect(last().locationId).toBe(MAZZEH.id); // the listing still points at a real place
  });

  it('only the first missing administrative level is proposed, and no street hangs off it', () => {
    create();
    picker.onGovernorate(String(DAMASCUS.id));
    picker.onTyped('District', 'حي غير معروف');
    picker.onTyped('Neighborhood', 'مجاور');
    picker.onTyped('Street', 'شارع');

    expect(last().proposals).toEqual([
      jasmine.objectContaining({ type: 'District', parentLocationId: DAMASCUS.id, name: 'حي غير معروف' })
    ]);
  });

  it('nothing is proposed without a governorate', () => {
    create();
    picker.onTyped('City', 'مدينة');
    expect(last().proposals).toEqual([]);
  });

  describe('the pin', () => {
    const reverse = (over: Partial<GeoReverseResult> = {}): GeoReverseResult => ({
      found: true, displayName: 'المزة، دمشق', matched: place(MAZZEH), chain: [], street: null,
      providerStatus: 'ok', attribution: '© OpenStreetMap contributors', ...over
    });

    it('suggests an address after the pin settles, and applies it only on a click', fakeAsync(() => {
      api.reverse.and.returnValue(of(reverse()));
      create();
      picker.onGovernorate(String(DAMASCUS.id));
      fixture.componentRef.setInput('coordinates', { lat: 33.5, lng: 36.3 });
      fixture.detectChanges();

      expect(api.reverse).not.toHaveBeenCalled(); // debounced while the pin is still moving
      tick(900);
      expect(api.reverse).toHaveBeenCalledTimes(1);
      expect(picker.suggestionText()).toContain('المزة');
      expect(picker.pickOf('District')).toBeNull(); // not applied by itself

      picker.useSuggestion();
      expect(picker.pickOf('District')?.id).toBe(MAZZEH.id);
      expect(picker.suggestionText()).toBeNull(); // and it is not offered again
    }));

    it('a suggestion can be ignored', fakeAsync(() => {
      api.reverse.and.returnValue(of(reverse()));
      create();
      picker.onGovernorate(String(DAMASCUS.id));
      fixture.componentRef.setInput('coordinates', { lat: 33.5, lng: 36.3 });
      fixture.detectChanges();
      tick(900);

      picker.dismissSuggestion();
      expect(picker.suggestionText()).toBeNull();
      expect(picker.pickOf('District')).toBeNull();
    }));

    it('warns when the pin is in another governorate than the one chosen', fakeAsync(() => {
      api.reverse.and.returnValue(of(reverse({ matched: place(ALEPPO) })));
      create();
      picker.onGovernorate(String(DAMASCUS.id));
      fixture.componentRef.setInput('coordinates', { lat: 36.2, lng: 37.1 });
      fixture.detectChanges();
      tick(900);

      expect(picker.pinMismatch()).toBeTrue();
      expect(picker.gov()?.id).toBe(DAMASCUS.id); // warns, never overrides
    }));

    it('a failing map lookup leaves the form working', fakeAsync(() => {
      api.reverse.and.returnValue(throwError(() => new Error('provider down')));
      create();
      picker.onGovernorate(String(DAMASCUS.id));
      fixture.componentRef.setInput('coordinates', { lat: 33.5, lng: 36.3 });
      fixture.detectChanges();
      tick(900);

      expect(picker.suggestionText()).toBeNull();
      expect(picker.pinMismatch()).toBeFalse();
      picker.onTyped('Street', 'ما زال يعمل');
      expect(last().street).toBe('ما زال يعمل');
    }));
  });

  describe('editing a saved listing', () => {
    it('restores the places from the saved locationId without emitting', () => {
      api.get.and.returnValue(of(place(VILLAT)));
      create({ locationId: VILLAT.id, governorateId: 3, city: 'مدينة دمشق', street: 'شارع كتبه المستخدم' });

      expect(api.get).toHaveBeenCalledWith(VILLAT.id);
      expect(picker.gov()?.id).toBe(DAMASCUS.id);
      expect(picker.pickOf('District')?.id).toBe(MAZZEH.id);
      expect(picker.pickOf('Neighborhood')?.id).toBe(VILLAT.id);
      expect(picker.textOf('Street')).toBe('شارع كتبه المستخدم');
      expect(emitted).toEqual([]);
    });

    it('restores a short-stay style listing from its old ids', () => {
      api.getDescendants.and.callFake((_ancestor, type) => of(type === 'District' ? [place(MAZZEH)] : [place(VILLAT)]));
      create({ governorateId: 3, districtId: 30, neighborhoodId: 300 });

      expect(picker.gov()?.id).toBe(DAMASCUS.id);
      expect(picker.pickOf('District')?.id).toBe(MAZZEH.id);
      expect(picker.pickOf('Neighborhood')?.id).toBe(VILLAT.id);
    });

    it('keeps the typed district of an old listing whose id has no catalog match', () => {
      create({ governorateId: 3, districtText: 'حي قديم' });
      expect(picker.textOf('District')).toBe('حي قديم');
    });
  });
});
