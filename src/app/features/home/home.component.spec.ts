import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { Router } from '@angular/router';

import { LocationNamesService } from '../../core/api/location-names.service';
import { LookupsApiService } from '../../core/api/lookups-api.service';
import { PropertyApiService } from '../../core/api/property-api.service';
import { Property, PropertyFilterDto } from '../../core/models/property.model';
import { InterestAreasService } from '../../core/services/interest-areas.service';
import { LanguageService } from '../../core/services/language.service';
import { PageMetaService } from '../../core/services/page-meta.service';
import { UrlService } from '../../core/services/url.service';
import { ListingTitleTranslationService } from '../../core/api/listing-title-translation.service';
import { HomeComponent } from './home.component';

function listing(id: string, createdAt: string, extra: Partial<Property> = {}): Property {
  return { id, title: `T-${id}`, city: 'Damascus', createdAt, images: [], imageUrls: [], ...extra } as Property;
}

describe('HomeComponent — latest listings', () => {
  let api: jasmine.SpyObj<PropertyApiService>;
  let interest$: BehaviorSubject<string | undefined>;

  let lang$: BehaviorSubject<string>;
  let translated = false;

  function create() {
    translated = false;
    lang$ = new BehaviorSubject<string>('ar');
    api = jasmine.createSpyObj('PropertyApiService', ['getProperties']);
    interest$ = new BehaviorSubject<string | undefined>(undefined);

    TestBed.configureTestingModule({
      imports: [HomeComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: PropertyApiService, useValue: api },
        { provide: InterestAreasService, useValue: { param$: interest$.asObservable() } },
        {
          provide: LookupsApiService,
          useValue: {
            getGovernorates: () => of([
              { id: 1, nameAr: 'دمشق', nameEn: 'Damascus', nameDe: null },
              { id: 2, nameAr: 'حلب', nameEn: 'Aleppo', nameDe: null }
            ]),
            getPropertyTypeCatalog: () => of([
              { id: 7, code: 'apartment', nameAr: 'شقة', nameEn: 'Apartment', category: 'Residential' }
            ])
          }
        },
        { provide: LocationNamesService, useValue: { city: () => 'Damascus', region: () => '', cityName: (c: string) => c, governorateName: () => '', locationLabel: () => '' } },
        { provide: LanguageService, useValue: { getCurrent: () => lang$.value, currentLang$: lang$.asObservable() } },
        {
          provide: ListingTitleTranslationService,
          useValue: {
            display: (_kind: string, _id: string, title: string) => (translated ? `EN ${title}` : title),
            hasTranslation: () => translated,
            showingOriginal: () => false,
            toggleOriginal: () => undefined
          }
        },
        { provide: PageMetaService, useValue: jasmine.createSpyObj('PageMetaService', ['applyTranslated']) },
        { provide: UrlService, useValue: { buildResponsiveUrl: () => null, buildResponsiveSrcSet: () => null } }
      ]
    });
    return TestBed.createComponent(HomeComponent);
  }

  it('shows the listings in the order the server sent: featured ads are not re-sorted away by date', () => {
    const fixture = create();
    api.getProperties.and.returnValue(of([
      listing('ad', '2026-01-01T00:00:00Z', { isFeatured: true }),
      listing('new-1', '2026-11-04T00:00:00Z'),
      listing('new-2', '2026-11-03T00:00:00Z'),
      listing('old-3', '2026-02-01T00:00:00Z'),
      listing('old-4', '2026-02-01T00:00:00Z'),
      listing('old-5', '2026-02-01T00:00:00Z'),
      listing('seventh', '2026-11-05T00:00:00Z')
    ]));

    fixture.componentInstance.ngOnInit();

    expect(fixture.componentInstance.properties.map(p => p.id)).toEqual(['ad', 'new-1', 'new-2', 'old-3', 'old-4', 'old-5']);
  });

  it('asks the server for the six to show, with the visitor\'s areas', () => {
    const fixture = create();
    api.getProperties.and.returnValue(of([]));
    interest$.next('3,7');

    fixture.componentInstance.ngOnInit();

    expect(api.getProperties).toHaveBeenCalledOnceWith({ page: 1, pageSize: 6, interestGovernorateIds: '3,7' } as PropertyFilterDto);
  });

  it('asks again when the areas become known after the page (profile or saved searches arriving late)', () => {
    const fixture = create();
    api.getProperties.and.returnValue(of([]));
    fixture.componentInstance.ngOnInit();

    interest$.next('4');

    expect(api.getProperties.calls.allArgs().map(args => args[0]?.interestGovernorateIds)).toEqual([undefined, '4']);
  });

  it('shows an empty list, not an error screen, when loading fails', () => {
    const fixture = create();
    spyOn(console, 'error');
    api.getProperties.and.returnValue(throwError(() => new Error('offline')));

    fixture.componentInstance.ngOnInit();

    expect(fixture.componentInstance.properties).toEqual([]);
  });

  it('badges only the ad of the visitor\'s own area', () => {
    const fixture = create();
    api.getProperties.and.returnValue(of([
      listing('local-ad', '2026-01-01T00:00:00Z', { isFeatured: true, matchesInterestArea: true }),
      listing('other-ad', '2026-01-02T00:00:00Z', { isFeatured: true }),
      listing('plain', '2026-01-03T00:00:00Z')
    ]));

    fixture.detectChanges();

    const badges = fixture.nativeElement.querySelectorAll('.badge--area');
    expect(badges.length).toBe(1);
    expect(badges[0].closest('a, article, .prop-card')?.textContent).toContain('T-local-ad');
  });

  describe('hero search', () => {
    function ready() {
      const fixture = create();
      api.getProperties.and.returnValue(of([]));
      fixture.detectChanges();
      return fixture;
    }

    it('lists the governorates in the visitor\'s language only, never both spellings', () => {
      const fixture = ready();
      expect(fixture.componentInstance.governorateOptions.map(o => o.label)).toEqual(['دمشق', 'حلب']);

      lang$.next('en');
      expect(fixture.componentInstance.governorateOptions.map(o => o.label)).toEqual(['Damascus', 'Aleppo']);
    });

    it('lists the property types in the visitor\'s language', () => {
      const fixture = ready();
      expect(fixture.componentInstance.propertyTypeOptions.map(o => o.label)).toEqual(['شقة']);
    });

    it('opens the full list from the arrow of the location and type fields (no native datalist)', () => {
      const fixture = ready();
      const host: HTMLElement = fixture.nativeElement;
      expect(host.querySelector('datalist')).toBeNull();

      (host.querySelector('#heroSearchCity')!.closest('app-combo-box')!.querySelector('.combo__toggle') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(Array.from(host.querySelectorAll('.combo__option')).map(e => e.textContent!.trim())).toEqual(['دمشق', 'حلب']);
    });

    it('searches by ids so the results do not depend on the language the owner typed the city in', () => {
      const fixture = ready();
      const navigate = spyOn(TestBed.inject(Router), 'navigate');
      const home = fixture.componentInstance;
      home.searchGovernorateId = 2;
      home.searchPropertyTypeId = 7;
      home.searchListingType = 'ForRent';

      home.submitHeroSearch();

      expect(navigate).toHaveBeenCalledWith(['/properties'], {
        queryParams: { governorateId: 2, propertyTypeId: 7, listingType: 'ForRent' }
      });
    });

    it('sends nothing for fields left empty', () => {
      const fixture = ready();
      const navigate = spyOn(TestBed.inject(Router), 'navigate');

      fixture.componentInstance.submitHeroSearch();

      expect(navigate).toHaveBeenCalledWith(['/properties'], { queryParams: {} });
    });
  });

  it('shows each card title in the visitor\'s language when the translation is known, with the toggle bar above the list', () => {
    const fixture = create();
    translated = true;
    api.getProperties.and.returnValue(of([listing('a', '2026-11-04T00:00:00Z')]));

    fixture.componentInstance.ngOnInit();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.prop-card__title')?.textContent?.trim()).toBe('EN T-a');
    expect(el.querySelector('[data-testid="title-translation-bar"]')).not.toBeNull();
  });
});
