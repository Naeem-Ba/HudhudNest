import { TestBed } from '@angular/core/testing';

import { AdsEnvironment, ADS_DISABLED } from '../../../environments/environment.model';
import { ADS_DEV_BUILD, ADS_ENVIRONMENT, ADS_PLATFORM, AdsConfigService } from './ads-config.service';
import { AdPlatform, GOOGLE_TEST_ADMOB_BANNER } from './ads.model';

function configure(env: Partial<AdsEnvironment>, platform: AdPlatform, dev = false): AdsConfigService {
  TestBed.configureTestingModule({
    providers: [
      { provide: ADS_ENVIRONMENT, useValue: { ...ADS_DISABLED, ...env } },
      { provide: ADS_PLATFORM, useValue: platform },
      { provide: ADS_DEV_BUILD, useValue: dev }
    ]
  });
  return TestBed.inject(AdsConfigService);
}

describe('AdsConfigService', () => {
  it('is disabled by default on every platform', () => {
    for (const platform of ['web', 'android', 'ios'] as AdPlatform[]) {
      TestBed.resetTestingModule();
      const cfg = configure({}, platform);
      expect(cfg.masterEnabled).toBeFalse();
      expect(cfg.platformEnabled).toBeFalse();
      expect(cfg.idsPresent('search-results')).toBeFalse();
    }
  });

  it('keeps the three platform flags independent', () => {
    const cfg = configure({ enabled: true, androidEnabled: true }, 'web');
    expect(cfg.masterEnabled).toBeTrue();
    expect(cfg.platformEnabled).toBeFalse();
  });

  it('accepts only well-formed AdSense publisher and slot ids and never invents one', () => {
    const bad = configure({ adsensePublisherId: 'pub-123', adsenseSlotSearch: 'abc' }, 'web');
    expect(bad.publisherId).toBe('');
    expect(bad.adsenseSlot('search-results')).toBe('');
    TestBed.resetTestingModule();
    const good = configure(
      { adsensePublisherId: 'ca-pub-1234567890123456', adsenseSlotSearch: '1234567890', adsenseSlotDetail: '' },
      'web'
    );
    expect(good.idsPresent('search-results')).toBeTrue();
    expect(good.idsPresent('property-detail')).toBeFalse();
  });

  it('a local dev build falls back to Google test units; production/staging never do', () => {
    const dev = configure({}, 'android', true);
    expect(dev.admobUnit()).toBe(GOOGLE_TEST_ADMOB_BANNER.android);
    TestBed.resetTestingModule();
    const prod = configure({}, 'android', false);
    expect(prod.admobUnit()).toBe('');
    expect(prod.idsPresent('search-results')).toBeFalse();
  });

  it('a production build rejects a Google test unit that was configured by mistake', () => {
    const prod = configure({ admobBannerIos: GOOGLE_TEST_ADMOB_BANNER.ios }, 'ios', false);
    expect(prod.admobUnit()).toBe('');
  });

  it('a production build accepts a well-formed real unit', () => {
    const prod = configure({ admobBannerAndroid: 'ca-app-pub-1111222233334444/5555666677' }, 'android', false);
    expect(prod.admobUnit()).toBe('ca-app-pub-1111222233334444/5555666677');
  });

  it('web never gets an AdMob unit', () => {
    expect(configure({ admobBannerAndroid: 'ca-app-pub-1111222233334444/5555666677' }, 'web', true).admobUnit()).toBe('');
  });
});
