import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';

import { AuthService } from '../../../core/auth/auth.service';
import { PhoneAuthApiService } from '../../../core/auth/phone-auth-api.service';
import { ToastService } from '../../../shared/services/toast.service';
import { PhoneChangePage } from './phone-change.page';

describe('PhoneChangePage — opened from the profile', () => {
  const create = (queryParams: Record<string, string>): PhoneChangePage => {
    const phoneAuth = jasmine.createSpyObj<PhoneAuthApiService>('PhoneAuthApiService', ['getOtpChannels']);
    phoneAuth.getOtpChannels.and.returnValue(of([]));
    const translate = jasmine.createSpyObj<TranslateService>('TranslateService', ['instant']);
    translate.instant.and.callFake((key: string | string[]) => String(key));

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: PhoneAuthApiService, useValue: phoneAuth },
        { provide: AuthService, useValue: jasmine.createSpyObj<AuthService>('AuthService', ['restoreSession', 'validateSession']) },
        { provide: TranslateService, useValue: translate },
        { provide: ToastService, useValue: jasmine.createSpyObj<ToastService>('ToastService', ['success', 'error']) },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } } }
      ]
    });
    return TestBed.runInInjectionContext(() => new PhoneChangePage());
  };

  it('starts empty and as a plain change when no number comes with the link', () => {
    const page = create({});

    expect(page.phoneForm.controls.phoneNumber.value).toBe('');
    expect(page.confirmingExisting()).toBeFalse();
  });

  it('fills in the stored number and switches to the "confirm" wording when the profile sends it', () => {
    const page = create({ phone: ' +963911234567 ' });

    expect(page.phoneForm.controls.phoneNumber.value).toBe('+963911234567');
    expect(page.confirmingExisting()).toBeTrue();
  });
});
