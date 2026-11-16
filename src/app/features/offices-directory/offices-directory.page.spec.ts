import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { OFFICES_PAGE_SIZE, OfficesDirectoryPage, filterFromParams } from './offices-directory.page';
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
    api = jasmine.createSpyObj('AgenciesApiService', ['searchDirectory', 'getDirectoryFacets']);
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
});
