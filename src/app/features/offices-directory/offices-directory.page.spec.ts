import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { OFFICES_PAGE_SIZE, OfficesDirectoryPage, clampMapBounds, filterFromParams, roundCoordinate } from './offices-directory.page';
import { AgenciesApiService } from '../../core/api/agencies-api.service';
import { LookupsApiService } from '../../core/api/lookups-api.service';
import { AgencyDirectoryItem } from '../../core/models/agency.model';
import { PageMetaService } from '../../core/services/page-meta.service';

function office(overrides: Partial<AgencyDirectoryItem> = {}): AgencyDirectoryItem {
  return {
    id: 'a1', name: 'Alpha', slug: 'alpha', verificationStatus: 'Unverified', activeListingCount: 3,
    ratingAverage: 0, ratingCount: 0, createdAt: '2026-11-01T00:00:00Z', governorateId: 1, ...overrides
  };
}

function page(items: AgencyDirectoryItem[], totalCount = items.length) {
  return { items, totalCount, page: 1, pageSize: OFFICES_PAGE_SIZE, totalPages: 1, hasNext: false, hasPrevious: false };
}

describe('filterFromParams', () => {
  it('reads every filter from the URL', () => {
    const f = filterFromParams(convertToParamMap({
      q: ' alpha ', governorateId: '3', districtId: '7', neighborhoodId: '9', propertyTypeId: '2',
      deal: 'ShortStay', verified: '1', minRating: '4', sort: 'TopRated', page: '2'
    }));
    expect(f).toEqual({
      search: 'alpha', governorateId: 3, districtId: 7, neighborhoodId: 9, propertyTypeId: 2,
      deal: 'ShortStay', verifiedOnly: true, minRating: 4, sort: 'TopRated', page: 2, pageSize: OFFICES_PAGE_SIZE
    });
  });

  it('drops values the server would refuse, instead of sending them', () => {
    const f = filterFromParams(convertToParamMap({
      governorateId: '-1', districtId: 'x', deal: 'Lease', minRating: '5', sort: 'Random', page: '99999', verified: 'yes'
    }));
    expect(f.governorateId).toBeNull();
    expect(f.districtId).toBeNull();
    expect(f.deal).toBeNull();
    expect(f.minRating).toBeNull();
    expect(f.sort).toBe('MostListings');
    expect(f.page).toBe(1000);
    expect(f.verifiedOnly).toBeFalse();
  });

  it('caps the search text at 100 characters', () => {
    expect(filterFromParams(convertToParamMap({ q: 'a'.repeat(150) })).search!.length).toBe(100);
  });
});

describe('near me and map helpers', () => {
  it('rounds the visitor position to three decimals', () => {
    expect(roundCoordinate(33.513456)).toBe(33.513);
    expect(roundCoordinate(36.27651)).toBe(36.277);
  });

  it('keeps a small map box and narrows a wide one around its centre to what the server accepts', () => {
    const small = { minLat: 33, minLng: 36, maxLat: 34, maxLng: 37 };
    expect(clampMapBounds(small)).toEqual(small);
    const wide = clampMapBounds({ minLat: 30, minLng: 30, maxLat: 40, maxLng: 50 });
    expect(wide).toEqual({ minLat: 30, minLng: 34, maxLat: 40, maxLng: 46 });
  });
});

