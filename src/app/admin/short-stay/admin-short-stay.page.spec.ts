import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';

import { AdminShortStayPage } from './admin-short-stay.page';
import { AdminShortStayService } from '../../core/api/admin-short-stay.service';
import { AdminShortStayListing } from '../../core/models/short-stay.model';
import { ToastService } from '../../shared/services/toast.service';

function listing(overrides: Partial<AdminShortStayListing> = {}): AdminShortStayListing {
  return {
    id: 'l1', title: 'Villa', city: 'Damascus', ownerId: 'u1', accommodationTypeNameAr: 'فيلا',
    isPublished: true, isTakenDown: false, takenDownAt: null, takenDownReason: null,
    createdAt: '2026-10-01T00:00:00Z', ...overrides
  };
}

function paged(items: AdminShortStayListing[]) {
  return { items, totalCount: items.length, page: 1, pageSize: 20, totalPages: 1, hasNext: false, hasPrevious: false };
}

describe('AdminShortStayPage', () => {
  let api: jasmine.SpyObj<AdminShortStayService>;
  let toast: jasmine.SpyObj<ToastService>;

  function create() {
    TestBed.configureTestingModule({
      imports: [AdminShortStayPage, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AdminShortStayService, useValue: api },
        { provide: ToastService, useValue: toast }
      ]
    });
    const fixture = TestBed.createComponent(AdminShortStayPage);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    api = jasmine.createSpyObj('AdminShortStayService', ['search', 'takeDown', 'restore']);
    toast = jasmine.createSpyObj('ToastService', ['success', 'error', 'show']);
    api.search.and.returnValue(of(paged([listing()])));
  });

  it('loads the listings on open', () => {
    const page = create().componentInstance;
    expect(api.search).toHaveBeenCalledWith(jasmine.objectContaining({ page: 1, pageSize: 20, takenDown: false }));
    expect(page.listings().length).toBe(1);
    expect(page.total()).toBe(1);
  });

  it('keeps the take-down button disabled until a reason is written, and caps the reason', () => {
    const page = create().componentInstance;
    page.openTakeDown(listing());

    expect(page.canSubmitTakeDown()).toBeFalse();
    page.reason = '   ';
    expect(page.canSubmitTakeDown()).toBeFalse();
    page.reason = 'x'.repeat(page.reasonMaxLength + 1);
    expect(page.canSubmitTakeDown()).toBeFalse();
    page.reason = 'misleading photos';
    expect(page.canSubmitTakeDown()).toBeTrue();
  });

  it('does not call the API for a take-down without a reason', () => {
    const page = create().componentInstance;
    page.openTakeDown(listing());
    page.submitTakeDown();
    expect(api.takeDown).not.toHaveBeenCalled();
  });

  it('takes the listing down with the trimmed reason, then reloads', () => {
    api.takeDown.and.returnValue(of(listing({ isTakenDown: true })));
    const page = create().componentInstance;
    page.openTakeDown(listing());
    page.reason = ' misleading photos ';

    page.submitTakeDown();

    expect(api.takeDown).toHaveBeenCalledWith('l1', 'misleading photos');
    expect(toast.success).toHaveBeenCalled();
    expect(page.activeModal()).toBeNull();
    expect(api.search).toHaveBeenCalledTimes(2);
  });

  it('shows the API sentence when the action is refused and keeps the dialog open', () => {
    api.takeDown.and.returnValue(throwError(() => new HttpErrorResponse({ status: 409, error: { message: 'الإعلان موقوف مسبقًا' } })));
    const page = create().componentInstance;
    // The sentence is Arabic, shown as written only on an Arabic page (QA phase 25, P16-D04 stopgap). Set after create():
    // building the page initialises the language service, which writes <html lang>.
    document.documentElement.lang = 'ar';
    page.openTakeDown(listing());
    page.reason = 'spam';

    page.submitTakeDown();

    expect(toast.error).toHaveBeenCalledWith('الإعلان موقوف مسبقًا');
    expect(page.activeModal()).toBe('takedown');
    expect(page.saving()).toBeFalse();
  });

  it('restores without requiring a reason', () => {
    api.restore.and.returnValue(of(listing()));
    const page = create().componentInstance;
    page.openRestore(listing({ isTakenDown: true }));

    page.submitRestore();

    expect(api.restore).toHaveBeenCalledWith('l1', '');
    expect(page.activeModal()).toBeNull();
  });

  it('shows the failed state when loading fails', () => {
    api.search.and.returnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
    const page = create().componentInstance;
    expect(page.failed()).toBeTrue();
    expect(page.loading()).toBeFalse();
  });
});
