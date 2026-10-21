import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';

import { AdminPropertiesService } from '../../core/api/admin-properties.service';
import { AdminUsersService } from '../../core/api/admin-users.service';
import { AdminPropertySummary } from '../../core/models/admin-property.model';
import { ToastService } from '../../shared/services/toast.service';
import { AdminUserPropertiesPage } from './admin-user-properties.page';

function row(id: string, extra: Partial<AdminPropertySummary> = {}): AdminPropertySummary {
  return {
    id,
    title: `Listing ${id}`,
    status: 'Available',
    isPublished: true,
    publishedAt: null,
    expiresAt: null,
    isTakenDown: false,
    takenDownReason: null,
    isFeatured: false,
    featuredUntil: null,
    createdAt: '2026-10-01T00:00:00Z',
    ...extra
  };
}

describe('AdminUserPropertiesPage — take-down and restore (QA Phase 8, P8-D10)', () => {
  let fixture: ComponentFixture<AdminUserPropertiesPage>;
  let api: jasmine.SpyObj<AdminPropertiesService>;
  let toast: jasmine.SpyObj<ToastService>;

  function setup(rows: AdminPropertySummary[]): void {
    api = jasmine.createSpyObj('AdminPropertiesService', ['getUserProperties', 'takeDownListing', 'restoreListing']);
    api.getUserProperties.and.returnValue(of({
      items: rows, totalCount: rows.length, page: 1, pageSize: 20, totalPages: 1, hasNext: false, hasPrevious: false
    }));
    api.takeDownListing.and.returnValue(of({ message: 'ok' } as never));
    api.restoreListing.and.returnValue(of({ message: 'ok' } as never));
    const users = jasmine.createSpyObj('AdminUsersService', ['getUserDetail']);
    users.getUserDetail.and.returnValue(of({ id: 'u1', displayName: 'Owner' }));
    toast = jasmine.createSpyObj('ToastService', ['success', 'error', 'show']);

    TestBed.configureTestingModule({
      imports: [AdminUserPropertiesPage, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AdminPropertiesService, useValue: api },
        { provide: AdminUsersService, useValue: users },
        { provide: ToastService, useValue: toast },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'u1' } } } }
      ]
    });

    fixture = TestBed.createComponent(AdminUserPropertiesPage);
    fixture.detectChanges();
  }

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  it('offers take-down for a normal listing and restore for a taken-down one', () => {
    setup([row('a'), row('b', { isPublished: false, isTakenDown: true, takenDownReason: 'مخالف' })]);

    expect(el().querySelectorAll('[data-testid="take-down"]').length).toBe(1);
    expect(el().querySelectorAll('[data-testid="restore"]').length).toBe(1);
    expect(el().querySelector('.taken-down-reason')!.textContent).toContain('مخالف');
  });

  it('a take-down needs a reason: nothing is sent while it is blank, the trimmed reason is sent otherwise', () => {
    setup([row('a')]);
    const page = fixture.componentInstance;

    page.openTakeDownModal(page.properties()[0]);
    page.actionReason = '   ';
    page.submitTakeDown();
    expect(api.takeDownListing).not.toHaveBeenCalled();

    page.actionReason = '  صور لا تخص العقار ';
    page.submitTakeDown();
    expect(api.takeDownListing).toHaveBeenCalledOnceWith('a', 'صور لا تخص العقار');
    expect(toast.success).toHaveBeenCalled();
    expect(api.getUserProperties).toHaveBeenCalledTimes(2); // reloaded after the action
  });

  it('shows the server message when the take-down fails', () => {
    setup([row('a')]);
    api.takeDownListing.and.returnValue(throwError(() => ({ error: { message: 'already' } })));
    const page = fixture.componentInstance;

    page.openTakeDownModal(page.properties()[0]);
    page.actionReason = 'x';
    page.submitTakeDown();

    expect(toast.error).toHaveBeenCalledWith('already');
    expect(page.saving()).toBeFalse();
  });

  it('restore sends the optional reason', () => {
    setup([row('b', { isTakenDown: true })]);
    const page = fixture.componentInstance;

    page.openRestoreModal(page.properties()[0]);
    page.actionReason = 'تم التصحيح';
    page.submitRestore();

    expect(api.restoreListing).toHaveBeenCalledOnceWith('b', 'تم التصحيح');
  });
});
