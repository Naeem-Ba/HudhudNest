import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';

import { AdminAgenciesPage } from './admin-agencies.page';
import { AdminAgenciesService } from '../../core/api/admin-agencies.service';
import { AdminAgencySummary } from '../../core/models/agency.model';
import { ToastService } from '../../shared/services/toast.service';

function agency(overrides: Partial<AdminAgencySummary> = {}): AdminAgencySummary {
  return {
    id: 'a1', name: 'Alpha', slug: 'alpha', isActive: true, verificationStatus: 'Pending', ownerUserId: 'u1',
    ownerName: 'Owner', memberCount: 2, activeListingCount: 4, createdAt: '2026-11-01T00:00:00Z', ...overrides
  };
}

function paged(items: AdminAgencySummary[]) {
  return { items, totalCount: items.length, page: 1, pageSize: 20, totalPages: 1, hasNext: false, hasPrevious: false };
}

describe('AdminAgenciesPage', () => {
  let api: jasmine.SpyObj<AdminAgenciesService>;
  let toast: jasmine.SpyObj<ToastService>;

  function create() {
    TestBed.configureTestingModule({
      imports: [AdminAgenciesPage, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AdminAgenciesService, useValue: api },
        { provide: ToastService, useValue: toast }
      ]
    });
    const fixture = TestBed.createComponent(AdminAgenciesPage);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    api = jasmine.createSpyObj('AdminAgenciesService', ['search', 'history', 'setVerification']);
    toast = jasmine.createSpyObj('ToastService', ['success', 'error', 'show']);
    api.search.and.returnValue(of(paged([agency()])));
    api.history.and.returnValue(of([]));
  });

  it('loads the offices on open', () => {
    const page = create().componentInstance;
    expect(api.search).toHaveBeenCalledWith(jasmine.objectContaining({ page: 1, pageSize: 20, status: '' }));
    expect(page.agencies().length).toBe(1);
  });

  it('never offers the status the office already has', () => {
    const page = create().componentInstance;
    page.open(agency({ verificationStatus: 'Verified' }));
    expect(page.targetStatuses()).not.toContain('Verified');
    expect(page.targetStatuses().length).toBe(4);
    expect(api.history).toHaveBeenCalledWith('a1');
  });

  it('requires a new status and a non-blank reason within the limit', () => {
    const page = create().componentInstance;
    page.open(agency());
    expect(page.canSubmit()).toBeFalse();
    page.newStatus = 'Verified';
    page.reason = '   ';
    expect(page.canSubmit()).toBeFalse();
    page.reason = 'x'.repeat(page.reasonMaxLength + 1);
    expect(page.canSubmit()).toBeFalse();
    page.reason = 'Licence checked';
    expect(page.canSubmit()).toBeTrue();
  });

  it('saves, closes and reloads', () => {
    api.setVerification.and.returnValue(of(agency({ verificationStatus: 'Verified' })));
    const page = create().componentInstance;
    page.open(agency());
    page.newStatus = 'Verified';
    page.reason = 'Licence checked';
    page.submit();
    expect(api.setVerification).toHaveBeenCalledWith('a1', 'Verified', 'Licence checked');
    expect(toast.success).toHaveBeenCalled();
    expect(page.modalOpen()).toBeFalse();
    expect(api.search).toHaveBeenCalledTimes(2);
  });

  it('keeps the dialog open and shows the server message when saving fails', () => {
    api.setVerification.and.returnValue(throwError(() => new HttpErrorResponse({ status: 409, error: { message: 'المكتب في هذه الحالة أصلًا.' } })));
    const page = create().componentInstance;
    page.open(agency());
    page.newStatus = 'Rejected';
    page.reason = 'No licence';
    page.submit();
    expect(toast.error).toHaveBeenCalled();
    expect(page.modalOpen()).toBeTrue();
    expect(page.saving()).toBeFalse();
  });
});
