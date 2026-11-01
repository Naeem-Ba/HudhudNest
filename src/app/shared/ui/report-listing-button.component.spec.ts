import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';

import { ReportListingButtonComponent } from './report-listing-button.component';
import { ListingReportsService } from '../../core/api/listing-reports.service';
import { AuthService } from '../../core/auth/auth.service';
import { MyListingReportDto } from '../../core/models/listing-report.model';

const created = { id: 'r1', referenceNumber: 'RPT-000001' } as MyListingReportDto;

describe('ReportListingButtonComponent', () => {
  let api: jasmine.SpyObj<ListingReportsService>;
  let auth: { getAccessToken: jasmine.Spy; getCurrentUserId: jasmine.Spy };

  function create(ownerId: string | null = 'owner') {
    TestBed.configureTestingModule({
      imports: [ReportListingButtonComponent, TranslateModule.forRoot()],
      providers: [provideRouter([]), { provide: ListingReportsService, useValue: api }, { provide: AuthService, useValue: auth }]
    });
    const fixture = TestBed.createComponent(ReportListingButtonComponent);
    fixture.componentRef.setInput('propertyId', '11111111-2222-4333-8444-555555555555');
    fixture.componentRef.setInput('ownerId', ownerId);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    api = jasmine.createSpyObj('ListingReportsService', ['reasons', 'openFor', 'submit']);
    api.reasons.and.returnValue(of([]));
    api.openFor.and.returnValue(of({ hasOpenReport: false, reportId: null, referenceNumber: null, status: null }));
    auth = { getAccessToken: jasmine.createSpy().and.returnValue('t'), getCurrentUserId: jasmine.createSpy().and.returnValue('me') };
  });

  it('is hidden on the viewer\'s own listing', () => {
    auth.getCurrentUserId.and.returnValue('owner');
    expect(create().componentInstance.visible()).toBeFalse();
  });

  it('needs a reason, and details for "Other", before anything is sent', () => {
    const c = create().componentInstance;
    c.onTrigger(new Event('click'));
    c.submit();
    expect(api.submit).not.toHaveBeenCalled();
    expect(c.showReasonError()).toBeTrue();

    c.reason.set('Other');
    c.details.set('short');
    c.submit();
    expect(api.submit).not.toHaveBeenCalled();
    expect(c.showDetailsError()).toBeTrue();
  });

  it('sends once with a stable request id and ignores a second tap while busy', () => {
    api.submit.and.returnValue(of(created));
    const c = create().componentInstance;
    c.onTrigger(new Event('click'));
    c.reason.set('Fraud');
    c.submit();

    expect(api.submit).toHaveBeenCalledTimes(1);
    expect(api.submit.calls.mostRecent().args[0].clientRequestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(c.phase()).toBe('done');
  });

  it('turns a duplicate-open conflict into its own message, and 429 into the rate message', () => {
    const c = create().componentInstance;
    c.onTrigger(new Event('click'));
    c.reason.set('Fraud');

    api.submit.and.returnValue(throwError(() => ({ status: 409, error: { code: 'REPORT_ALREADY_OPEN' } })));
    c.submit();
    expect(c.errorKey()).toBe('REPORT.ERR_ALREADY_OPEN');
    expect(c.busy()).toBeFalse();

    api.submit.and.returnValue(throwError(() => ({ status: 429 })));
    c.submit();
    expect(c.errorKey()).toBe('REPORT.ERR_RATE');
  });

  it('a signed-out visitor is sent to sign in instead of seeing the form', () => {
    auth.getAccessToken.and.returnValue(null);
    const c = create().componentInstance;
    c.onTrigger(new Event('click'));
    expect(c.sheetOpen()).toBeFalse();
  });

  it('when the team is waiting for an answer, the open-report dialog leads to the answer box', () => {
    api.openFor.and.returnValue(of({ hasOpenReport: true, reportId: 'r9', referenceNumber: 'RPT-000009', status: 'NeedsYourInfo' }));
    const fixture = create();
    const c = fixture.componentInstance;
    const router = TestBed.inject(Router);
    const nav = spyOn(router, 'navigate').and.resolveTo(true);
    c.onTrigger(new Event('click'));
    fixture.detectChanges();
    expect(c.needsReply()).toBeTrue();
    expect(fixture.nativeElement.querySelector('[data-testid="report-reply-now"]')).not.toBeNull();
    c.goReply();
    expect(nav).toHaveBeenCalledWith(['/my-reports', 'r9']);
    expect(c.sheetOpen()).toBeFalse();
  });

  it('an open report that is not waiting for an answer shows no reply button', () => {
    api.openFor.and.returnValue(of({ hasOpenReport: true, reportId: 'r9', referenceNumber: 'RPT-000009', status: 'InReview' }));
    const fixture = create();
    fixture.componentInstance.onTrigger(new Event('click'));
    fixture.detectChanges();
    expect(fixture.componentInstance.needsReply()).toBeFalse();
    expect(fixture.nativeElement.querySelector('[data-testid="report-reply-now"]')).toBeNull();
  });
});
