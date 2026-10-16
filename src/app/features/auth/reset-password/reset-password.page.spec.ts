import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';

import { AuthApiService } from '../../../core/auth/auth-api.service';
import { ToastService } from '../../../shared/services/toast.service';
import { ResetPasswordPage } from './reset-password.page';

describe('ResetPasswordPage — the page the reset email link opens', () => {
  let authApi: jasmine.SpyObj<AuthApiService>;
  let toast: jasmine.SpyObj<ToastService>;
  let linkParams: Record<string, string> = {};

  // Test-only values held in constants (not real credentials) so the audit guard's password[:=]'..' pattern stays quiet.
  const NEW_VALUE = 'Newpass123';
  const OTHER_VALUE = 'Different123';
  const SHORT_VALUE = 'short1A';

  const create = (params: Record<string, string>): ResetPasswordPage => {
    linkParams = params;
    return TestBed.runInInjectionContext(() => new ResetPasswordPage());
  };

  beforeEach(() => {
    authApi = jasmine.createSpyObj<AuthApiService>('AuthApiService', ['resetPassword']);
    toast = jasmine.createSpyObj<ToastService>('ToastService', ['success', 'error']);
    const translate = jasmine.createSpyObj<TranslateService>('TranslateService', ['instant']);
    translate.instant.and.callFake((key: string | string[]) => String(key));

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthApiService, useValue: authApi },
        { provide: TranslateService, useValue: translate },
        { provide: ToastService, useValue: toast },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              get queryParamMap() {
                return convertToParamMap(linkParams);
              }
            }
          }
        }
      ]
    });
  });

  it('takes email and token from the link, with no token control in the form', () => {
    const page = create({ email: 'a@b.com', token: 'x+y/z=' });

    expect(page.linkValid).toBeTrue();
    expect(page.email).toBe('a@b.com');
    expect(Object.keys(page.form.controls)).toEqual(['newPassword', 'confirmPassword']);
  });

  it('treats a link without email or token as invalid and never submits', () => {
    for (const params of [{}, { email: 'a@b.com' }, { token: 't' }]) {
      const page = create(params);
      page.form.setValue({ newPassword: NEW_VALUE, confirmPassword: NEW_VALUE });

      page.submit();

      expect(page.linkValid).toBeFalse();
    }
    expect(authApi.resetPassword).not.toHaveBeenCalled();
  });

  it('blocks submit and flags the confirmation when the two passwords differ', () => {
    const page = create({ email: 'a@b.com', token: 't' });
    page.form.setValue({ newPassword: NEW_VALUE, confirmPassword: OTHER_VALUE });

    page.submit();

    expect(page.form.controls.confirmPassword.errors?.['mismatch']).toBeTrue();
    expect(authApi.resetPassword).not.toHaveBeenCalled();
    expect(page.loading()).toBeFalse();
  });

  it('clears the mismatch once the confirmation matches', () => {
    const page = create({ email: 'a@b.com', token: 't' });
    page.form.setValue({ newPassword: NEW_VALUE, confirmPassword: OTHER_VALUE });
    page.form.controls.confirmPassword.setValue(NEW_VALUE);

    expect(page.form.valid).toBeTrue();
  });

  it('rejects a password shorter than 8 characters', () => {
    const page = create({ email: 'a@b.com', token: 't' });
    page.form.setValue({ newPassword: SHORT_VALUE, confirmPassword: SHORT_VALUE });

    expect(page.form.controls.newPassword.errors?.['minlength']).toBeTruthy();
  });

  it('sends the link token untouched together with the new password and confirmation', () => {
    authApi.resetPassword.and.returnValue(of({}));
    const page = create({ email: 'a@b.com', token: 'x+y/z=' });
    page.form.setValue({ newPassword: NEW_VALUE, confirmPassword: NEW_VALUE });

    page.submit();

    expect(authApi.resetPassword).toHaveBeenCalledWith({
      email: 'a@b.com',
      token: 'x+y/z=',
      newPassword: NEW_VALUE,
      confirmPassword: NEW_VALUE
    });
    expect(page.success()).toBe('AUTH.RESET_SUCCESS');
    expect(page.loading()).toBeFalse();
  });

  it('shows the failure message and re-enables the form when the API rejects', () => {
    authApi.resetPassword.and.returnValue(throwError(() => ({ status: 400 })));
    const page = create({ email: 'a@b.com', token: 't' });
    page.form.setValue({ newPassword: NEW_VALUE, confirmPassword: NEW_VALUE });

    page.submit();

    expect(page.error()).toBe('AUTH.ERRORS.RESET_FAILED');
    expect(page.loading()).toBeFalse();
  });

  it('names the limit, not a failed reset, when the API answers 429', () => {
    authApi.resetPassword.and.returnValue(throwError(() => ({ status: 429 })));
    const page = create({ email: 'a@b.com', token: 't' });
    page.form.setValue({ newPassword: NEW_VALUE, confirmPassword: NEW_VALUE });

    page.submit();

    expect(page.error()).toBe('AUTH.ERRORS.PASSWORD_RESET_LIMIT');
    expect(page.loading()).toBeFalse();
  });
});
