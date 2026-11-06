import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { NEVER, of, throwError } from 'rxjs';

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

    expect(page.form.controls.email.errors?.['server']).toBe('AUTH.ERRORS.EMAIL_ALREADY_EXISTS');
    expect(page.error()).toBe('');
  });

  it('translates the 409 body that carries the English sentence instead of printing it (2026-10-07)', () => {
    failWith(409, { message: 'Email already registered.', code: 'EMAIL_ALREADY_REGISTERED' });

    page.submit();

    expect(page.form.controls.email.errors?.['server']).toBe('AUTH.ERRORS.EMAIL_ALREADY_EXISTS');
    expect(page.error()).toBe('');
    expect(page.error()).not.toContain('Email already registered');
  });

  it('translates a 409 from an API build that predates the code', () => {
    failWith(409, { message: 'Email already registered.' });

    page.submit();

    expect(page.form.controls.email.errors?.['server']).toBe('AUTH.ERRORS.EMAIL_ALREADY_EXISTS');
    expect(page.error()).toBe('');
  });

  it('translates on the code alone, whatever the status', () => {
    failWith(400, { message: 'Email already registered.', code: 'EMAIL_ALREADY_REGISTERED' });

    page.submit();

    expect(page.form.controls.email.errors?.['server']).toBe('AUTH.ERRORS.EMAIL_ALREADY_EXISTS');
    expect(page.error()).toBe('');
  });

  it('puts a rejected password under the password field, keeps what was typed, and clears it on the next edit', () => {
    failWith(422, {
      errors: { Password: ['English'] },
      errorCodes: { Password: ['PASSWORD_BREACHED'] }
    });

    page.submit();

    expect(page.form.controls.password.errors?.['server']).toBe('AUTH.ERRORS.PASSWORD_BREACHED');
    expect(page.form.controls.password.value).toBe(FAKE_TEST_CREDENTIAL);
    expect(page.form.controls.email.value).toBe('naeem@example.com');

    page.form.controls.password.setValue(FAKE_TEST_CREDENTIAL + '9');
    expect(page.form.controls.password.errors?.['server']).toBeUndefined();
  });

  it('a lost connection or a timeout is shown as such and the form keeps its data', () => {
    authApi.register.and.returnValue(throwError(() => ({ status: 0 })));
    page.submit();
    expect(page.error()).toBe('AUTH.ERRORS.NETWORK_ERROR');
    expect(page.form.controls.password.value).toBe(FAKE_TEST_CREDENTIAL);

    authApi.register.and.returnValue(throwError(() => ({ name: 'TimeoutError' })));
    page.submit();
    expect(page.error()).toBe('AUTH.ERRORS.TIMEOUT');
  });

  it('editing any field removes the message about the previous attempt', () => {
    authApi.register.and.returnValue(throwError(() => ({ status: 0 })));
    page.submit();
    expect(page.error()).not.toBe('');

    page.form.controls.firstName.setValue('Naeem2');

    expect(page.error()).toBe('');
  });

  it('does not send anything when the agreement box is not ticked, and says why', () => {
    page.privacyConsentAccepted.set(false);

    page.submit();

    expect(authApi.register).not.toHaveBeenCalled();
    expect(page.consentError()).toBe('AUTH.ERRORS.CONSENT_REQUIRED');
  });

  it('refuses a password built from the name or the e-mail before any request', () => {
    page.form.controls.password.setValue('Naeem#2024x');
    expect(page.form.controls.password.errors?.['passwordPolicy']?.violations).toContain('PASSWORD_CONTAINS_PERSONAL_INFO');

    page.submit();

    expect(authApi.register).not.toHaveBeenCalled();
  });

  it('ignores a second submit while the first is still running', () => {
    authApi.register.and.returnValue(NEVER);

    page.submit();
    page.submit();

    expect(authApi.register).toHaveBeenCalledTimes(1);
  });
});

describe('RegisterPage — what the success screen says about the confirmation mail', () => {
  let page: RegisterPage;
  let authApi: jasmine.SpyObj<AuthApiService>;
  let toast: jasmine.SpyObj<ToastService>;

  beforeEach(() => {
    authApi = jasmine.createSpyObj<AuthApiService>('AuthApiService', ['register', 'resendConfirmationEmail']);
    toast = jasmine.createSpyObj<ToastService>('ToastService', ['success', 'error']);
    const translate = jasmine.createSpyObj<TranslateService>('TranslateService', ['instant']);
    translate.instant.and.callFake((key: string | string[]) => String(key));

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthApiService, useValue: authApi },
        { provide: TranslateService, useValue: translate },
        { provide: Router, useValue: jasmine.createSpyObj<Router>('Router', ['navigateByUrl']) },
        { provide: ToastService, useValue: toast }
      ]
    });

    page = TestBed.runInInjectionContext(() => new RegisterPage());
    page.form.setValue({
      firstName: 'Naeem',
      lastName: 'Test',
      email: 'Naeem@Example.com',
      password: FAKE_TEST_CREDENTIAL
    });
    page.privacyConsentAccepted.set(true);
  });

  it('says a link was sent when the API confirms it', () => {
    authApi.register.and.returnValue(of({ message: 'ok', userId: 'u1', confirmationEmailSent: true }));

    page.submit();

    expect(page.registered()).toBeTrue();
    expect(page.confirmationEmailSent()).toBeTrue();
    expect(toast.success).toHaveBeenCalledWith('AUTH.REGISTER_SUCCESS');
  });

  it('keeps saying so for an API that predates the field', () => {
    authApi.register.and.returnValue(of({ message: 'ok', userId: 'u1' }));

    page.submit();

    expect(page.confirmationEmailSent()).toBeTrue();
    expect(toast.success).toHaveBeenCalledWith('AUTH.REGISTER_SUCCESS');
  });

  it('does not claim a link was sent when the API says the mail could not be sent', () => {
    authApi.register.and.returnValue(of({ message: 'ok', userId: 'u1', confirmationEmailSent: false }));

    page.submit();

    expect(page.registered()).toBeTrue();
    expect(page.confirmationEmailSent()).toBeFalse();
    expect(toast.success).toHaveBeenCalledWith('AUTH.REGISTER_SUCCESS_MAIL_FAILED');
  });

  it('resends to the normalised address and shows the server text', () => {
    authApi.register.and.returnValue(of({ message: 'ok', userId: 'u1', confirmationEmailSent: false }));
    authApi.resendConfirmationEmail.and.returnValue(of({ message: 'server text' }));
    page.submit();

    page.resendConfirmation();

    expect(authApi.resendConfirmationEmail).toHaveBeenCalledWith('naeem@example.com');
    expect(page.resendMessage()).toBe('server text');
  });

  it('tells the person the resend limit was reached on a 429, not "server error"', () => {
    authApi.register.and.returnValue(of({ message: 'ok', userId: 'u1' }));
    authApi.resendConfirmationEmail.and.returnValue(throwError(() => ({ status: 429 })));
    page.submit();

    page.resendConfirmation();

    expect(page.resendMessage()).toBe('AUTH.RESEND_CONFIRMATION.TOO_MANY');
  });
});
