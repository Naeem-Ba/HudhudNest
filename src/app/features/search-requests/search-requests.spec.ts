import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { AnonymousSearchRequest, SearchRequest, SearchRequestApiService } from '../../core/api/search-request-api.service';
import { LookupsApiService } from '../../core/api/lookups-api.service';
import { PlaceProposalService } from '../../core/api/place-proposal.service';
import { PropertyApiService } from '../../core/api/property-api.service';
import { ToastService } from '../../shared/services/toast.service';
import { MySearchRequestsPage } from './my-search-requests.page';
import { SearchRequestBoardPage } from './search-request-board.page';

const anon = (over: Partial<AnonymousSearchRequest> = {}): AnonymousSearchRequest => ({
  id: 'r1', listingType: 'ForRent', governorateId: 1, maxBudget: 300, currencyCode: 'USD',
  needsBalcony: true, needsElevator: false, needsParking: false, needsFurnished: false,
  details: 'قرب الجامعة', createdAt: '2026-11-01T10:00:00Z', expiresAt: '2026-12-31T10:00:00Z', ...over
});

describe('Search requests pages', () => {
  let api: jasmine.SpyObj<SearchRequestApiService>;

  function setup(paramId: string | null = null) {
    api = jasmine.createSpyObj<SearchRequestApiService>('SearchRequestApiService',
      ['getMine', 'create', 'update', 'change', 'getMatches', 'getBoard', 'getForListing', 'propose']);
    const lookups = jasmine.createSpyObj<LookupsApiService>('LookupsApiService', ['getGovernorates', 'getPropertyTypeCatalog', 'getDistricts']);
    lookups.getGovernorates.and.returnValue(of([{ id: 1, nameAr: 'دمشق', nameEn: 'Damascus' }]));
    lookups.getPropertyTypeCatalog.and.returnValue(of([]));
    lookups.getDistricts.and.returnValue(of([]));
    const properties = jasmine.createSpyObj<PropertyApiService>('PropertyApiService', ['getMyProperties']);
    properties.getMyProperties.and.returnValue(of([{ id: 'p1', title: 'شقتي', isPublished: true } as never]));
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: SearchRequestApiService, useValue: api },
        { provide: LookupsApiService, useValue: lookups },
        { provide: PropertyApiService, useValue: properties },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'error']) },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap(paramId ? { propertyId: paramId } : {}) } } }
      ]
    });
  }

  it('lists my requests and opens the matches of one', () => {
    setup();
    const mine: SearchRequest = { ...anon(), status: 'Active', matchCount: 2 } as SearchRequest;
    api.getMine.and.returnValue(of([mine]));
    api.getMatches.and.returnValue(of([{ propertyId: 'p9', title: 'شقة', listingType: 'ForRent', purchasePrice: null, coldRent: 250, warmRent: null,
      currencyCode: 'USD', rooms: 2, area: 80, mainImageUrl: null, score: 87, reasons: ['budget_within'], source: 'Proposed', matchedAt: '' }]));

    const fixture = TestBed.createComponent(MySearchRequestsPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('[data-testid="sr-item"]').length).toBe(1);
    expect(el.textContent).toContain('قرب الجامعة');

    fixture.componentInstance.toggleMatches(mine);
    fixture.detectChanges();
    expect(api.getMatches).toHaveBeenCalledWith('r1');
    expect(el.querySelector('[data-testid="sr-matches"] a')?.getAttribute('href')).toBe('/properties/p9');
  });

  it('sends the request with an end-of-day UTC expiry and no blank details', () => {
    setup();
    api.getMine.and.returnValue(of([]));
    api.create.and.returnValue(of({} as SearchRequest));
    const fixture = TestBed.createComponent(MySearchRequestsPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    page.startCreate();
    page.form.governorateId = 1;
    page.form.maxBudget = 500;
    page.form.details = '   ';
    page.expiresDate = '2026-12-01';
    page.save();
    const body = api.create.calls.mostRecent().args[0];
    expect(body.details).toBeNull();
    expect(body.expiresAt).toBe('2026-12-01T23:59:00Z');
  });

  it('proposes a district typed by hand once the request is saved, and the request keeps the governorate', () => {
    setup();
    api.getMine.and.returnValue(of([]));
    api.create.and.returnValue(of({} as SearchRequest));
    const fixture = TestBed.createComponent(MySearchRequestsPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    const proposals = jasmine.createSpyObj<PlaceProposalService>('PlaceProposalService', ['propose', 'canPropose']);
    proposals.propose.and.returnValue(of(true));
    (page as unknown as { injector: unknown }).injector = { get: () => proposals };

    page.startCreate();
    page.form.governorateId = 1;
    page.form.maxBudget = 500;
    page.onDistrictTyped('الشعلان');
    page.save();

    expect(api.create.calls.mostRecent().args[0].districtId).toBeNull();
    expect(proposals.propose).toHaveBeenCalledOnceWith({ governorateId: 1, type: 'District', name: 'الشعلان' });
    expect(page.districtText).toBe('');
  });

  it('offers the districts in a combo whose arrow lists them all', () => {
    setup();
    api.getMine.and.returnValue(of([]));
    const fixture = TestBed.createComponent(MySearchRequestsPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    page.startCreate();
    page.districts.set([{ id: 5, nameAr: 'المزة', nameEn: 'Mazzeh' }, { id: 6, nameAr: 'الميدان', nameEn: 'Midan' }]);
    page.form.governorateId = 1;
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('select[name="districtId"]')).toBeNull();
    (el.querySelector('#sr-district ~ .combo__toggle') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelectorAll('.combo__option').length).toBe(2);
  });

  it('explains the board to a user without a published listing instead of failing', () => {
    setup();
    api.getBoard.and.returnValue(throwError(() => ({ status: 403 })));
    const fixture = TestBed.createComponent(SearchRequestBoardPage);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="sr-board-forbidden"]')).not.toBeNull();
  });

  it('proposes a listing from the board and marks it as sent', () => {
    setup();
    api.getBoard.and.returnValue(of({ items: [anon()], totalCount: 1, page: 1, pageSize: 20 }));
    api.propose.and.returnValue(of(void 0));
    const fixture = TestBed.createComponent(SearchRequestBoardPage);
    fixture.detectChanges();
    fixture.componentInstance.propose('r1', 'p1');
    fixture.detectChanges();
    expect(api.propose).toHaveBeenCalledWith('r1', 'p1');
    expect(fixture.componentInstance.proposed().has('r1')).toBeTrue();
  });

  it('on a listing page shows the score and already-proposed requests', () => {
    setup('p1');
    api.getForListing.and.returnValue(of([{ request: anon(), score: 90, reasons: ['location_governorate'], alreadyProposed: true }]));
    const fixture = TestBed.createComponent(SearchRequestBoardPage);
    fixture.detectChanges();
    expect(api.getForListing).toHaveBeenCalledWith('p1');
    expect(api.getBoard).not.toHaveBeenCalled();
    expect(fixture.componentInstance.proposed().has('r1')).toBeTrue();
  });
});
