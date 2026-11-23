import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';

import { LegalHold, LegalHoldsApiService } from '../../core/api/legal-holds-api.service';
import { ToastService } from '../../shared/services/toast.service';
import { AdminLegalHoldsPage } from './admin-legal-holds.page';

const USER = '11111111-2222-3333-4444-555555555555';
const hold = (over: Partial<LegalHold> = {}): LegalHold => ({
  id: 'h1', userAccountId: USER, reason: 'Court request', placedByUserId: 'a1', placedAtUtc: '2026-11-17T10:00:00Z',
  releasedByUserId: null, releasedAtUtc: null, isActive: true, ...over
});

describe('AdminLegalHoldsPage (audit P2-1)', () => {
  let api: jasmine.SpyObj<LegalHoldsApiService>;
  let toast: jasmine.SpyObj<ToastService>;

  function create(query: Record<string, string> = {}) {
    TestBed.configureTestingModule({
      imports: [AdminLegalHoldsPage, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
        { provide: LegalHoldsApiService, useValue: api },
        { provide: ToastService, useValue: toast }
      ]
    });
    const fixture = TestBed.createComponent(AdminLegalHoldsPage);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    api = jasmine.createSpyObj<LegalHoldsApiService>('LegalHoldsApiService', ['list', 'place', 'release']);
    api.list.and.returnValue(of([hold()]));
    api.place.and.returnValue(of(hold()));
    api.release.and.returnValue(of(hold({ isActive: false })));
    toast = jasmine.createSpyObj('ToastService', ['success', 'error']);
  });

  it('lists active holds by default', () => {
    const fixture = create();
    expect(api.list).toHaveBeenCalledWith(null, true);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="hold-row"]').length).toBe(1);
  });

  it('opened from an account fills the form and narrows the list', () => {
    const fixture = create({ user: USER });
    expect(fixture.componentInstance.userAccountId).toBe(USER);
    expect(api.list).toHaveBeenCalledWith(USER, true);
  });

  it('ignores a malformed ?user', () => {
    const fixture = create({ user: 'not-an-id' });
    expect(fixture.componentInstance.userAccountId).toBe('');
    expect(api.list).toHaveBeenCalledWith(null, true);
  });

  it('places a hold after confirmation, with a trimmed reason', () => {
    spyOn(window, 'confirm').and.returnValue(true);
    const page = create().componentInstance;
    page.userAccountId = ` ${USER} `;
    page.reason = '  Court request  ';
    page.place();
    expect(api.place).toHaveBeenCalledOnceWith(USER, 'Court request');
    expect(toast.success).toHaveBeenCalled();
    expect(page.reason).toBe('');
  });

  it('refuses a malformed id or an empty reason without calling the API', () => {
    const confirmSpy = spyOn(window, 'confirm').and.returnValue(true);
    const page = create().componentInstance;
    page.userAccountId = 'abc';
    page.reason = 'x';
    page.place();
    expect(page.formError()).toBe('ADMIN_LEGAL_HOLDS.INVALID_ID');

    page.userAccountId = USER;
    page.reason = '   ';
    page.place();
    expect(page.formError()).toBe('ADMIN_LEGAL_HOLDS.REASON_REQUIRED');
    expect(api.place).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('explains a 422 (no such account)', () => {
    spyOn(window, 'confirm').and.returnValue(true);
    api.place.and.returnValue(throwError(() => ({ status: 422 })));
    const page = create().componentInstance;
    page.userAccountId = USER;
    page.reason = 'x';
    page.place();
    expect(page.formError()).toBe('ADMIN_LEGAL_HOLDS.UNKNOWN_ACCOUNT');
    expect(page.saving()).toBeFalse();
  });

  it('releases only after confirmation', () => {
    const confirmSpy = spyOn(window, 'confirm').and.returnValue(false);
    const page = create().componentInstance;
    page.release(hold());
    expect(api.release).not.toHaveBeenCalled();

    confirmSpy.and.returnValue(true);
    page.release(hold());
    expect(api.release).toHaveBeenCalledOnceWith('h1');
    expect(toast.success).toHaveBeenCalled();
  });
});
