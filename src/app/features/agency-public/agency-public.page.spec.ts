// =====================================================================
// agency-public.page.spec.ts
// منطق الصفحة العامة للمكتب وتقييمه (بلا تصيير القالب — نفس نهج property-list.page.spec.ts):
// الصفحة تتدهور بهدوء، تقييم المكتب منفصل عن تقييم الأعضاء، النموذج لا يرسل محورًا لم يُختَر،
// والمُقيِّم لا يُرسَل أبدًا (الخادم يأخذه من التوكن).
// =====================================================================
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { PageMetaService } from '../../core/services/page-meta.service';
import { TranslateService } from '@ngx-translate/core';
import { Subject, of, throwError } from 'rxjs';

import { AgencyPublicPage } from './agency-public.page';
import { AgenciesApiService } from '../../core/api/agencies-api.service';
import { PropertyApiService } from '../../core/api/property-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/services/toast.service';
import { Agency, AgencyRatingEligibilityDto, AgencyRatingSummaryDto } from '../../core/models/agency.model';
import { LookupsApiService } from '../../core/api/lookups-api.service';
import { LanguageService } from '../../core/services/language.service';

const AGENCY: Agency = {
  id: 'agency-1',
  name: 'XYZ Real Estate',
  slug: 'xyz',
  countryCode: 'SY',
  ownerUserId: 'owner-1',
  isActive: true,
  memberCount: 2,
  createdAt: '2026-01-01T00:00:00Z',
  members: []
};

const SUMMARY: AgencyRatingSummaryDto = {
  averageService: 4,
  averageProfessionalism: 5,
  averageReliability: 3,
  averageOverallExperience: 4,
  averageOverall: 4,
  totalCount: 3,
  page: 1,
  pageSize: 20,
  ratings: []
};

function eligibility(partial: Partial<AgencyRatingEligibilityDto> = {}): AgencyRatingEligibilityDto {
  return { canRate: true, isMemberOrOwner: false, hasInteraction: true, alreadyRated: false, ...partial };
}

