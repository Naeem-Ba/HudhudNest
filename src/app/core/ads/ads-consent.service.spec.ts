import { TestBed } from '@angular/core/testing';

import { ADS_DISABLED } from '../../../environments/environment.model';
import { ADS_ENVIRONMENT, ADS_PLATFORM } from './ads-config.service';
import { ADS_CONSENT_STORAGE_KEY, AdsConsentService } from './ads-consent.service';
import { AdPlatform } from './ads.model';
import { NativeConsentInfo } from './admob.gateway';

function create(platform: AdPlatform = 'web', enabled = true): AdsConsentService {
  TestBed.configureTestingModule({
    providers: [
      { provide: ADS_ENVIRONMENT, useValue: { ...ADS_DISABLED, enabled, webEnabled: enabled, androidEnabled: enabled } },
      { provide: ADS_PLATFORM, useValue: platform }
    ]
  });
  return TestBed.inject(AdsConsentService);
}

const info = (patch: Partial<NativeConsentInfo>): NativeConsentInfo => ({
  status: 'UNKNOWN',
  canRequestAds: false,
  isConsentFormAvailable: false,
  privacyOptionsRequired: false,
  ...patch
});

describe('AdsConsentService', () => {
  beforeEach(() => localStorage.removeItem(ADS_CONSENT_STORAGE_KEY));
  afterEach(() => localStorage.removeItem(ADS_CONSENT_STORAGE_KEY));

  it('starts unknown: no choice means no ads', () => {
    const c = create();
    expect(c.state()).toBe('unknown');
    expect(c.canRequestAds()).toBeFalse();
    expect(c.showWebPrompt()).toBeTrue();
  });

  it('does not prompt at all while ads are off', () => {
    const c = create('web', false);
    expect(c.showWebPrompt()).toBeFalse();
    expect(c.canManageChoices()).toBeFalse();
  });

  it('grant allows ads and is remembered; withdrawing stops them at once', () => {
    let c = create();
    c.grant();
    expect(c.canRequestAds()).toBeTrue();
    expect(c.showWebPrompt()).toBeFalse();
    TestBed.resetTestingModule();
    c = create();
    expect(c.state()).toBe('granted');
    c.reopen();
    expect(c.showWebPrompt()).toBeTrue();
    c.deny();
    expect(c.canRequestAds()).toBeFalse();
    expect(c.state()).toBe('denied');
    expect(c.showWebPrompt()).toBeFalse();
  });

  it('a decline is remembered across reloads', () => {
    create().deny();
    TestBed.resetTestingModule();
    expect(create().state()).toBe('denied');
  });

  it('ignores corrupt or foreign stored values', () => {
    localStorage.setItem(ADS_CONSENT_STORAGE_KEY, '{"v":2,"choice":"granted"}');
    expect(create().state()).toBe('unknown');
    TestBed.resetTestingModule();
    localStorage.setItem(ADS_CONSENT_STORAGE_KEY, 'not json');
    expect(create().state()).toBe('unknown');
  });

  it('still works for the page session when storage is blocked', () => {
    spyOn(Storage.prototype, 'setItem').and.throwError('blocked');
    const c = create();
    c.grant();
    expect(c.state()).toBe('granted');
  });

  it('native ignores any value left in web storage and follows UMP', () => {
    localStorage.setItem(ADS_CONSENT_STORAGE_KEY, JSON.stringify({ v: 1, choice: 'granted' }));
    const c = create('android');
    expect(c.state()).toBe('unknown');
    c.applyNative(info({ status: 'OBTAINED', canRequestAds: true, privacyOptionsRequired: true }));
    expect(c.canRequestAds()).toBeTrue();
    expect(c.canManageChoices()).toBeTrue();
    c.applyNative(info({ status: 'REQUIRED', canRequestAds: false }));
    expect(c.state()).toBe('denied');
    c.applyNative(info({ status: 'NOT_REQUIRED', canRequestAds: true }));
    expect(c.state()).toBe('not-required');
    expect(c.canRequestAds()).toBeTrue();
  });
});
