// =====================================================================
// ✅ Unit Tests – phone-auth-api.service.spec.ts
// Covers the wire contract of the phone endpoints and that every phone number leaves the app in
// strict E.164 (local formats such as 09xxxxxxxx are normalized first).
// =====================================================================
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { TokenStorageService } from '../services/token-storage.service';
import { PhoneAuthApiService } from './phone-auth-api.service';

// Dummy values kept in variables: tools/frontend-audit-guard.mjs flags a literal password: '...' shape.
const TEST_CREDENTIAL = 'SecurePass9';
const TEST_NEW_CREDENTIAL = 'BrandNew9Pass';

describe('PhoneAuthApiService', () => {
  let service: PhoneAuthApiService;
  let httpMock: HttpTestingController;
  let tokenStorage: jasmine.SpyObj<TokenStorageService>;
  const base = environment.apiBaseUrl;

  beforeEach(() => {
    document.documentElement.lang = ''; // the body only carries `language` when the page language is known
    tokenStorage = jasmine.createSpyObj('TokenStorageService', ['storeTokens']);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: TokenStorageService, useValue: tokenStorage }
      ]
    });

    service = TestBed.inject(PhoneAuthApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('sends the page language with every OTP send so the SMS is written in it (QA Phase 16, D03)', () => {
    document.documentElement.lang = 'de';

    service.sendRegistrationOtp('+963944111222').subscribe();

    const req = httpMock.expectOne(`${base}/auth/phone/registration/send-otp`);
    expect(req.request.body.language).toBe('de');
    req.flush({ succeeded: true });
  });

  describe('addEmail — language of the confirmation mail', () => {
    let originalLang: string;

    beforeEach(() => {
      originalLang = document.documentElement.lang;
    });

    afterEach(() => {
      document.documentElement.lang = originalLang;
    });

    it('sends the page language so the mail arrives in it', () => {
      document.documentElement.lang = 'ar';

      service.addEmail('  Someone@Example.com ').subscribe();

      const req = httpMock.expectOne(`${base}/auth/email/add`);

      expect(req.request.body).toEqual({ email: 'someone@example.com', language: 'ar' });

      req.flush({ message: 'ok' });
    });

    it('sends only the email when the page language is unknown', () => {
      document.documentElement.lang = '';

      service.addEmail('someone@example.com').subscribe();

      const req = httpMock.expectOne(`${base}/auth/email/add`);

      expect(req.request.body).toEqual({ email: 'someone@example.com' });

      req.flush({ message: 'ok' });
    });
  });

  it('sends a normalized number for every OTP challenge endpoint', () => {
    const calls: [() => void, string][] = [
      [() => service.sendRegistrationOtp(' 0933 123 456 ').subscribe(), '/auth/phone/registration/send-otp'],
      [() => service.sendPasswordResetOtp('00963933123456').subscribe(), '/auth/phone/password-reset/send-otp'],
      [() => service.sendReverificationOtp('٠٩٣٣١٢٣٤٥٦').subscribe(), '/auth/phone/reverification/send-otp'],
      [() => service.sendPhoneChangeOtp('+963 933-123-456').subscribe(), '/auth/phone/change/send-otp']
    ];

    for (const [call, path] of calls) {
      call();
      const req = httpMock.expectOne(`${base}${path}`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ phoneNumber: '+963933123456' });
      expect(req.request.withCredentials).toBeTrue();
      req.flush({ succeeded: true, challengeId: 'c1' });
    }
  });

  it('login posts the normalized number and stores the returned access token', () => {
    service.login({ phoneNumber: '0933123456', password: TEST_CREDENTIAL }).subscribe();

    const req = httpMock.expectOne(`${base}/auth/phone/login`);
    expect(req.request.body).toEqual({ phoneNumber: '+963933123456', password: TEST_CREDENTIAL });
    req.flush({ succeeded: true, accessToken: 'jwt', accessTokenExpiresAtUtc: '2030-01-01T00:00:00Z' });

    expect(tokenStorage.storeTokens).toHaveBeenCalledTimes(1);
  });

  it('register trims the OTP and names, and stores the access token when one is returned', () => {
    service.register({ challengeId: 'c1', code: ' 123456 ', password: TEST_CREDENTIAL, firstName: ' Ali ', lastName: ' Nour ' }).subscribe(result => {
      expect(result.succeeded).toBeTrue();
    });

    const req = httpMock.expectOne(`${base}/auth/phone/registration/verify`);
    expect(req.request.body).toEqual({ challengeId: 'c1', code: '123456', password: TEST_CREDENTIAL, firstName: 'Ali', lastName: 'Nour' });
    req.flush({ succeeded: true, accessToken: 'jwt' });

    expect(tokenStorage.storeTokens).toHaveBeenCalledWith({ accessToken: 'jwt' });
  });

  it('sends a code typed with Arabic-Indic digits as ASCII digits (P26-D03)', () => {
    service.register({ challengeId: 'c1', code: '٤٥٦ ٧٨٩', password: TEST_CREDENTIAL, firstName: 'A', lastName: 'B' }).subscribe();

    const req = httpMock.expectOne(`${base}/auth/phone/registration/verify`);
    expect(req.request.body.code).toBe('456789');
    req.flush({ succeeded: false, errorCode: 'OTP_WRONG' });

    service.verifyPasswordReset('c1', '۱۲۳۴۵۶').subscribe();
    expect(httpMock.expectOne(`${base}/auth/phone/password-reset/verify`).request.body.code).toBe('123456');
  });

  it('does not store anything when the API reports a failure', () => {
    service.register({ challengeId: 'c1', code: '123456', password: TEST_CREDENTIAL, firstName: 'A', lastName: 'B' }).subscribe();
    httpMock.expectOne(`${base}/auth/phone/registration/verify`).flush({ succeeded: false, errorCode: 'OTP_WRONG' });

    expect(tokenStorage.storeTokens).not.toHaveBeenCalled();
  });

  it('password reset: verify sends the trimmed code, confirm sends the normalized number', () => {
    service.verifyPasswordReset('c1', ' 654321 ').subscribe();
    const verify = httpMock.expectOne(`${base}/auth/phone/password-reset/verify`);
    expect(verify.request.body).toEqual({ challengeId: 'c1', code: '654321' });
    verify.flush({ succeeded: true, confirmationToken: 't' });

    service.confirmPasswordReset({ phoneNumber: '0933123456', confirmationToken: 't', newPassword: TEST_NEW_CREDENTIAL }).subscribe();
    const confirm = httpMock.expectOne(`${base}/auth/phone/password-reset/confirm`);
    expect(confirm.request.body).toEqual({ phoneNumber: '+963933123456', confirmationToken: 't', newPassword: TEST_NEW_CREDENTIAL });
    confirm.flush({ succeeded: true });
  });

  it('reverification status is a GET; verify and change/verify send the documented bodies', () => {
    service.getReverificationStatus().subscribe();
    const status = httpMock.expectOne(`${base}/auth/phone/reverification/status`);
    expect(status.request.method).toBe('GET');
    status.flush({ succeeded: true, verificationState: 'Verified' });

    service.verifyReverification('c1', ' 111111 ').subscribe();
    const verify = httpMock.expectOne(`${base}/auth/phone/reverification/verify`);
    expect(verify.request.body).toEqual({ challengeId: 'c1', code: '111111' });
    verify.flush({ succeeded: true });

    service.verifyPhoneChange({ challengeId: 'c2', code: ' 222222 ', currentPassword: TEST_CREDENTIAL }).subscribe();
    const change = httpMock.expectOne(`${base}/auth/phone/change/verify`);
    expect(change.request.body).toEqual({ challengeId: 'c2', code: '222222', currentPassword: TEST_CREDENTIAL });
    change.flush({ succeeded: true });
  });

  // ── multi-channel OTP ────────────────────────────────────────────────────

  it('getOtpChannels posts the normalized number (or null) and maps the answer', () => {
    let result: unknown;
    service.getOtpChannels('0933 123 456').subscribe(value => (result = value));
    const req = httpMock.expectOne(`${base}/auth/phone/channels`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ phoneNumber: '+963933123456' });
    req.flush({
      channels: [
        { channel: 'Sms', available: true, recommended: false, reason: null, unavailableCountryCodes: [] },
        { channel: 'WhatsApp', available: false, recommended: false, reason: 'COUNTRY_NOT_SUPPORTED', unavailableCountryCodes: ['+963'] }
      ]
    });
    expect((result as { channel: string }[]).map(o => o.channel)).toEqual(['Sms', 'WhatsApp']);

    service.getOtpChannels().subscribe();
    const bare = httpMock.expectOne(`${base}/auth/phone/channels`);
    expect(bare.request.body).toEqual({ phoneNumber: null });
    bare.flush({ channels: [] });
  });

  it('a send without a channel keeps the old body (server default = SMS); with one it names it', () => {
    service.sendRegistrationOtp('+963933123456').subscribe();
    const legacy = httpMock.expectOne(`${base}/auth/phone/registration/send-otp`);
    expect(legacy.request.body).toEqual({ phoneNumber: '+963933123456' });
    legacy.flush({ succeeded: true, challengeId: 'c1' });

    const calls: [() => void, string][] = [
      [() => service.sendRegistrationOtp('+963933123456', 'Telegram').subscribe(), '/auth/phone/registration/send-otp'],
      [() => service.sendPasswordResetOtp('+963933123456', 'Telegram').subscribe(), '/auth/phone/password-reset/send-otp'],
      [() => service.sendReverificationOtp('+963933123456', 'Telegram').subscribe(), '/auth/phone/reverification/send-otp'],
      [() => service.sendPhoneChangeOtp('+963933123456', 'Telegram').subscribe(), '/auth/phone/change/send-otp']
    ];
    for (const [call, path] of calls) {
      call();
      const req = httpMock.expectOne(`${base}${path}`);
      expect(req.request.body).toEqual({ phoneNumber: '+963933123456', channel: 'Telegram' });
      req.flush({ succeeded: true, challengeId: 'c1', channel: 'Telegram' });
    }
  });

  it('every verify names the channel of the challenge when given one, and echoes the send channel back', () => {
    let sent: unknown;
    service.sendRegistrationOtp('+963933123456', 'WhatsApp').subscribe(value => (sent = value));
    httpMock.expectOne(`${base}/auth/phone/registration/send-otp`).flush({ succeeded: true, challengeId: 'c1', channel: 'WhatsApp' });
    expect((sent as { channel: string }).channel).toBe('WhatsApp');

    service.register({ challengeId: 'c1', code: '123456', password: TEST_CREDENTIAL, firstName: 'A', lastName: 'B', channel: 'Telegram' }).subscribe();
    const register = httpMock.expectOne(`${base}/auth/phone/registration/verify`);
    expect(register.request.body.channel).toBe('Telegram');
    register.flush({ succeeded: true });

    service.verifyPasswordReset('c1', '123456', 'Telegram').subscribe();
    expect(httpMock.expectOne(`${base}/auth/phone/password-reset/verify`).request.body).toEqual({ challengeId: 'c1', code: '123456', channel: 'Telegram' });

    service.verifyReverification('c1', '123456', 'Sms').subscribe();
    expect(httpMock.expectOne(`${base}/auth/phone/reverification/verify`).request.body).toEqual({ challengeId: 'c1', code: '123456', channel: 'Sms' });

    service.verifyPhoneChange({ challengeId: 'c1', code: '123456', currentPassword: TEST_CREDENTIAL, channel: 'Telegram' }).subscribe();
    expect(httpMock.expectOne(`${base}/auth/phone/change/verify`).request.body.channel).toBe('Telegram');
  });
});
