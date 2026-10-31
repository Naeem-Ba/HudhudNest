import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';

import { AdminListingReportsPage } from './admin-listing-reports.page';
import { AdminListingReportsService } from '../../core/api/admin-listing-reports.service';

describe('AdminListingReportsPage', () => {
  let api: jasmine.SpyObj<AdminListingReportsService>;

  function create(query: Record<string, string> = {}, items: any[] = []) {
    api.search.and.returnValue(of({ items, total: 45, page: 1, pageSize: 20 }));
    api.stats.and.returnValue(of({
      total: 0, new: 0, underReview: 0, waitingForInformation: 0, actionRequired: 0, open: 0, resolved: 0,
      dismissed: 0, highPriorityOpen: 0, overdue: 0, averageResolutionHours: null, resolvedSampleSize: 0
    }));
    api.assignees.and.returnValue(of([]));
    TestBed.configureTestingModule({
      imports: [AdminListingReportsPage, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AdminListingReportsService, useValue: api },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: (k: string) => query[k] ?? null } } } }
      ]
    });
    const fixture = TestBed.createComponent(AdminListingReportsPage);
    fixture.detectChanges();
    return Object.assign(fixture.componentInstance, { fixture });
  }

  beforeEach(() => { api = jasmine.createSpyObj('AdminListingReportsService', ['search', 'stats', 'assignees']); });

  it('starts on the open queue, sorted by priority, 20 per page', () => {
    const page = create();
    expect(api.search.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({ open: true, sort: 'Priority', page: 1, pageSize: 20 }));
    expect(page.totalPages()).toBe(3);
  });

  it('the overdue card filters open reports that are overdue; a status card replaces "open"', () => {
    const page = create();
    page.setQuick('overdue');
    expect(api.search.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({ open: true, overdue: true }));

    page.setQuick('Resolved');
    expect(api.search.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({ open: false, overdue: false, status: 'Resolved' }));
  });

  it('a listing link shows all its reports, closed ones included', () => {
    create({ propertyId: 'p1' });
    expect(api.search.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({ propertyId: 'p1', open: false }));
  });

  it('changing a filter returns to page 1', () => {
    const page = create();
    page.goTo(2);
    page.reason = 'Fraud';
    page.applyFilters();
    expect(api.search.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({ reason: 'Fraud', page: 1 }));
  });

  it('shows an excerpt of what the reporter wrote on the row, so the admin does not open every report', () => {
    const row = {
      id: 'r1', referenceNumber: 'RPT-000001', propertyId: 'p1', listingTitle: 'Flat', listingType: 'ForRent', listingDeleted: false,
      listingTakenDown: false, reason: 'Fraud', status: 'New', priority: 'High', isOverdue: false, reporterUserId: 'u1',
      reporterName: 'Sami', assignedAdminId: null, assignedAdminName: null, createdAt: '2026-10-29T10:00:00Z',
      updatedAt: '2026-10-29T10:00:00Z', detailsPreview: 'the photos belong to another listing'
    };
    const page = create({}, [row]);
    page.fixture.detectChanges();
    expect((page.fixture.nativeElement as HTMLElement).querySelector('[data-testid="report-preview"]')?.textContent)
      .toContain('the photos belong to another listing');
  });
});
