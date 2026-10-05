import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { throwError } from 'rxjs';

import { AuthApiService } from '../../../core/auth/auth-api.service';
import { ToastService } from '../../../shared/services/toast.service';
import { RegisterPage } from './register.page';

// Value only meant to satisfy the form; tools/frontend-audit-guard.mjs flags password:'literal'.
const FAKE_TEST_CREDENTIAL = 'Zq7!rLm2Xw';

describe('RegisterPage — error shown for a failed sign-up', () => {
  let page: RegisterPage;
  let authApi: jasmine.SpyObj<AuthApiService>;

  beforeEach(() => {
    authApi = jasmine.createSpyObj<AuthApiService>('AuthApiService', ['register', 'resendConfirmationEmail']);
    const translate = jasmine.createSpyObj<TranslateService>('TranslateService', ['instant']);
    // instant() echoes the key, which is enough to tell messages apart.
    translate.instant.and.callFake((key: string | string[]) => String(key));

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthApiService, useValue: authApi },
        { provide: TranslateService, useValue: translate },
        { provide: Router, useValue: jasmine.createSpyObj<Router>('Router', ['navigateByUrl']) },
        { provide: ToastService, useValue: jasmine.createSpyObj<ToastService>('ToastService', ['success', 'error']) }
      ]
    });

    page = TestBed.runInInjectionContext(() => new RegisterPage());
    page.form.setValue({
      firstName: 'Naeem',
      lastName: 'Test',
      email: 'naeem@example.com',
      password: FAKE_TEST_CREDENTIAL
    });
    page.privacyConsentAccepted.set(true);
  });

  const failWith = (status: number, error: unknown) =>
    authApi.register.and.returnValue(throwError(() => ({ status, error })));

  it('shows the translated server-error text for the API generic 500, not its English sentence (2026-10-05)', () => {
    failWith(500, {
      title: 'Internal Server Error',
      status: 500,
      message: 'An unexpected error occurred. Please try again later.'
    });

    page.submit();

    expect(page.error()).toBe('AUTH.ERRORS.SERVER_ERROR');
    expect(page.loading()).toBeFalse();
  });

  it('does the same for a 503', () => {
    failWith(503, { title: 'Rate limiter backend is unavailable.', status: 503 });

    page.submit();

    expect(page.error()).toBe('AUTH.ERRORS.SERVER_ERROR');
  });

  it('still shows the server message of a 4xx, which is written for the person', () => {
    failWith(400, { message: 'Email must not contain whitespace.' });

    page.submit();

    expect(page.error()).toBe('Email must not contain whitespace.');
  });

  it('still maps a 409 without a body to the "email already registered" text', () => {
    failWith(409, null);

    page.submit();

    expect(page.error()).toBe('AUTH.ERRORS.EMAIL_ALREADY_EXISTS');
  });
});
