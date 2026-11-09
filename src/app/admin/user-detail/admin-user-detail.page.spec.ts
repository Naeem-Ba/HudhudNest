import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';

import { AdminUserDetailPage } from './admin-user-detail.page';
import { AdminUserDetailDto, AdminUsersService } from '../../core/api/admin-users.service';
import { PlansApiService } from '../../core/api/plans-api.service';
import { ToastService } from '../../shared/services/toast.service';

function user(status: 'Active' | 'Disabled'): AdminUserDetailDto {
  return {
    id: 'u1', email: 'a@b.c', phoneNumber: null, firstName: 'A', lastName: 'B', displayName: null,
    createdAt: '2026-01-01T00:00:00Z', roles: ['User'], accountStatus: status, planTier: null, planStatus: 'NoPlan',
    planExpiresAt: null, totalListings: 2, activeListings: 0, featuredListings: 0,
    planNameKey: null, planStartedAt: null, planCancelledAt: null, planActivationSource: null, listingLimit: null
  };
}

describe('AdminUserDetailPage account status', () => {
  let users: jasmine.SpyObj<AdminUsersService>;
  let toast: jasmine.SpyObj<ToastService>;

  function create(status: 'Active' | 'Disabled') {
    users.getUserDetail.and.returnValue(of(user(status)));
    users.getRoles.and.returnValue(of(['User', 'Admin']));
    TestBed.configureTestingModule({
      imports: [AdminUserDetailPage, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AdminUsersService, useValue: users },
        { provide: PlansApiService, useValue: { getPlans: () => of([]) } },
        { provide: ToastService, useValue: toast },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'u1' } } } }
      ]
    });
    const fixture = TestBed.createComponent(AdminUserDetailPage);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    users = jasmine.createSpyObj('AdminUsersService', ['getUserDetail', 'getRoles', 'disableUser', 'enableUser', 'removeRole', 'assignRole']);
    toast = jasmine.createSpyObj('ToastService', ['success', 'error']);
  });

  it('offers disable on an active account and enable on a disabled one, never both', () => {
    const active = create('Active').nativeElement as HTMLElement;
    expect(active.textContent).toContain('ADMIN_USER_DETAIL.DISABLE_ACCOUNT');
    expect(active.textContent).not.toContain('ADMIN_USER_DETAIL.ENABLE_ACCOUNT');

    TestBed.resetTestingModule();
    const disabled = create('Disabled').nativeElement as HTMLElement;
    expect(disabled.textContent).toContain('ADMIN_USER_DETAIL.ENABLE_ACCOUNT');
    expect(disabled.textContent).not.toContain('ADMIN_USER_DETAIL.DISABLE_ACCOUNT');
  });

  it('disabling calls the API and reloads the user', () => {
    users.disableUser.and.returnValue(of(undefined));
    const page = create('Active').componentInstance;
    page.openDisableModal();
    page.submitDisable();

    expect(users.disableUser).toHaveBeenCalledOnceWith('u1');
    expect(users.getUserDetail).toHaveBeenCalledTimes(2);
    expect(page.activeModal()).toBeNull();
  });

  it('re-enabling needs a reason and sends it trimmed', () => {
    users.enableUser.and.returnValue(of({ message: 'ok' }));
    const page = create('Disabled').componentInstance;
    page.openEnableModal();
    page.enableReason = '   ';
    page.submitEnable();
    expect(users.enableUser).not.toHaveBeenCalled();

    page.enableReason = ' identity verified ';
    page.submitEnable();
    expect(users.enableUser).toHaveBeenCalledOnceWith('u1', 'identity verified');
  });

  it('shows the dedicated messages for the 409 refusals', () => {
    users.disableUser.and.returnValue(throwError(() => ({ status: 409 })));
    users.enableUser.and.returnValue(throwError(() => ({ status: 409 })));
    users.removeRole.and.returnValue(throwError(() => ({ status: 409 })));
    const page = create('Active').componentInstance;

    page.submitDisable();
    expect(toast.error).toHaveBeenCalledWith('ADMIN_USER_DETAIL.DISABLE_LAST_ADMIN');
    page.enableReason = 'x';
    page.submitEnable();
    expect(toast.error).toHaveBeenCalledWith('ADMIN_USER_DETAIL.ENABLE_NOT_POSSIBLE');
    page.removeRole('Admin');
    expect(toast.error).toHaveBeenCalledWith('ADMIN_USERS.ROLE_LAST_ADMIN');
  });
});
