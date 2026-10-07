import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';

import { AuthApiService } from '../../../core/auth/auth-api.service';
import { PhoneAuthApiService } from '../../../core/auth/phone-auth-api.service';
import { ToastService } from '../../../shared/services/toast.service';
import { VerifyEmailPage } from './verify-email.page';

describe('VerifyEmailPage — the page the confirmation link opens', () => {
  let phoneAuth: jasmine.SpyObj<PhoneAuthApiService>;
  let authApi: jasmine.SpyObj<AuthApiService>;
  let toast: jasmine.SpyObj<ToastService>;

  // The route stub reads this on every access, so one TestBed can open several links.
  let linkParams: Record<string, string> = {};

  const create = (params: Record<string, string>): VerifyEmailPage => {
    linkParams = params;
    const page = TestBed.runInInjectionContext(() => new VerifyEmailPage());
    page.ngOnInit();
    return page;
  };

  beforeEach(() => {
    phoneAuth = jasmine.createSpyObj<PhoneAuthApiService>('PhoneAuthApiService', ['verifyEmail']);
    authApi = jasmine.createSpyObj<AuthApiService>('AuthApiService', ['resendConfirmationEmail']);
    toast = jasmine.createSpyObj<ToastService>('ToastService', ['success', 'error']);
    const translate = jasmine.createSpyObj<TranslateService>('TranslateService', ['instant']);
    // instant() echoes the key, which is enough to tell messages apart.
    translate.instant.and.callFake((key: string | string[]) => String(key));

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: PhoneAuthApiService, useValue: phoneAuth },
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

  it('confirms the address with the userId and token from the link', () => {
    phoneAuth.verifyEmail.and.returnValue(of({ message: 'ok' }));

    const page = create({ userId: 'u1', token: 'a+b/c=' });

    expect(phoneAuth.verifyEmail).toHaveBeenCalledWith('u1', 'a+b/c=');
    expect(page.state()).toBe('success');
    expect(toast.success).toHaveBeenCalled();
  });

  it('asks for nothing from the server when the link has no parameters', () => {
    const page = create({});

    expect(phoneAuth.verifyEmail).not.toHaveBeenCalled();
    expect(page.state()).toBe('error');
    expect(page.errorMessage()).toBe('AUTH.VERIFY_EMAIL.MISSING_PARAMS');
  });

  it('calls a rejected token an invalid or expired link and offers a resend', () => {
    phoneAuth.verifyEmail.and.returnValue(throwError(() => ({ status: 400 })));

    const page = create({ userId: 'u1', token: 't' });

    expect(page.state()).toBe('error');
    expect(page.errorMessage()).toBe('AUTH.VERIFY_EMAIL.FAILED');
    expect(page.rateLimited()).toBeFalse();
  });

  it('does not call a valid link invalid when the request was rate limited (429)', () => {
    phoneAuth.verifyEmail.and.returnValue(throwError(() => ({ status: 429 })));

    const page = create({ userId: 'u1', token: 't' });

    expect(page.errorMessage()).toBe('AUTH.VERIFY_EMAIL.TOO_MANY');
    expect(page.rateLimited()).toBeTrue();
  });

  it('does not call a valid link invalid when the server is down or unreachable', () => {
    for (const status of [0, 500, 503]) {
      phoneAuth.verifyEmail.and.returnValue(throwError(() => ({ status })));

      const page = create({ userId: 'u1', token: 't' });

      expect(page.errorMessage()).withContext(`status ${status}`).toBe('AUTH.VERIFY_EMAIL.TEMPORARY');
      expect(page.rateLimited()).toBeFalse();
    }
  });

  it('shows the resend limit text when asking for a new link is itself rate limited', () => {
    phoneAuth.verifyEmail.and.returnValue(throwError(() => ({ status: 400 })));
    authApi.resendConfirmationEmail.and.returnValue(throwError(() => ({ status: 429 })));
    const page = create({ userId: 'u1', token: 't' });
    page.resendEmail.set('naeem@example.com');

    page.resendConfirmation();

    expect(page.resendMessage()).toBe('AUTH.RESEND_CONFIRMATION.TOO_MANY');
  });
});