describe('AgencyPublicPage', () => {
  let agencies: jasmine.SpyObj<AgenciesApiService>;
  let properties: jasmine.SpyObj<PropertyApiService>;
  let toast: jasmine.SpyObj<ToastService>;
  let lookups: jasmine.SpyObj<LookupsApiService>;

  function create(opts: { slug?: string; userId?: string | null } = {}): AgencyPublicPage {
    TestBed.configureTestingModule({
      providers: [
        AgencyPublicPage,
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ slug: opts.slug ?? 'xyz' })) } },
        { provide: PageMetaService, useValue: jasmine.createSpyObj<PageMetaService>('PageMetaService', ['applyDynamic', 'markNotFound', 'clear']) },
        { provide: AgenciesApiService, useValue: agencies },
        { provide: PropertyApiService, useValue: properties },
        { provide: AuthService, useValue: { getCurrentUserId: () => (opts.userId === undefined ? 'user-1' : opts.userId) } },
        { provide: ToastService, useValue: toast },
        { provide: TranslateService, useValue: { instant: (k: string) => k } },
        { provide: LookupsApiService, useValue: lookups },
        { provide: LanguageService, useValue: { getCurrent: () => 'en', currentLang$: of('en') } }
      ]
    });
    return TestBed.inject(AgencyPublicPage);
  }

  beforeEach(() => {
    agencies = jasmine.createSpyObj<AgenciesApiService>('AgenciesApiService', ['getBySlug', 'getRatings', 'getRatingEligibility', 'submitRating', 'recordEvent']);
    properties = jasmine.createSpyObj<PropertyApiService>('PropertyApiService', ['getPropertiesPaged']);
    toast = jasmine.createSpyObj<ToastService>('ToastService', ['success', 'error']);
    lookups = jasmine.createSpyObj<LookupsApiService>('LookupsApiService', ['getGovernorates', 'getDistricts']);
    lookups.getGovernorates.and.returnValue(of([{ id: 1, nameAr: 'دمشق', nameEn: 'Damascus' }] as never));
    lookups.getDistricts.and.returnValue(of([{ id: 4, nameAr: 'المزة', nameEn: 'Mezzeh' }] as never));

    agencies.getBySlug.and.returnValue(of(AGENCY));
    agencies.recordEvent.and.returnValue(of({ counted: true }));
    agencies.getRatings.and.returnValue(of(SUMMARY));
    agencies.getRatingEligibility.and.returnValue(of(eligibility()));
    properties.getPropertiesPaged.and.returnValue(of({ items: [], page: 1, pageSize: 12, totalCount: 7, totalPages: 1, hasNext: false, hasPrevious: false }));
  });

  it('loads the agency, its rating and ITS listings (agencyId filter), not the members\' ratings', () => {
    const page = create();

    page.ngOnInit();

    expect(page.agency()?.name).toBe('XYZ Real Estate');
    expect(page.summary()?.averageOverall).toBe(4);
    expect(agencies.getRatings).toHaveBeenCalledWith('agency-1', 1, 20);
    expect(properties.getPropertiesPaged).toHaveBeenCalledWith({ agencyId: 'agency-1', page: 1, pageSize: 12 });
  });

  describe('closed-deal tabs (P7-D08)', () => {
    function pageOf(items: unknown[], totalCount: number) {
      return of({ items, page: 1, pageSize: 12, totalCount, totalPages: 1, hasNext: false, hasPrevious: false } as never);
    }

    it('asks for the sold and rented counts and offers a tab only for a non-empty one', () => {
      properties.getPropertiesPaged.and.callFake(filter =>
        filter.status === 'Sold' ? pageOf([], 3) : filter.status === 'Rented' ? pageOf([], 0) : pageOf([], 0)
      );
      const page = create();

      page.ngOnInit();

      expect(properties.getPropertiesPaged).toHaveBeenCalledWith({ agencyId: 'agency-1', status: 'Sold', page: 1, pageSize: 1 });
      expect(properties.getPropertiesPaged).toHaveBeenCalledWith({ agencyId: 'agency-1', status: 'Rented', page: 1, pageSize: 1 });
      expect(page.soldCount()).toBe(3);
      expect(page.rentedCount()).toBe(0);
    });

    it('selecting the sold tab loads Sold listings and draws them as muted, tagged cards', () => {
      const sold = { id: 'p1', title: 'Flat', city: 'Damascus', status: 'Sold' };
      properties.getPropertiesPaged.and.callFake(filter => (filter.status === 'Sold' ? pageOf([sold], 1) : pageOf([], 0)));
      const page = create();
      page.ngOnInit();

      page.selectTab('sold');

      expect(properties.getPropertiesPaged).toHaveBeenCalledWith({ agencyId: 'agency-1', status: 'Sold', page: 1, pageSize: 12 });
      expect(page.listings()).toEqual([sold as never]);
      expect(page.isMuted(sold as never)).toBeTrue();
      expect(page.tagKey(sold as never)).toBe('LISTING_STATUS.SOLD');
      expect(page.emptyListingsKey()).toBe('AGENCY_PUBLIC.NO_LISTINGS'.replace('NO_LISTINGS', 'NO_SOLD'));
    });

    it('on the live tab only a Reserved listing is muted and an Available one is not', () => {
      const page = create();
      page.ngOnInit();

      expect(page.isMuted({ id: 'a', status: 'Reserved' } as never)).toBeTrue();
      expect(page.isMuted({ id: 'b', status: 'Available' } as never)).toBeFalse();
      expect(page.tagKey({ id: 'b', status: 'Available' } as never)).toBeNull();
    });

    it('a reply for a tab the visitor already left does not overwrite the visible one', () => {
      const late = new Subject<never>();
      properties.getPropertiesPaged.and.callFake(filter => {
        if (filter.status === 'Rented' && filter.pageSize === 12) return late.asObservable();
        return pageOf([], filter.status ? 2 : 0);
      });
      const page = create();
      page.ngOnInit();

      page.selectTab('rented');
      page.selectTab('active');
      late.next({ items: [{ id: 'x', status: 'Rented' }], page: 1, pageSize: 12, totalCount: 1, totalPages: 1, hasNext: false, hasPrevious: false } as never);

      expect(page.listings().some(l => l.id === 'x')).toBeFalse();
    });
  });

  it('shows the not-found state for an unknown or deactivated agency (404)', () => {
    agencies.getBySlug.and.returnValue(throwError(() => ({ status: 404 })));
    const page = create();

    page.ngOnInit();

    expect(page.notFound()).toBeTrue();
    expect(page.loading()).toBeFalse();
    expect(agencies.getRatings).not.toHaveBeenCalled();
  });

  it('stays usable when the backend has no agency ratings yet (older server)', () => {
    agencies.getRatings.and.returnValue(throwError(() => ({ status: 404 })));
    const page = create();

    page.ngOnInit();

    expect(page.agency()).not.toBeNull();
    expect(page.notFound()).toBeFalse();
    expect(page.summary()).toBeNull();
    expect(page.ratingsLoading()).toBeFalse();
  });

  it('does not ask for eligibility when logged out', () => {
    const page = create({ userId: null });

    page.ngOnInit();

    expect(page.isLoggedIn()).toBeFalse();
    expect(agencies.getRatingEligibility).not.toHaveBeenCalled();
  });

  it('hides the rating section for an agency member or owner (server decides)', () => {
    agencies.getRatingEligibility.and.returnValue(of(eligibility({ canRate: false, isMemberOrOwner: true })));
    const page = create();

    page.ngOnInit();

    expect(page.isMemberOrOwner()).toBeTrue();
    expect(page.showRateCta()).toBeFalse();
  });

  it('refuses to submit until every criterion is chosen, and sends nothing', () => {
    const page = create();
    page.ngOnInit();
    page.setCriterion('service', 5);

    page.submitRating();

    expect(agencies.submitRating).not.toHaveBeenCalled();
    expect(page.showMissingCriteria()).toBeTrue();
  });

  it('submits the four criteria + trimmed comment for the agency id, then reloads rating and eligibility', () => {
    agencies.submitRating.and.returnValue(of({} as never));
    const page = create();
    page.ngOnInit();
    page.setCriterion('service', 5);
    page.setCriterion('professionalism', 4);
    page.setCriterion('reliability', 3);
    page.setCriterion('overallExperience', 4);
    page.ratingForm.patchValue({ comment: '  fine  ' });
    agencies.getRatings.calls.reset();
    agencies.getRatingEligibility.calls.reset();

    page.submitRating();

    expect(agencies.submitRating).toHaveBeenCalledWith('agency-1', {
      service: 5, professionalism: 4, reliability: 3, overallExperience: 4, comment: 'fine'
    });
    expect(toast.success).toHaveBeenCalledWith('AGENCY_RATING.SUCCESS');
    expect(agencies.getRatings).toHaveBeenCalledTimes(1);
    expect(agencies.getRatingEligibility).toHaveBeenCalledTimes(1);
  });

  it('pre-fills the form from an earlier rating and treats the next submit as an edit', () => {
    const existing = {
      id: 'r1', agencyId: 'agency-1', raterId: 'user-1', raterName: 'Me', service: 2, professionalism: 3,
      reliability: 4, overallExperience: 5, overallScore: 3.5, comment: 'ok', createdAt: '2026-01-02T00:00:00Z'
    };
    agencies.getRatingEligibility.and.returnValue(of(eligibility({ alreadyRated: true, existingRating: existing })));
    agencies.submitRating.and.returnValue(of({} as never));
    const page = create();

    page.ngOnInit();

    expect(page.isEditingRating()).toBeTrue();
    expect(page.ratingForm.getRawValue()).toEqual({ service: 2, professionalism: 3, reliability: 4, overallExperience: 5, comment: 'ok' });

    page.submitRating();
    expect(toast.success).toHaveBeenCalledWith('AGENCY_RATING.UPDATE_SUCCESS');
  });

  it('shows the server\'s own reason when it rejects the rating (e.g. no interaction yet)', () => {
    agencies.submitRating.and.returnValue(throwError(() => ({ error: { message: 'يجب إتمام زيارة أو التواصل أولاً' } })));
    const page = create();
    page.ngOnInit();
    ['service', 'professionalism', 'reliability', 'overallExperience'].forEach(k => page.setCriterion(k, 4));

    page.submitRating();

    expect(toast.error).toHaveBeenCalledWith('يجب إتمام زيارة أو التواصل أولاً');
    expect(page.submittingRating()).toBeFalse();
  });

  describe('branches', () => {
    const withBranches: Agency = {
      ...AGENCY,
      branches: [
        { id: 'b1', name: 'Head office', isMain: true, governorateId: 1, districtId: 4, latitude: 33.5, longitude: 36.27 },
        { id: 'b2', name: 'Kiosk', isMain: false, governorateId: 1, latitude: null, longitude: null }
      ]
    };

    it('lists every branch but puts only the pinned ones on the map', () => {
      agencies.getBySlug.and.returnValue(of(withBranches));
      const page = create();
      page.ngOnInit();
      expect(page.branches().map(b => b.id)).toEqual(['b1', 'b2']);
      expect(page.branchPoints()).toEqual([jasmine.objectContaining({ id: 'b1', latitude: 33.5, longitude: 36.27, main: true })]);
    });

    it('names the branch place from the lookups and loads districts only where a branch has one', () => {
      agencies.getBySlug.and.returnValue(of(withBranches));
      const page = create();
      page.ngOnInit();
      expect(lookups.getDistricts).toHaveBeenCalledOnceWith(1);
      expect(page.branchPlace(withBranches.branches![0])).toBe('Mezzeh, Damascus');
      expect(page.branchPlace(withBranches.branches![1])).toBe('Damascus');
    });

    it('offers directions only for a branch with coordinates', () => {
      const page = create();
      expect(page.directionsUrl(withBranches.branches![0])).toBe('https://www.google.com/maps/dir/?api=1&destination=33.5,36.27');
      expect(page.directionsUrl(withBranches.branches![1])).toBeNull();
    });

    it('does not ask for place names when the office has no branches', () => {
      const page = create();
      page.ngOnInit();
      expect(page.branches()).toEqual([]);
      expect(lookups.getGovernorates).not.toHaveBeenCalled();
    });
  });

  describe('office profile (cover, links, hours)', () => {
    const PROFILE: Agency = {
      ...AGENCY,
      coverImageUrl: 'https://img.example/cover.png',
      website: 'https://office.example.sy/',
      socialLinks: [
        { network: 'WhatsApp', value: '+963944123456' },
        { network: 'Instagram', value: 'https://instagram.com/office' },
        { network: 'Facebook', value: 'javascript:alert(1)' }
      ],
      workingHours: [{ day: 'Monday', ranges: [{ opens: '09:00', closes: '17:00' }] }]
    };

    it('offers WhatsApp, the website and only the https social links, and counts their clicks', () => {
      agencies.getBySlug.and.returnValue(of(PROFILE));
      const page = create();
      page.ngOnInit();
      expect(page.whatsApp()).toBe('https://wa.me/963944123456');
      expect(page.websiteHref()).toBe('https://office.example.sy/');
      expect(page.profileLinks()).toEqual([{ channel: 'Instagram', href: 'https://instagram.com/office' }]);

      page.track({ type: 'ContactClick', channel: 'Instagram' });
      expect(agencies.recordEvent).toHaveBeenCalledWith('agency-1', { type: 'ContactClick', channel: 'Instagram' });
    });

    it('shows a full week from partial hours, and nothing when the office set none', () => {
      agencies.getBySlug.and.returnValue(of(PROFILE));
      let page = create();
      page.ngOnInit();
      expect(page.hours()!.length).toBe(7);
      expect(page.openNow()).not.toBeNull();

      TestBed.resetTestingModule();
      agencies.getBySlug.and.returnValue(of(AGENCY));
      page = create();
      page.ngOnInit();
      expect(page.hours()).toBeNull();
      expect(page.openNow()).toBeNull();
      expect(page.whatsApp()).toBeNull();
    });
  });

  describe('office statistics events', () => {
    afterEach(() => history.replaceState(null, ''));

    it('records one profile view, from the source the navigation carried', () => {
      history.replaceState({ officeVisitSource: 'Qr' }, '');
      const page = create();
      page.ngOnInit();
      expect(agencies.recordEvent).toHaveBeenCalledOnceWith('agency-1', { type: 'ProfileView', source: 'Qr' });
    });

    it('counts an unknown or missing source as a direct visit', () => {
      history.replaceState({ officeVisitSource: 'Evil' }, '');
      const page = create();
      page.ngOnInit();
      expect(agencies.recordEvent).toHaveBeenCalledOnceWith('agency-1', { type: 'ProfileView', source: 'Direct' });
    });

    it('a failed event never breaks the page', () => {
      agencies.recordEvent.and.returnValue(throwError(() => new Error('down')));
      const page = create();
      page.ngOnInit();
      expect(page.agency()?.id).toBe('agency-1');
      page.track({ type: 'ContactClick', channel: 'Phone' });
      expect(agencies.recordEvent).toHaveBeenCalledWith('agency-1', { type: 'ContactClick', channel: 'Phone' });
    });

    it('copies the clean office link when there is no share sheet, and counts it', async () => {
      const page = create();
      page.ngOnInit();
      const nav = navigator as Navigator & { share?: unknown };
      const originalShare = nav.share;
      const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
      // Some CI browsers expose no clipboard at all (insecure origin), so provide one explicitly.
      const write = jasmine.createSpy('writeText').and.resolveTo();
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true });
      try {
        await page.share(AGENCY);
      } finally {
        Object.defineProperty(navigator, 'share', { value: originalShare, configurable: true });
        restoreClipboard(originalClipboard);
      }
      expect(write.calls.mostRecent().args[0]).toMatch(/\/offices\/xyz$/);
      expect(agencies.recordEvent).toHaveBeenCalledWith('agency-1', { type: 'Share', channel: 'CopyLink' });
      expect(toast.success).toHaveBeenCalled();
    });

    it('neither claims a copy nor counts a share when the browser has no clipboard', async () => {
      const page = create();
      page.ngOnInit();
      agencies.recordEvent.calls.reset();
      const nav = navigator as Navigator & { share?: unknown };
      const originalShare = nav.share;
      const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
      Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
      try {
        await page.share(AGENCY);
      } finally {
        Object.defineProperty(navigator, 'share', { value: originalShare, configurable: true });
        restoreClipboard(originalClipboard);
      }
      expect(agencies.recordEvent).not.toHaveBeenCalledWith('agency-1', jasmine.objectContaining({ type: 'Share' }));
      expect(toast.success).not.toHaveBeenCalled();
    });
  });
});

/** Puts navigator.clipboard back as it was: an own property if the test found one, else the prototype getter. */
function restoreClipboard(original: PropertyDescriptor | undefined): void {
  if (original) Object.defineProperty(navigator, 'clipboard', original);
  else delete (navigator as unknown as Record<string, unknown>)['clipboard'];
}
