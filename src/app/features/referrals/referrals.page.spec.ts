import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { MyReferrals, ReferralApiService } from '../../core/api/referral-api.service';
import { ToastService } from '../../shared/services/toast.service';
import { ReferralsPage } from './referrals.page';

const data = (over: Partial<MyReferrals> = {}): MyReferrals => ({
  code: 'ABCD2345', pending: 1, qualified: 1, rejected: 0, expired: 1, qualifyingListingDays: 7,
  requireConfirmedPhone: true, rewardAr: null, rewardEn: null, rewardDe: null,
  items: [{ joinedAt: '2026-11-01T10:00:00Z', status: 'Qualified', reason: null, rewarded: true }], ...over
});

describe('ReferralsPage (growth engine P5)', () => {
  let api: jasmine.SpyObj<ReferralApiService>;

  beforeEach(() => {
    api = jasmine.createSpyObj<ReferralApiService>('ReferralApiService', ['getMine']);
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        { provide: ReferralApiService, useValue: api },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'error']) }
      ]
    });
  });

  it('shows the code, an invite link with it, and the statuses', () => {
    api.getMine.and.returnValue(of(data()));
    const fixture = TestBed.createComponent(ReferralsPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="ref-code"]')?.textContent).toContain('ABCD2345');
    expect(fixture.componentInstance.link()).toContain('/auth/register?ref=ABCD2345');
    expect(el.querySelectorAll('[data-testid="ref-item"]').length).toBe(1);
    expect(el.querySelector('[data-testid="ref-reward"]')?.textContent).toContain('REFERRALS.NO_REWARD');
  });

  it('shows the configured reward text', () => {
    api.getMine.and.returnValue(of(data({ rewardAr: 'شهر مجاني', rewardEn: 'One free month', rewardDe: 'Ein Gratismonat' })));
    const fixture = TestBed.createComponent(ReferralsPage);
    fixture.detectChanges();
    expect(fixture.componentInstance.reward()).toBeTruthy();
  });

  it('shows an error when loading fails', () => {
    api.getMine.and.returnValue(throwError(() => new Error('x')));
    const fixture = TestBed.createComponent(ReferralsPage);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).not.toBeNull();
  });
});
