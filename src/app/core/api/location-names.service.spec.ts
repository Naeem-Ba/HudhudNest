import { TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';

import { LocationNamesService, normalizePlaceName } from './location-names.service';
import { LookupsApiService, StructuredLocationLookup, pickLocalizedName } from './lookups-api.service';

const governorates: StructuredLocationLookup[] = [
  { id: 1, nameAr: 'دمشق', nameEn: 'Damascus', nameDe: 'Damaskus' },
  { id: 2, nameAr: 'حلب', nameEn: 'Aleppo' }
];
const districts: StructuredLocationLookup[] = [
  { id: 10, nameAr: 'المزة', nameEn: 'Mezzeh', parentId: 1 }
];

describe('LocationNamesService', () => {
  let lang: Subject<{ lang: string }>;
  let lookups: jasmine.SpyObj<LookupsApiService>;
  let translate: { currentLang: string; defaultLang: string; onLangChange: Subject<{ lang: string }> };

  function create(current: string): LocationNamesService {
    lang = new Subject();
    translate = { currentLang: current, defaultLang: 'ar', onLangChange: lang };
    lookups = jasmine.createSpyObj<LookupsApiService>('LookupsApiService', ['getGovernorates', 'getDistricts']);
    lookups.getGovernorates.and.returnValue(of(governorates));
    lookups.getDistricts.and.returnValue(of(districts));
    TestBed.configureTestingModule({
      providers: [
        { provide: LookupsApiService, useValue: lookups },
        { provide: TranslateService, useValue: translate }
      ]
    });
    return TestBed.inject(LocationNamesService);
  }

  it('shows the stored place in the visitor language, whichever language the owner used', () => {
    const service = create('en');
    service.city({ city: 'دمشق' }); // first call triggers the load
    expect(service.city({ city: 'دمشق' })).toBe('Damascus');
    expect(service.city({ city: 'Damascus' })).toBe('Damascus');

    lang.next({ lang: 'ar' });
    expect(service.city({ city: 'Damascus', governorateId: 1 })).toBe('دمشق');
  });

  it('prefers the structured id over the stored text', () => {
    const service = create('en');
    service.city({ city: 'x', governorateId: 2 });
    expect(service.city({ city: 'Damascus', governorateId: 2 })).toBe('Aleppo');
  });

  it('uses the German name where there is one, English where there is not, and matches stored German text', () => {
    const service = create('de');
    service.city({ city: 'حلب' });
    expect(service.city({ city: 'دمشق' })).toBe('Damaskus');
    expect(service.city({ city: 'Damaskus' })).toBe('Damaskus');
    expect(service.city({ city: 'حلب' })).toBe('Aleppo');
  });

  it('shows unknown places exactly as stored', () => {
    const service = create('de');
    service.city({ city: 'حلب' });
    expect(service.city({ city: 'Kleinstadt' })).toBe('Kleinstadt');
    expect(service.city({ city: null })).toBe('');
  });

  it('resolves the district by id or by text inside the governorate', () => {
    const service = create('en');
    service.city({ city: 'دمشق' });
    service.region({ city: 'دمشق', region: 'المزة' });
    expect(service.region({ city: 'دمشق', region: 'المزة' })).toBe('Mezzeh');
    expect(service.region({ governorateId: 1, districtId: 10, region: 'whatever' })).toBe('Mezzeh');
    expect(service.region({ governorateId: 1, region: 'Unlisted' })).toBe('Unlisted');
    expect(lookups.getDistricts).toHaveBeenCalledTimes(1); // cached per governorate
  });

  it('keeps the stored text when the lookups cannot be loaded', () => {
    const service = create('en');
    lookups.getGovernorates.and.returnValue(new Subject<StructuredLocationLookup[]>());
    expect(service.city({ city: 'دمشق' })).toBe('دمشق');
  });

  it('normalizes spelling variants', () => {
    expect(normalizePlaceName('  الإِسكندريّة ')).toBe(normalizePlaceName('الاسكندريه'.replace('ه', 'ة')));
    expect(normalizePlaceName('Damascus ')).toBe('damascus');
  });
});

describe('pickLocalizedName', () => {
  it('uses the German name for German only when present, otherwise English, and Arabic for Arabic', () => {
    expect(pickLocalizedName({ nameAr: 'دمشق', nameEn: 'Damascus', nameDe: 'Damaskus' }, 'de')).toBe('Damaskus');
    expect(pickLocalizedName({ nameAr: 'حلب', nameEn: 'Aleppo', nameDe: null }, 'de')).toBe('Aleppo');
    expect(pickLocalizedName({ nameAr: 'حلب', nameEn: 'Aleppo' }, 'en')).toBe('Aleppo');
    expect(pickLocalizedName({ nameAr: 'دمشق', nameEn: 'Damascus', nameDe: 'Damaskus' }, 'ar')).toBe('دمشق');
    expect(pickLocalizedName({ nameAr: 'دمشق', nameEn: 'Damascus', nameDe: 'Damaskus' }, 'en')).toBe('Damascus');
  });
});