describe('OfficesDirectoryPage', () => {
  let api: jasmine.SpyObj<AgenciesApiService>;
  let lookups: jasmine.SpyObj<LookupsApiService>;
  let params$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  function create() {
    TestBed.configureTestingModule({
      imports: [OfficesDirectoryPage, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { queryParamMap: params$.asObservable() } },
        { provide: AgenciesApiService, useValue: api },
        { provide: LookupsApiService, useValue: lookups },
        { provide: PageMetaService, useValue: jasmine.createSpyObj('PageMetaService', ['applyTranslated']) }
      ]
    });
    const fixture = TestBed.createComponent(OfficesDirectoryPage);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    params$ = new BehaviorSubject(convertToParamMap({}));
    api = jasmine.createSpyObj('AgenciesApiService', ['searchDirectory', 'getDirectoryFacets', 'getDirectoryMap']);
    api.getDirectoryMap.and.returnValue(of({ markers: [], isTruncated: false }));
    lookups = jasmine.createSpyObj('LookupsApiService', ['getGovernorates', 'getDistricts', 'getNeighborhoods', 'getPropertyTypeCatalog']);
    api.searchDirectory.and.returnValue(of(page([office(), office({ id: 'b2', name: 'Beta', slug: 'beta', verificationStatus: 'Verified' })])));
    api.getDirectoryFacets.and.returnValue(of({ governorates: [{ id: 1, count: 2 }, { id: 5, count: 1 }], districts: [], neighborhoods: [], totalCount: 2 }));
    lookups.getGovernorates.and.returnValue(of([{ id: 1, nameAr: 'دمشق', nameEn: 'Damascus' }] as never));
    lookups.getDistricts.and.returnValue(of([]));
    lookups.getNeighborhoods.and.returnValue(of([]));
    lookups.getPropertyTypeCatalog.and.returnValue(of([]));
  });

  it('loads the first page and shows one card per office, with the verified badge only where verified', () => {
    const fixture = create();
    expect(api.searchDirectory).toHaveBeenCalledWith(jasmine.objectContaining({ page: 1, pageSize: OFFICES_PAGE_SIZE, sort: 'MostListings' }));
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('[data-testid="office-card"]').length).toBe(2);
    expect(el.querySelectorAll('[data-testid="verified-badge"]').length).toBe(1);
  });

  it('offers only places that hold listed offices and whose name is known', () => {
    const page = create().componentInstance;
    expect(page.governorateOptions().map(o => o.id)).toEqual([1]);
  });

  it('shows the error state, not an empty list, when the search fails', () => {
    api.searchDirectory.and.returnValue(throwError(() => new Error('down')));
    const fixture = create();
    expect(fixture.componentInstance.failed()).toBeTrue();
    expect(fixture.nativeElement.querySelector('.offices__error')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-empty-state')).toBeNull();
  });

  it('choosing a governorate clears the district and neighborhood and returns to page 1', () => {
    params$.next(convertToParamMap({ governorateId: '1', districtId: '4', neighborhoodId: '8', page: '3' }));
    const fixture = create();
    const router = TestBed.inject(Router);
    const navigate = spyOn(router, 'navigate').and.resolveTo(true);
    fixture.componentInstance.setGovernorate(5);
    const qp = navigate.calls.mostRecent().args[1]!.queryParams!;
    expect(qp['governorateId']).toBe(5);
    expect(qp['districtId']).toBeNull();
    expect(qp['neighborhoodId']).toBeNull();
    expect(qp['page']).toBeNull();
  });

  it('clearing the filters keeps the sort', () => {
    params$.next(convertToParamMap({ sort: 'Newest', verified: '1', deal: 'Rent' }));
    const fixture = create();
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    fixture.componentInstance.clearFilters();
    const qp = navigate.calls.mostRecent().args[1]!.queryParams!;
    expect(qp['sort']).toBe('Newest');
    expect(qp['verified']).toBeNull();
    expect(qp['deal']).toBeNull();
  });

  it('builds a tel: link from the digits only', () => {
    expect(create().componentInstance.telHref('+963 11-222 333')).toBe('tel:+96311222333');
  });

  it('names the place from the lookups, falling back to the free-text city', () => {
    const page = create().componentInstance;
    expect(page.placeOf(office({ governorateId: 99, city: 'Homs' }))).toBe('Homs');
    expect(page.placeOf(office({ governorateId: null, city: null }))).toBeNull();
  });

  describe('near me', () => {
    it('sends the rounded position, the radius and the Nearest order, and never puts the position in the URL', () => {
      const fixture = create();
      const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
      fixture.componentInstance.useLocation(33.513456, 36.276512);
      expect(api.searchDirectory).toHaveBeenCalledWith(jasmine.objectContaining({
        latitude: 33.513, longitude: 36.277, radiusKm: 10, sort: 'Nearest', page: 1
      }));
      expect(navigate).not.toHaveBeenCalled();
    });

    it('a new radius searches again without asking for the position again', () => {
      const fixture = create();
      const page = fixture.componentInstance;
      page.useLocation(33.5, 36.3);
      const geo = spyOn(navigator.geolocation, 'getCurrentPosition');
      page.setRadius(25);
      expect(api.searchDirectory).toHaveBeenCalledWith(jasmine.objectContaining({ radiusKm: 25 }));
      expect(geo).not.toHaveBeenCalled();
      page.setRadius(999);
      expect(page.radiusKm()).toBe(25);
    });

    it('shows the distance and the nearest branch on the card', () => {
      api.searchDirectory.and.returnValue(of(page([office({ distanceMeters: 1234, nearestBranchName: 'Mezzeh' })])));
      const fixture = create();
      fixture.componentInstance.useLocation(33.5, 36.3);
      fixture.detectChanges();
      const text = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="distance"]')!.textContent!;
      expect(text).toContain('OFFICES.NEAR.DISTANCE_KM');
      expect(text).toContain('Mezzeh');
      expect(fixture.componentInstance.distanceKey(1234)).toEqual({ key: 'OFFICES.NEAR.DISTANCE_KM', value: '1.2' });
      expect(fixture.componentInstance.distanceKey(347)).toEqual({ key: 'OFFICES.NEAR.DISTANCE_M', value: '350' });
    });

    it('offers Nearest only while the position is known; picking another order leaves near me', () => {
      const fixture = create();
      const page = fixture.componentInstance;
      expect(page.sortOptions()).not.toContain('Nearest');
      page.useLocation(33.5, 36.3);
      expect(page.sortOptions()[0]).toBe('Nearest');
      expect(page.currentSort()).toBe('Nearest');
      const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
      page.setSort('TopRated');
      expect(page.near()).toBeNull();
      expect(navigate.calls.mostRecent().args[1]!.queryParams!['sort']).toBe('TopRated');
    });

    it('says so when the visitor refuses the location', () => {
      const fixture = create();
      spyOn(navigator.geolocation, 'getCurrentPosition').and.callFake((_ok, fail) => fail!({} as GeolocationPositionError));
      fixture.componentInstance.findNearMe();
      expect(fixture.componentInstance.geoError()).toBe('OFFICES.NEAR.DENIED');
      expect(fixture.componentInstance.near()).toBeNull();
    });
  });

  describe('map view', () => {
    it('does not search the list and asks the server for the visible box, clamped', () => {
      params$.next(convertToParamMap({ view: 'map', verified: '1' }));
      const fixture = create();
      expect(api.searchDirectory).not.toHaveBeenCalled();
      fixture.componentInstance.onMapBounds({ minLat: 30, minLng: 30, maxLat: 40, maxLng: 50 });
      return new Promise<void>(resolve => setTimeout(resolve, 350)).then(() => {
        expect(api.getDirectoryMap).toHaveBeenCalledWith({ minLat: 30, minLng: 34, maxLat: 40, maxLng: 46 }, true);
      });
    });

    it('turns markers into points that open the office page', () => {
      api.getDirectoryMap.and.returnValue(of({ markers: [{
        agencyId: 'a1', slug: 'alpha', name: 'Alpha', isVerified: true, branchId: 'b1', branchName: 'Mezzeh',
        isMain: true, latitude: 33.5, longitude: 36.3
      }], isTruncated: true }));
      params$.next(convertToParamMap({ view: 'map' }));
      const fixture = create();
      fixture.componentInstance.onMapBounds({ minLat: 33, minLng: 36, maxLat: 34, maxLng: 37 });
      return new Promise<void>(resolve => setTimeout(resolve, 350)).then(() => {
        fixture.detectChanges();
        expect(fixture.componentInstance.mapPoints()).toEqual([jasmine.objectContaining({
          id: 'b1', label: 'Alpha', detail: 'Mezzeh', verified: true, link: ['/offices', 'alpha']
        })]);
        expect((fixture.nativeElement as HTMLElement).textContent).toContain('OFFICES.MAP.TRUNCATED');
      });
    });

    it('switching views keeps the filters and drops the page', () => {
      const fixture = create();
      const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
      fixture.componentInstance.setView('map');
      const extras = navigate.calls.mostRecent().args[1]!;
      expect(extras.queryParams).toEqual({ view: 'map', page: null });
      expect(extras.queryParamsHandling).toBe('merge');
    });
  });
});
