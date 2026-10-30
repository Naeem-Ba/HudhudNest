import { Capacitor } from '@capacitor/core';
import { environment } from '../../../environments/environment';
import { TranslateService } from '@ngx-translate/core';

import { AuthApiService } from './auth-api.service';
import { SocialAuthService } from './social-auth.service';

describe('SocialAuthService.getSocialErrorMessage', () => {
  // instant() echoes the key, which is enough to tell messages apart.
  const translate = { instant: (key: string) => key } as unknown as TranslateService;
  const service = new SocialAuthService({} as AuthApiService, translate);

  it('shows the translated server-error text for a 5xx, not the API generic English sentence', () => {
    expect(service.getSocialErrorMessage({
      status: 500,
      error: { title: 'Internal Server Error', status: 500, message: 'An unexpected error occurred. Please try again later.' }
    })).toBe('AUTH.ERRORS.SOCIAL_SERVER_ERROR');
    expect(service.getSocialErrorMessage({ status: 503 })).toBe('AUTH.ERRORS.SOCIAL_SERVER_ERROR');
  });

  it('still shows the message of a rejected request, which is written for the person', () => {
    expect(service.getSocialErrorMessage({ status: 400, error: { message: 'Token audience mismatch.' } }))
      .toBe('Token audience mismatch.');
  });

  it('falls back to the status-based keys', () => {
    expect(service.getSocialErrorMessage({ status: 401 })).toBe('AUTH.ERRORS.SOCIAL_TOKEN_REJECTED');
    expect(service.getSocialErrorMessage({})).toBe('AUTH.ERRORS.SOCIAL_GENERIC_FAILED');
  });
});

describe('SocialAuthService.isAppleAvailable (launch audit A7-001)', () => {
  const translate = { instant: (key: string) => key } as unknown as TranslateService;
  const service = new SocialAuthService({} as AuthApiService, translate);

  it('is never offered on the Android app, where the Apple plugin has no implementation', () => {
    spyOn(Capacitor, 'getPlatform').and.returnValue('android');
    expect(service.isAppleAvailable).toBeFalse();
  });

  it('follows the configured client id on the web', () => {
    spyOn(Capacitor, 'getPlatform').and.returnValue('web');
    expect(service.isAppleAvailable).toBe(Boolean(environment.appleClientId?.trim()));
  });
});
