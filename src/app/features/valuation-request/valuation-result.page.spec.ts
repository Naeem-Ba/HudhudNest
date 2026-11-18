// The customer's own request page (/valuation/:id): each office answer with its public name, its price in its own
// currency, how many offices answered out of those asked, and a clear message when the request is not theirs.
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';

import { ValuationResultPage } from './valuation-result.page';
import { ValuationApiService } from '../../core/api/valuation-api.service';
import { ValuationInquiryStatusDto } from '../../core/models/valuation.model';
import { PageMetaService } from '../../core/services/page-meta.service';

describe('ValuationResultPage', () => {
  let api: jasmine.SpyObj<ValuationApiService>;

  function create(id: string | null): ComponentFixture<ValuationResultPage> {
    api = jasmine.createSpyObj('ValuationApiService', ['getStatus']);
    TestBed.configureTestingModule({
      imports: [ValuationResultPage, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: ValuationApiService, useValue: api },
        { provide: PageMetaService, useValue: { noindex: jasmine.createSpy('noindex') } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap(id ? { id } : {}) } } }
      ]
    });
    return TestBed.createComponent(ValuationResultPage);
  }

  const awaiting: ValuationInquiryStatusDto = {
    inquiryId: 'inq-1',
    status: 'AwaitingOfficeResponses',
    expiresAt: '2026-03-02T12:00:00Z',
    invitedOfficeCount: 3,
    estimates: [
      { invitationId: 'i1', agencyName: 'مكتب البيت', estimatedPrice: 95000, currencyCode: 'USD', notes: 'الطابق مهم',
        submittedAt: '2026-03-01T15:00:00Z', matchLevel: 'District' },
      { invitationId: 'i2', agencyName: 'Old answer', estimatedPrice: 90000, currencyCode: null, notes: null,
        submittedAt: '2026-03-01T16:00:00Z', matchLevel: 'Governorate' }
    ]
  };

  it('shows every office answer with its name and price, and a refresh while the request is open', () => {
    const fixture = create('inq-1');
    api.getStatus.and.returnValue(of(awaiting));
    fixture.detectChanges();

    expect(api.getStatus).toHaveBeenCalledWith('inq-1');
    const el = fixture.nativeElement as HTMLElement;
    const answers = el.querySelectorAll('[data-testid="valuation-office-answer"]');
    expect(answers.length).toBe(2);
    expect(answers[0].textContent).toContain('مكتب البيت');
    expect(answers[0].textContent).toContain('الطابق مهم');
    expect(el.querySelector('.valuation-refresh')).not.toBeNull();
  });

  it('names the currency of each price, and never guesses one for an answer recorded without it', () => {
    const fixture = create('inq-1');
    const page = fixture.componentInstance;
    expect(page.price(95000, 'USD')).toContain('$');
    expect(page.price(90000, null)).not.toContain('$');
  });

  it('a closed request without answers says so and offers no refresh', () => {
    const fixture = create('inq-1');
    api.getStatus.and.returnValue(of({ ...awaiting, status: 'Expired', estimates: [] }));
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('VALUATION.RESULT.CLOSED_NO_ANSWERS');
    expect(el.querySelector('.valuation-refresh')).toBeNull();
  });

  it('another account\'s request (403) or an unknown one (404) reads as "not found", other errors as a load error', () => {
    const fixture = create('inq-1');
    api.getStatus.and.returnValue(throwError(() => ({ status: 403 })));
    fixture.detectChanges();
    expect(fixture.componentInstance.error()).toBe('not-found');

    api.getStatus.and.returnValue(throwError(() => ({ status: 500 })));
    fixture.componentInstance.load();
    expect(fixture.componentInstance.error()).toBe('failed');
  });

  it('without an id it never calls the API', () => {
    const fixture = create(null);
    fixture.detectChanges();
    expect(api.getStatus).not.toHaveBeenCalled();
    expect(fixture.componentInstance.error()).toBe('not-found');
  });
});
