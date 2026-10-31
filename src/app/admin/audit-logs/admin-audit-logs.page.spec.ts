import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';

import { AdminAuditLogsPage } from './admin-audit-logs.page';
import { AdminAuditLogsService } from '../../core/api/admin-audit-logs.service';
import { ToastService } from '../../shared/services/toast.service';

describe('AdminAuditLogsPage', () => {
  let api: jasmine.SpyObj<AdminAuditLogsService>;
  let toast: jasmine.SpyObj<ToastService>;

  const entry = {
    id: 'a1', timestamp: '2026-10-31T10:00:00Z', userId: 'u1', userName: 'Admin One', action: 'UserDisabled',
    ipAddress: '203.0.113.0', oldValue: 'Active', newValue: 'Disabled'
  };

  function create() {
    TestBed.configureTestingModule({
      imports: [AdminAuditLogsPage, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AdminAuditLogsService, useValue: api },
        { provide: ToastService, useValue: toast }
      ]
    });
    const fixture = TestBed.createComponent(AdminAuditLogsPage);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    api = jasmine.createSpyObj('AdminAuditLogsService', ['search']);
    toast = jasmine.createSpyObj('ToastService', ['success', 'error']);
  });

  it('loads the newest page on open and shows the entries', () => {
    api.search.and.returnValue(of({ items: [entry], total: 1, page: 1, pageSize: 50, totalPages: 1 }));
    const fixture = create();
    expect(api.search).toHaveBeenCalledOnceWith(1, 50, jasmine.objectContaining({}));
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('UserDisabled');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Admin One');
  });

  it('applying filters returns to page 1 and sends whole-day UTC bounds', () => {
    api.search.and.returnValue(of({ items: [], total: 0, page: 1, pageSize: 50, totalPages: 1 }));
    const page = create().componentInstance;
    page.goToPage(3);
    page.action = ' UserDisabled ';
    page.from = '2026-10-01';
    page.to = '2026-10-31';
    page.search = '';
    page.applyFilters();

    expect(page.page()).toBe(1);
    expect(api.search.calls.mostRecent().args).toEqual([1, 50, {
      search: undefined, action: 'UserDisabled', from: '2026-10-01T00:00:00Z', to: '2026-10-31T23:59:59Z'
    }]);
  });

  it('a failed load shows the error state and a toast, not an empty list', () => {
    api.search.and.returnValue(throwError(() => new Error('500')));
    const page = create().componentInstance;
    expect(page.error()).toBeTrue();
    expect(page.items()).toEqual([]);
    expect(toast.error).toHaveBeenCalled();
  });
});
