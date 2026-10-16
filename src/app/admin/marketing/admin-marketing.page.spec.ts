import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { Subject, of, throwError } from 'rxjs';

import { AdminMarketingPage } from './admin-marketing.page';
import { AdminMarketingService, AdminOfferDto } from '../../core/api/admin-marketing.service';
import { ToastService } from '../../shared/services/toast.service';

function offer(over: Partial<AdminOfferDto> = {}): AdminOfferDto {
  return {
    id: 'o-1', name: 'عرض تجريبي', description: null, discountType: 'Percentage', discountValue: 20,
    targetPlanTier: null, startsAtUtc: '2026-10-01T00:00:00Z', endsAtUtc: null, maxRedemptions: null,
    redeemedCount: 0, status: 'Draft', terms: null, createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z', isPubliclyVisible: false, ...over,
  };
}

describe('AdminMarketingPage — offer activation', () => {
  let api: jasmine.SpyObj<AdminMarketingService>;
  let toast: ToastService;

  function create(initial: AdminOfferDto[]) {
    api.getOffers.and.returnValue(of(initial));
    TestBed.configureTestingModule({
      imports: [AdminMarketingPage, TranslateModule.forRoot()],
      providers: [{ provide: AdminMarketingService, useValue: api }],
    });
    toast = TestBed.inject(ToastService);
    const fixture = TestBed.createComponent(AdminMarketingPage);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    api = jasmine.createSpyObj('AdminMarketingService', [
      'getOffers', 'createOffer', 'updateOffer', 'setOfferStatus',
      'getLeads', 'getSurveyResponses', 'getSurveyStats', 'getMarketingEventsSummary',
    ]);
  });

  it('shows the state the SERVER confirmed after activation, with an honest success message', () => {
    const fixture = create([offer()]);
    const page = fixture.componentInstance;
    api.setOfferStatus.and.returnValue(of(offer({ status: 'Active', isPubliclyVisible: true })));

    page.changeOfferStatus(page.offers()[0], 'Active');

    expect(api.setOfferStatus).toHaveBeenCalledOnceWith('o-1', 'Active');
    expect(page.offers()[0].status).toBe('Active');
    expect(page.offers()[0].isPubliclyVisible).toBeTrue();
    expect(toast.toasts().map(t => t.message)).toEqual(['تم تفعيل العرض وهو ظاهر الآن للزوار.']);
    expect(page.settingStatusId()).toBeNull();
  });

  it('does not claim visitors can see an active offer that has not started yet', () => {
    const fixture = create([offer()]);
    const page = fixture.componentInstance;
    api.setOfferStatus.and.returnValue(of(offer({ status: 'Active', isPubliclyVisible: false })));

    page.changeOfferStatus(page.offers()[0], 'Active');

    expect(toast.toasts()[0].message).toContain('لن يظهر للزوار');
  });

  it('on failure: no optimistic state, no duplicate page toast, list re-read, button released', () => {
    const fixture = create([offer()]);
    const page = fixture.componentInstance;
    api.setOfferStatus.and.returnValue(throwError(() => new Error('415')));
    api.getOffers.calls.reset();

    page.changeOfferStatus(page.offers()[0], 'Active');

    expect(page.offers()[0].status).toBe('Draft');
    expect(toast.toasts()).toEqual([]); // the interceptor owns the error toast
    expect(api.getOffers).toHaveBeenCalledTimes(1);
    expect(page.settingStatusId()).toBeNull();
  });

  it('ignores a second click while the first request is still in flight', () => {
    const fixture = create([offer()]);
    const page = fixture.componentInstance;
    const pending = new Subject<AdminOfferDto>();
    api.setOfferStatus.and.returnValue(pending);

    page.changeOfferStatus(page.offers()[0], 'Active');
    page.changeOfferStatus(page.offers()[0], 'Active');

    expect(api.setOfferStatus).toHaveBeenCalledTimes(1);
    pending.next(offer({ status: 'Active', isPubliclyVisible: true }));
    pending.complete();
    expect(page.settingStatusId()).toBeNull();
  });

  it('asks for confirmation before ending an offer and sends nothing when declined', () => {
    const fixture = create([offer({ status: 'Active', isPubliclyVisible: true })]);
    const page = fixture.componentInstance;
    spyOn(window, 'confirm').and.returnValue(false);

    page.changeOfferStatus(page.offers()[0], 'Ended');

    expect(api.setOfferStatus).not.toHaveBeenCalled();
  });

  it('offers "مشاركة" only for an offer visitors can actually see', () => {
    const fixture = create([
      offer({ id: 'draft' }),
      offer({ id: 'live', status: 'Active', isPubliclyVisible: true }),
      offer({ id: 'future', status: 'Active', isPubliclyVisible: false }),
    ]);

    const shareButtons = Array.from<HTMLButtonElement>(fixture.nativeElement.querySelectorAll('.offer-tile__actions button'))
      .filter(b => b.textContent?.trim() === 'مشاركة');

    expect(shareButtons.length).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('نشط لكنه غير ظاهر للزوار الآن');
    expect(fixture.nativeElement.textContent).toContain('ظاهر للزوار الآن في صفحة الهبوط');
  });
});
