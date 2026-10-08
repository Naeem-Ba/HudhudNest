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
import { of, throwError } from 'rxjs';

import { AgencyPublicPage } from './agency-public.page';
import { AgenciesApiService } from '../../core/api/agencies-api.service';
import { PropertyApiService } from '../../core/api/property-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/services/toast.service';
import { Agency, AgencyRatingEligibilityDto, AgencyRatingSummaryDto } from '../../core/models/agency.model';

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
        { provide: TranslateService, useValue: { instant: (k: string) => k } }
      ]
    });
    return TestBed.inject(AgencyPublicPage);
  }

  beforeEach(() => {
    agencies = jasmine.createSpyObj<AgenciesApiService>('AgenciesApiService', ['getBySlug', 'getRatings', 'getRatingEligibility', 'submitRating']);
    properties = jasmine.createSpyObj<PropertyApiService>('PropertyApiService', ['getPropertiesPaged']);
    toast = jasmine.createSpyObj<ToastService>('ToastService', ['success', 'error']);

    agencies.getBySlug.and.returnValue(of(AGENCY));
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
});
