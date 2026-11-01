import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';

import { AdminListingReportDetailPage } from './admin-listing-report-detail.page';
import { AdminListingReportsService } from '../../core/api/admin-listing-reports.service';
import { AdminListingReportDetailDto } from '../../core/models/listing-report.model';

function detail(overrides: Partial<AdminListingReportDetailDto> = {}): AdminListingReportDetailDto {
  return {
    summary: {
      id: 'r1', referenceNumber: 'RPT-000001', propertyId: 'p1', listingTitle: 'Flat', listingType: 'ForRent',
      listingDeleted: false, listingTakenDown: false, reason: 'Fraud', status: 'New', priority: 'High', isOverdue: false,
      reporterUserId: 'u1', reporterName: 'Sami', assignedAdminId: null, assignedAdminName: null,
      createdAt: '2026-10-29T10:00:00Z', updatedAt: '2026-10-29T10:00:00Z'
    },
    listingTitleAtReport: 'Flat', details: 'looks fake', infoRequest: null, outcome: null, resolutionNote: null,
    resolvedByName: null, resolvedAt: null, firstReviewedAt: null, reopenCount: 0, reviewDueAt: '2026-10-30T10:00:00Z',
    listing: {
      id: 'p1', currentTitle: 'Flat', listingType: 'ForRent', status: 'Active', isPublished: true, isTakenDown: false,
      takenDownReason: null, isDeleted: false, isPubliclyVisible: true, price: 100, currencyCode: 'USD', city: 'Damascus',
      publishedAt: null, expiresAt: null, ownerId: 'o1', ownerName: 'Owner'
    },
    reporter: { id: 'u1', name: 'Sami', totalReports: 1, dismissedReports: 0 },
    openReportsOnListing: 1, distinctOpenReportersOnListing: 1, relatedReports: [], timeline: [],
    ...overrides
  };
}

describe('AdminListingReportDetailPage', () => {
  let api: jasmine.SpyObj<AdminListingReportsService>;

  function create(d: AdminListingReportDetailDto) {
    api.get.and.returnValue(of(d));
    api.assignees.and.returnValue(of([]));
    TestBed.configureTestingModule({
      imports: [AdminListingReportDetailPage, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AdminListingReportsService, useValue: api },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'r1' } } } }
      ]
    });
    const fixture = TestBed.createComponent(AdminListingReportDetailPage);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    api = jasmine.createSpyObj('AdminListingReportsService',
      ['get', 'assignees', 'startReview', 'assign', 'changePriority', 'addNote', 'requestInfo', 'markActionRequired', 'close', 'reopen', 'takeDownListing', 'restoreListing']);
  });

  it('loads the report and offers close only while it is open', () => {
    const page = create(detail()).componentInstance;
    expect(page.isOpen()).toBeTrue();

    TestBed.resetTestingModule();
    const closed = detail();
    closed.summary.status = 'Resolved';
    expect(create(closed).componentInstance.isOpen()).toBeFalse();
  });

  it('shows the multi-reporter signal only when several people reported', () => {
    expect(create(detail()).nativeElement.querySelector('[data-testid="multi-reporter-signal"]')).toBeNull();

    TestBed.resetTestingModule();
    const el = create(detail({ distinctOpenReportersOnListing: 3, openReportsOnListing: 3 })).nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="multi-reporter-signal"]')).not.toBeNull();
  });

  it('closing sends the outcome and the note, and refreshes from the server answer', () => {
    const closed = detail();
    closed.summary.status = 'Dismissed';
    closed.outcome = 'NoViolation';
    api.close.and.returnValue(of(closed));
    const page = create(detail()).componentInstance;

    page.open('close');
    page.outcome = 'NoViolation';
    page.text = ' checked ';
    page.submit();

    expect(api.close).toHaveBeenCalledOnceWith('r1', 'NoViolation', 'checked');
    expect(page.isOpen()).toBeFalse();
    expect(page.mode()).toBeNull();
  });

  it('does not close without a decision and a note, and never touches the listing', () => {
    const page = create(detail()).componentInstance;
    page.open('close');
    page.outcome = '';
    page.text = 'x';
    page.submit();
    page.outcome = 'NoViolation';
    page.text = '  ';
    page.submit();

    expect(api.close).not.toHaveBeenCalled();
    expect(api.takeDownListing).not.toHaveBeenCalled();
  });

  it('take-down needs a reason', () => {
    api.takeDownListing.and.returnValue(of(detail()));
    const page = create(detail()).componentInstance;
    page.open('takedown');
    page.text = '   ';
    page.submit();
    expect(api.takeDownListing).not.toHaveBeenCalled();

    page.text = 'fake photos';
    page.submit();
    expect(api.takeDownListing).toHaveBeenCalledOnceWith('r1', 'fake photos');
  });

  it('shows the reporter\'s latest reply to the admin\'s question, not only the timeline', () => {
    const ev = (id: string, type: 'InfoRequested' | 'ReporterResponded', note: string) =>
      ({ id, type, actorUserId: null, actorName: null, fromValue: null, toValue: null, note, isInternal: false, createdAt: '2026-10-29T12:00:00Z' });
    expect((create(detail()).nativeElement as HTMLElement).querySelector('[data-testid="reporter-reply"]')).toBeNull();

    TestBed.resetTestingModule();
    const d = detail({ timeline: [ev('e1', 'InfoRequested', 'Which floor?'), ev('e2', 'ReporterResponded', 'first answer'), ev('e3', 'ReporterResponded', 'second floor, photos are old')] });
    const fixture = create(d);
    const el = fixture.nativeElement as HTMLElement;
    expect(fixture.componentInstance.latestReply(d)?.id).toBe('e3');
    expect(el.querySelector('[data-testid="reporter-reply"]')?.textContent).toContain('second floor, photos are old');
  });
});
