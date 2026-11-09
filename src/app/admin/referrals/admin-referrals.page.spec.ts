import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { AdminReferral, AdminReferralApiService } from '../../core/api/referral-api.service';
import { ToastService } from '../../shared/services/toast.service';
import { AdminReferralsPage } from './admin-referrals.page';

const row = (over: Partial<AdminReferral> = {}): AdminReferral => ({
  id: 'r1', referrerUserId: 'u1', referrerName: 'A B', referredUserId: 'u2', referredName: 'C D', code: 'ABCD2345',
  status: 'Qualified', reason: null, createdAt: '2026-11-01T10:00:00Z', decidedAt: null, rewardedAt: null, ...over
});

describe('AdminReferralsPage (growth engine P5)', () => {
  let api: jasmine.SpyObj<AdminReferralApiService>;

  beforeEach(() => {
    api = jasmine.createSpyObj<AdminReferralApiService>('AdminReferralApiService', ['list', 'reject', 'markRewarded']);
    api.list.and.returnValue(of({ items: [row()], total: 1 }));
    api.markRewarded.and.returnValue(of(void 0));
    api.reject.and.returnValue(of(void 0));
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [provideRouter([]), { provide: AdminReferralApiService, useValue: api },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'error']) }]
    });
  });

  it('lists qualified referrals first and records a reward after confirmation', () => {
    spyOn(window, 'confirm').and.returnValue(true);
    const fixture = TestBed.createComponent(AdminReferralsPage);
    fixture.detectChanges();
    expect(api.list).toHaveBeenCalledWith('Qualified', 1);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="admin-ref-row"]').length).toBe(1);

    fixture.componentInstance.markRewarded(row());
    expect(api.markRewarded).toHaveBeenCalledWith('r1');
  });

  it('does not reject without a reason', () => {
    spyOn(window, 'prompt').and.returnValue('  ');
    const fixture = TestBed.createComponent(AdminReferralsPage);
    fixture.detectChanges();
    fixture.componentInstance.reject(row());
    expect(api.reject).not.toHaveBeenCalled();
  });
});
