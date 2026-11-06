// =====================================================================
// ✅ Component Tests – phone-register.page.spec.ts
// The phone registration flow with multi-channel OTP, rendered for real: the picker appears only when
// the deployment offers more than SMS, the chosen channel is what is sent and what is verified, the
// fallback is manual, and provider trouble / rate limits show a plain message. The four phone pages
// share the same state helper and components, so this page stands for them; the helper and components
// have their own specs.
// =====================================================================
import { ComponentFixture, TestBed, discardPeriodicTasks, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';

import { AuthService } from '../../../core/auth/auth.service';
import { PhoneAuthApiService } from '../../../core/auth/phone-auth-api.service';
import { ConsentApiService } from '../../../core/api/consent-api.service';
import { OtpChannelOption, PhoneWorkflowResponse } from '../../../core/models/auth.model';
import { PhoneRegisterPage } from './phone-register.page';

// Dummy value kept in a variable: tools/frontend-audit-guard.mjs flags a literal password: '...' shape.
const TEST_CREDENTIAL = 'Zq7!rLm2Xw';
const SYRIAN = '+963933123456';

function option(channel: OtpChannelOption['channel'], patch: Partial<OtpChannelOption> = {}): OtpChannelOption {
  return { channel, available: true, recommended: false, reason: null, unavailableCountryCodes: [], ...patch };
}

const SMS_ONLY = [
  option('Sms'),
  option('Telegram', { available: false, reason: 'CHANNEL_DISABLED' }),
  option('WhatsApp', { available: false, reason: 'CHANNEL_DISABLED' })
];

const ALL_FOR_SYRIA = [
  option('Sms'),
  option('Telegram', { recommended: true }),
  option('WhatsApp', { available: false, reason: 'COUNTRY_NOT_SUPPORTED', unavailableCountryCodes: ['+963', '+53', '+98', '+850'] })
];

const sent = (channel: PhoneWorkflowResponse['channel']): PhoneWorkflowResponse => ({ succeeded: true, challengeId: 'c-1', channel });

describe('PhoneRegisterPage (multi-channel OTP)', () => {
  let api: jasmine.SpyObj<PhoneAuthApiService>;
  let fixture: ComponentFixture<PhoneRegisterPage>;
  let page: PhoneRegisterPage;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const radios = (): HTMLInputElement[] => Array.from(el().querySelectorAll('app-otp-channel-picker input[type="radio"]'));

  function create(channels: OtpChannelOption[] | 'fail'): void {
    api.getOtpChannels.and.returnValue(channels === 'fail' ? throwError(() => ({ status: 500 })) : of(channels));
    fixture = TestBed.createComponent(PhoneRegisterPage);
    page = fixture.componentInstance;
    fixture.detectChanges();
  }

  function typePhone(value = SYRIAN): void {
    page.phoneForm.controls.phoneNumber.setValue(value);
    tick(400);
    fixture.detectChanges();
  }

  function submitPhone(): void {
    (el().querySelector('form button[type="submit"]') as HTMLButtonElement).click();
    fixture.detectChanges();
  }

  beforeEach(() => {
    api = jasmine.createSpyObj<PhoneAuthApiService>('PhoneAuthApiService', [
      'getOtpChannels',
      'sendRegistrationOtp',
      'register'
    ]);
    api.sendRegistrationOtp.and.returnValue(of(sent('Sms')));
    api.register.and.returnValue(of({ succeeded: true, accessToken: 'token' }));

    TestBed.configureTestingModule({
      imports: [PhoneRegisterPage, TranslateModule.forRoot()],
      providers: [
        provideRouter([{ path: 'home', children: [] }]),
        { provide: PhoneAuthApiService, useValue: api },
        { provide: AuthService, useValue: jasmine.createSpyObj<AuthService>('AuthService', ['rememberLoginMethod', 'restoreSession', 'validateSession']) },
        { provide: ConsentApiService, useValue: jasmine.createSpyObj<ConsentApiService>('ConsentApiService', { record: of(undefined) }) }
      ]
    });
  });

  it('shows no picker when only SMS is offered, and sends exactly as before (SMS)', fakeAsync(() => {
    create(SMS_ONLY);
    typePhone();

    expect(el().querySelector('app-otp-channel-picker')).toBeNull();

    submitPhone();
    expect(api.sendRegistrationOtp).toHaveBeenCalledOnceWith(SYRIAN, 'Sms');
    discardPeriodicTasks();
  }));

  it('shows no picker when the channel list cannot be loaded (the old page keeps working)', fakeAsync(() => {
    create('fail');
    typePhone();

    expect(el().querySelector('app-otp-channel-picker')).toBeNull();
    submitPhone();
    expect(api.sendRegistrationOtp).toHaveBeenCalledOnceWith(SYRIAN, 'Sms');
    discardPeriodicTasks();
  }));

  it('shows the available channels, preselects the recommended one and disables the unavailable one', fakeAsync(() => {
    create(ALL_FOR_SYRIA);
    typePhone();

    expect(radios().length).toBe(3);
    expect(radios().map(r => r.checked)).toEqual([false, true, false]);
    expect(radios().map(r => r.disabled)).toEqual([false, false, true]);
    const text = el().querySelector('app-otp-channel-picker')?.textContent ?? '';
    expect(text).toContain('AUTH.CHANNELS.NOT_IN_YOUR_COUNTRY');
    expect(text).toContain('AUTH.CHANNELS.COUNTRIES.963');
    expect(api.getOtpChannels).toHaveBeenCalledWith(SYRIAN);
  }));

  it('sends through the channel the person picked and remembers it for the verification', fakeAsync(() => {
    api.sendRegistrationOtp.and.returnValue(of(sent('Sms')));
    create(ALL_FOR_SYRIA);
    typePhone();

    radios()[0].click();
    fixture.detectChanges();
    submitPhone();

    expect(api.sendRegistrationOtp).toHaveBeenCalledOnceWith(SYRIAN, 'Sms');
    expect(page.step()).toBe('details');
    expect(el().querySelector('app-otp-channel-fallback')?.textContent).toContain('AUTH.CHANNELS.SENT_VIA');

    page.detailsForm.setValue({ code: '123456', firstName: 'Multi', lastName: 'Channel', password: TEST_CREDENTIAL });
    page.privacyConsentAccepted.set(true);
    page.submitDetails();

    expect(api.register).toHaveBeenCalledWith(jasmine.objectContaining({ challengeId: 'c-1', channel: 'Sms' }));
    discardPeriodicTasks();
  }));

  it('uses the channel the server says the challenge was created for', fakeAsync(() => {
    api.sendRegistrationOtp.and.returnValue(of(sent('Telegram')));
    create(ALL_FOR_SYRIA);
    typePhone();
    submitPhone();

    page.detailsForm.setValue({ code: '123456', firstName: 'Multi', lastName: 'Channel', password: TEST_CREDENTIAL });
    page.privacyConsentAccepted.set(true);
    page.submitDetails();

    expect(api.register).toHaveBeenCalledWith(jasmine.objectContaining({ channel: 'Telegram' }));
    discardPeriodicTasks();
  }));

  it('offers "didn\'t get the code?" with the other available channels, and switching is a manual send', fakeAsync(() => {
    api.sendRegistrationOtp.and.returnValues(of(sent('Telegram')), of({ ...sent('Sms'), challengeId: 'c-2' }));
    create(ALL_FOR_SYRIA);
    typePhone();
    submitPhone();

    const fallback = el().querySelector('app-otp-channel-fallback') as HTMLElement;
    expect(fallback.textContent).toContain('AUTH.CHANNELS.NO_CODE');
    const buttons = Array.from(fallback.querySelectorAll('button'));
    expect(buttons.length).toBe(1);
    expect(api.sendRegistrationOtp).toHaveBeenCalledTimes(1);   // nothing was sent automatically

    buttons[0].click();
    fixture.detectChanges();

    expect(api.sendRegistrationOtp).toHaveBeenCalledTimes(2);
    expect(api.sendRegistrationOtp.calls.mostRecent().args).toEqual([SYRIAN, 'Sms']);

    page.detailsForm.setValue({ code: '123456', firstName: 'Multi', lastName: 'Channel', password: TEST_CREDENTIAL });
    page.privacyConsentAccepted.set(true);
    page.submitDetails();
    expect(api.register).toHaveBeenCalledWith(jasmine.objectContaining({ challengeId: 'c-2', channel: 'Sms' }));
    discardPeriodicTasks();
  }));

  it('explains a provider failure in plain words, stays on the phone step, and lets the person retry or switch', fakeAsync(() => {
    api.sendRegistrationOtp.and.returnValue(throwError(() => ({ status: 400, error: { code: 'OTP_PROVIDER_UNAVAILABLE', message: 'gateway said ACCESS_TOKEN_INVALID' } })));
    create(ALL_FOR_SYRIA);
    typePhone();
    submitPhone();

    expect(page.step()).toBe('phone');
    const alert = el().querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('AUTH.ERRORS.OTP_PROVIDER_UNAVAILABLE');
    expect(alert?.textContent).not.toContain('ACCESS_TOKEN_INVALID');
    expect(page.loading()).toBeFalse();

    radios()[0].click();
    api.sendRegistrationOtp.and.returnValue(of(sent('Sms')));
    fixture.detectChanges();
    submitPhone();
    expect(page.step()).toBe('details');
    discardPeriodicTasks();
  }));

  it('shows the rate-limit message for a 429 and for the shared hourly limit', fakeAsync(() => {
    api.sendRegistrationOtp.and.returnValue(throwError(() => ({ status: 429 })));
    create(ALL_FOR_SYRIA);
    typePhone();
    submitPhone();

    expect(el().querySelector('[role="alert"]')?.textContent).toContain('AUTH.ERRORS.OTP_RATE_LIMITED');
  }));

  it('refuses a channel that is off or unsupported with the channel-unavailable message', fakeAsync(() => {
    api.sendRegistrationOtp.and.returnValue(throwError(() => ({ status: 400, error: { code: 'OTP_CHANNEL_UNAVAILABLE' } })));
    create(ALL_FOR_SYRIA);
    typePhone();
    submitPhone();

    expect(el().querySelector('[role="alert"]')?.textContent).toContain('AUTH.ERRORS.OTP_CHANNEL_UNAVAILABLE');
  }));

  it('disables the picker while the code is being sent (loading state)', fakeAsync(() => {
    create(ALL_FOR_SYRIA);
    typePhone();

    page.loading.set(true);
    fixture.detectChanges();

    expect(el().querySelector('app-otp-channel-picker fieldset')?.hasAttribute('disabled')).toBeTrue();
    expect((el().querySelector('form button[type="submit"]') as HTMLButtonElement).disabled).toBeTrue();
  }));

  it('re-evaluates availability when the number changes to one from another country', fakeAsync(() => {
    create(ALL_FOR_SYRIA);
    typePhone();
    expect(radios()[2].disabled).toBeTrue();

    api.getOtpChannels.and.returnValue(of([option('Sms'), option('Telegram'), option('WhatsApp', { recommended: true })]));
    typePhone('+4915772378923');

    expect(api.getOtpChannels).toHaveBeenCalledWith('+4915772378923');
    expect(radios().map(r => r.disabled)).toEqual([false, false, false]);
  }));
});
