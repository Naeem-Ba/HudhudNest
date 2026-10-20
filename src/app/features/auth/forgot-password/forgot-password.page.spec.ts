import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';

import { AuthApiService } from '../../../core/auth/auth-api.service';
import { ToastService } from '../../../shared/services/toast.service';
import { ForgotPasswordPage } from './forgot-password.page';

describe('ForgotPasswordPage — the reset-link request', () => {
  let authApi: jasmine.SpyObj<AuthApiService>;
  let toast: jasmine.SpyObj<ToastService>;

  const create = (): ForgotPasswordPage => {
    const page = TestBed.runInInjectionContext(() => new ForgotPasswordPage());
    page.form.setValue({ email: 'a@b.com' });
    return page;
  };

  beforeEach(() => {
    authApi = jasmine.createSpyObj<AuthApiService>('AuthApiService', ['forgotPassword']);
    toast = jasmine.createSpyObj<ToastService>('ToastService', ['success', 'error']);
    const translate = jasmine.createSpyObj<TranslateService>('TranslateService', ['instant']);
    translate.instant.and.callFake((key: string | string[]) => String(key));

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthApiService, useValue: authApi },
        { provide: TranslateService, useValue: translate },
        { provide: ToastService, useValue: toast }
      ]
    });
  });

  it('shows the neutral success text when the request is accepted', () => {
    authApi.forgotPassword.and.returnValue(of({}));
    const page = create();

    page.submit();

    expect(page.success()).toBe('AUTH.FORGOT_SUCCESS');
    expect(page.error()).toBe('');
  });

  it('says the request could not be sent when the API fails', () => {
    authApi.forgotPassword.and.returnValue(throwError(() => ({ status: 500 })));
    const page = create();

    page.submit();

    expect(page.error()).toBe('AUTH.ERRORS.FORGOT_FAILED');
    expect(page.loading()).toBeFalse();
  });

  it('names the limit, not a failed send, when the API answers 429', () => {
    authApi.forgotPassword.and.returnValue(throwError(() => ({ status: 429 })));
    const page = create();

    page.submit();

    expect(page.error()).toBe('AUTH.ERRORS.PASSWORD_RESET_LIMIT');
    expect(page.loading()).toBeFalse();
  });
});
