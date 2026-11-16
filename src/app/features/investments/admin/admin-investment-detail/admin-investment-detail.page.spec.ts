import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';

import { AdminInvestmentDetailPage } from './admin-investment-detail.page';
import { AdminInvestmentApiService } from '../../../../core/api/admin-investment-api.service';
import { AdminInvestmentInterest, InvestmentProjectReview, InvestmentProjectStatus } from '../../../../core/models/investment.model';
import { ToastService } from '../../../../shared/services/toast.service';

function review(status: InvestmentProjectStatus, raisedAmount = 0): InvestmentProjectReview {
  return {
    project: {
      id: 'p1', title: 'Project', shortDescription: null, description: 'desc', projectType: 'Residential', status,
      targetAmount: 100000, raisedAmount, minimumInvestment: 1000, maximumInvestment: null, currency: 'USD',
      investmentTermMonths: 12, expectedReturnMin: 5, expectedReturnMax: 10, startDate: null, endDate: null
    },
    rejectionReason: null, financials: null, risk: null, publicDocumentCount: 0,
    readiness: { hasTitleAndDescription: true, hasFinancials: false, hasRiskAssessment: false, hasRequiredDocuments: false, isReady: false }
  } as unknown as InvestmentProjectReview;
}

const interest: AdminInvestmentInterest = {
  id: 'i1', userId: 'u1', userName: 'Sami', email: 'sami@example.com', phoneNumber: '+49123',
  status: 'Active', createdAt: '2026-10-29T10:00:00Z', updatedAt: '2026-10-29T10:00:00Z'
};

describe('AdminInvestmentDetailPage (QA phase 10)', () => {
  let api: jasmine.SpyObj<AdminInvestmentApiService>;
  let toast: jasmine.SpyObj<ToastService>;

  function create(status: InvestmentProjectStatus, raised = 0, interests: AdminInvestmentInterest[] = []) {
    api.getProjectReview.and.returnValue(of(review(status, raised)));
    api.getAllDocuments.and.returnValue(of([]));
    api.getInterests.and.returnValue(of(interests));
    TestBed.configureTestingModule({
      imports: [AdminInvestmentDetailPage, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AdminInvestmentApiService, useValue: api },
        { provide: ToastService, useValue: toast },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'p1' } } } }
      ]
    });
    const fixture = TestBed.createComponent(AdminInvestmentDetailPage);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    api = jasmine.createSpyObj('AdminInvestmentApiService', [
      'getProjectReview', 'getAllDocuments', 'getInterests', 'resume', 'updateProgress', 'schedule', 'suspend'
    ]);
    toast = jasmine.createSpyObj('ToastService', ['success', 'error', 'show']);
  });

  it('offers Resume (and Close) for a suspended project, so it is no longer a dead end', () => {
    const page = create('Suspended').componentInstance;
    expect(page.availableActions()).toEqual(['resume', 'close']);
  });

  it('does not offer Resume for a published project', () => {
    expect(create('Published').componentInstance.availableActions()).toEqual(['suspend', 'close']);
  });

  it('confirming Resume calls the API and reloads', () => {
    api.resume.and.returnValue(of(undefined));
    const page = create('Suspended').componentInstance;

    page.requestAction('resume');
    page.confirmAction();

    expect(api.resume).toHaveBeenCalledOnceWith('p1');
    expect(api.getProjectReview).toHaveBeenCalledTimes(2);
  });

  it('sends the scheduled time as a UTC instant, not as a zone-less local string', () => {
    api.schedule.and.returnValue(of(undefined));
    const page = create('Approved').componentInstance;

    page.requestAction('schedule');
    page.scheduledPublishAt = '2026-11-02T10:30';
    page.confirmAction();

    const sent = api.schedule.calls.mostRecent().args[1] as string;
    expect(sent).toBe(new Date('2026-11-02T10:30').toISOString());
    expect(sent.endsWith('Z')).toBeTrue();
  });

  it('schedules without a date as null', () => {
    api.schedule.and.returnValue(of(undefined));
    const page = create('Approved').componentInstance;

    page.requestAction('schedule');
    page.confirmAction();

    expect(api.schedule).toHaveBeenCalledOnceWith('p1', null);
  });

  it('shows the progress section only from Approved to Suspended', () => {
    for (const status of ['Approved', 'Scheduled', 'Published', 'Suspended'] as InvestmentProjectStatus[]) {
      TestBed.resetTestingModule();
      expect(create(status).componentInstance.canEditProgress()).withContext(status).toBeTrue();
    }
    for (const status of ['Draft', 'UnderReview', 'Rejected', 'Closed'] as InvestmentProjectStatus[]) {
      TestBed.resetTestingModule();
      expect(create(status).componentInstance.canEditProgress()).withContext(status).toBeFalse();
    }
  });

  it('saves the raised amount through the progress endpoint and starts from the current value', () => {
    api.updateProgress.and.returnValue(of(undefined));
    const page = create('Published', 40000).componentInstance;
    expect(page.progressRaisedAmount).toBe(40000);

    page.progressRaisedAmount = 55000;
    page.saveProgress();

    expect(api.updateProgress).toHaveBeenCalledOnceWith('p1', 55000);
    expect(toast.success).toHaveBeenCalled();
  });

  it('shows the API sentence when the progress is refused', () => {
    api.updateProgress.and.returnValue(throwError(() => new HttpErrorResponse({
      status: 400, error: { message: 'المبلغ المجمّع لا يمكن أن يتجاوز المبلغ المستهدف.' }
    })));
    const page = create('Published').componentInstance;
    // The sentence is Arabic, shown as written only on an Arabic page (QA phase 25, P16-D04 stopgap). Set after create():
    // building the page initialises the language service, which writes <html lang>.
    document.documentElement.lang = 'ar';

    page.progressRaisedAmount = 999999;
    page.saveProgress();

    expect(toast.error).toHaveBeenCalledWith('المبلغ المجمّع لا يمكن أن يتجاوز المبلغ المستهدف.');
  });

  it('does not send a negative progress', () => {
    const page = create('Published').componentInstance;
    page.progressRaisedAmount = -5;
    page.saveProgress();
    expect(api.updateProgress).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  it('lists the people who expressed interest, with their contact details', () => {
    const fixture = create('Published', 0, [interest]);
    const el = fixture.nativeElement as HTMLElement;
    expect(fixture.componentInstance.interests().length).toBe(1);
    expect(el.textContent).toContain('Sami');
    expect(el.textContent).toContain('sami@example.com');
    expect(el.textContent).toContain('+49123');
  });

  it('says so when nobody has expressed interest, and when the list cannot be loaded', () => {
    expect(create('Published').componentInstance.interests()).toEqual([]);

    TestBed.resetTestingModule();
    api.getInterests.and.returnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
    api.getProjectReview.and.returnValue(of(review('Published')));
    api.getAllDocuments.and.returnValue(of([]));
    TestBed.configureTestingModule({
      imports: [AdminInvestmentDetailPage, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AdminInvestmentApiService, useValue: api },
        { provide: ToastService, useValue: toast },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'p1' } } } }
      ]
    });
    const page = TestBed.createComponent(AdminInvestmentDetailPage);
    page.detectChanges();
    expect(page.componentInstance.interestsError()).toBeTrue();
  });
});
