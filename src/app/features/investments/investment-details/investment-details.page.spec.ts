import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';

import { InvestmentDetailsPage } from './investment-details.page';
import { InvestmentApiService } from '../../../core/api/investment-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { PageMetaService } from '../../../core/services/page-meta.service';
import { ToastService } from '../../../shared/services/toast.service';
import { InvestmentProjectDetails } from '../../../core/models/investment.model';

function project(maximumInvestment: number | null): InvestmentProjectDetails {
  return {
    id: 'p1', propertyId: 'pr1', title: 'Project', shortDescription: null, description: 'desc',
    projectType: 'Residential', status: 'Published', targetAmount: 100000, raisedAmount: 0,
    minimumInvestment: 1000, maximumInvestment, currency: 'USD', investmentTermMonths: 12,
    expectedReturnMin: 5, expectedReturnMax: 10, startDate: null, endDate: null
  } as unknown as InvestmentProjectDetails;
}

describe('InvestmentDetailsPage calculator (QA phase 10, D07)', () => {
  let api: jasmine.SpyObj<InvestmentApiService>;

  function create(maximumInvestment: number | null) {
    api.getProjectById.and.returnValue(of(project(maximumInvestment)));
    api.getFinancials.and.returnValue(of(null as never));
    api.getRisk.and.returnValue(of(null as never));
    api.getDocuments.and.returnValue(of([]));
    api.getUpdates.and.returnValue(of([]));
    TestBed.configureTestingModule({
      imports: [InvestmentDetailsPage, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: InvestmentApiService, useValue: api },
        { provide: AuthService, useValue: { getAccessToken: () => null } },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'error', 'show']) },
        { provide: PageMetaService, useValue: jasmine.createSpyObj('PageMetaService', ['applyDynamic', 'clear', 'markNotFound']) },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'p1' } } } }
      ]
    });
    const fixture = TestBed.createComponent(InvestmentDetailsPage);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  beforeEach(() => {
    api = jasmine.createSpyObj('InvestmentApiService', [
      'getProjectById', 'getFinancials', 'getRisk', 'getDocuments', 'getUpdates', 'calculate'
    ]);
  });

  it('does not call the API for an amount below the project minimum', () => {
    const page = create(null);
    page.calculatorAmount = 999;

    page.runCalculator();

    expect(api.calculate).not.toHaveBeenCalled();
    expect(page.calculatorError()).toBe('INVESTMENTS.CALCULATOR.BELOW_PROJECT_MIN');
  });

  it('does not call the API for an amount above the project maximum', () => {
    const page = create(50000);
    page.calculatorAmount = 50001;

    page.runCalculator();

    expect(api.calculate).not.toHaveBeenCalled();
    expect(page.calculatorError()).toBe('INVESTMENTS.CALCULATOR.ABOVE_PROJECT_MAX');
  });

  it('calls the API for an amount inside the project range', () => {
    api.calculate.and.returnValue(of({} as never));
    const page = create(50000);
    page.calculatorAmount = 50000;

    page.runCalculator();

    expect(api.calculate).toHaveBeenCalledOnceWith('p1', 50000, 12);
  });

  it('gives the error text both project limits as formatted money', () => {
    const page = create(50000);

    const params = page.calculatorErrorParams();

    expect(String(params['minAmount'])).toContain('1,000');
    expect(String(params['projectMax'])).toContain('50,000');
  });
});
