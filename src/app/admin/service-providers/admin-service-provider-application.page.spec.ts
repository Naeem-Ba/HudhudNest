import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';

import { AdminServiceProviderApplicationPage } from './admin-service-provider-application.page';
import { AdminServiceProvidersService } from '../../core/api/admin-service-providers.service';
import { GovernorateDirectory } from '../../core/api/governorate-directory.service';
import { AdminApplicationDetailDto } from '../../core/models/provider-onboarding.model';

function detail(overrides: Partial<AdminApplicationDetailDto> = {}): AdminApplicationDetailDto {
  return {
    summary: {
      id: 'a1', referenceNumber: 'SPA-000001', applicantUserId: 'u1', applicantType: 'Individual',
      displayName: 'Cleaner Co', contactName: 'Sami', contactEmail: 's@example.com', contactPhone: null,
      requestedCategories: ['Cleaning', 'Moving'], requestedGovernorateIds: [1, 2], status: 'Pending',
      createdAt: '2026-10-14T10:00:00Z', updatedAt: '2026-10-14T10:00:00Z'
    },
    experience: '5 years', termsAcceptedAt: '2026-10-14T10:00:00Z', applicantAccountName: 'Sami',
    applicantAccountActive: true, timeline: [], ...overrides
  };
}

describe('AdminServiceProviderApplicationPage', () => {
  let api: jasmine.SpyObj<AdminServiceProvidersService>;

  function create(d: AdminApplicationDetailDto) {
    api.getApplication.and.returnValue(of(d));
    TestBed.configureTestingModule({
      imports: [AdminServiceProviderApplicationPage, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AdminServiceProvidersService, useValue: api },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'a1' } } } },
        { provide: GovernorateDirectory, useValue: { ensureLoaded: () => undefined, name: (id: number) => `G${id}`, names: (ids: number[]) => ids.join(',') } }
      ]
    });
    const fixture = TestBed.createComponent(AdminServiceProviderApplicationPage);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    api = jasmine.createSpyObj('AdminServiceProvidersService', ['getApplication', 'approve', 'reject', 'requestInfo', 'addNote']);
  });

  it('starts approval from exactly what was requested and only the requested options are offered', () => {
    const page = create(detail()).componentInstance;

    expect(page.approveCategories()).toEqual(['Cleaning', 'Moving']);
    expect(page.approveGovernorates()).toEqual([1, 2]);
    expect(page.categoryOptions().map(o => o.value)).toEqual(['Cleaning', 'Moving']);
  });

  it('does not allow approving a deleted account, an empty scope, or a closed application', () => {
    expect(create(detail({ applicantAccountActive: false })).componentInstance.canApprove()).toBeFalse();

    TestBed.resetTestingModule();
    const closed = detail();
    closed.summary.status = 'Rejected';
    expect(create(closed).componentInstance.canApprove()).toBeFalse();

    TestBed.resetTestingModule();
    const page = create(detail()).componentInstance;
    page.approveCategories.set([]);
    expect(page.approveValid()).toBeFalse();
  });

  it('sends the narrowed scope and refreshes from the server answer', () => {
    const approved = detail();
    approved.summary.status = 'Approved';
    api.approve.and.returnValue(of(approved));
    const fixture = create(detail());
    const page = fixture.componentInstance;

    page.approveCategories.set(['Cleaning']);
    page.approveGovernorates.set([2]);
    page.mode.set('approve');
    page.confirmAction();

    expect(api.approve).toHaveBeenCalledOnceWith('a1', jasmine.objectContaining({
      approvedCategories: ['Cleaning'], approvedGovernorateIds: [2]
    }));
    expect(page.summary()?.status).toBe('Approved');
    expect(page.isOpen()).toBeFalse();
  });

  it('rejects only with a reason', () => {
    const page = create(detail()).componentInstance;
    page.mode.set('reject');
    page.rejectReason = '   ';

    page.confirmAction();

    expect(api.reject).not.toHaveBeenCalled();
  });
});
