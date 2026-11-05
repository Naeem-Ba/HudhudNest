import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';

import { ADS_DISABLED, AdsEnvironment } from '../../../environments/environment.model';
import { ADS_DEV_BUILD, ADS_ENVIRONMENT, ADS_PLATFORM } from './ads-config.service';
import { ADS_CONSENT_STORAGE_KEY } from './ads-consent.service';
import { AdsService } from './ads.service';
import { AdMobGateway, NativeConsentInfo } from './admob.gateway';
import { AdSenseLoaderService } from './adsense-loader.service';
import { AdPlatform } from './ads.model';

const WEB_ON: Partial<AdsEnvironment> = {
  enabled: true,
  webEnabled: true,
  adsensePublisherId: 'ca-pub-1234567890123456',
  adsenseSlotSearch: '1234567890'
};

function setup(env: Partial<AdsEnvironment>, platform: AdPlatform, extra: unknown[] = [], dev = false): AdsService {
  TestBed.configureTestingModule({
    providers: [
      { provide: ADS_ENVIRONMENT, useValue: { ...ADS_DISABLED, ...env } },
      { provide: ADS_PLATFORM, useValue: platform },
      { provide: ADS_DEV_BUILD, useValue: dev },
      ...(extra as never[])
    ]
  });
  return TestBed.inject(AdsService);
}

describe('AdsService', () => {
  beforeEach(() => localStorage.removeItem(ADS_CONSENT_STORAGE_KEY));
  afterEach(() => localStorage.removeItem(ADS_CONSENT_STORAGE_KEY));

  it('production default: ads are off and say why', () => {
    const ads = setup({}, 'web');
    expect(ads.decision(() => 'search-results', () => '/properties')()).toEqual({ allowed: false, reason: 'master-disabled' });
  });

  it('ids missing blocks even with every switch on and consent granted', () => {
    const ads = setup({ enabled: true, webEnabled: true }, 'web');
    ads.consent.grant();
    expect(ads.decision(() => 'search-results', () => '/properties')().reason).toBe('missing-ids');
  });

  it('web: consent is required, and withdrawing it blocks again', () => {
    const ads = setup(WEB_ON, 'web');
    const d = ads.decision(() => 'search-results', () => '/properties');
    expect(d().reason).toBe('consent-unknown');
    ads.consent.grant();
    expect(d().allowed).toBeTrue();
    ads.consent.deny();
    expect(d().reason).toBe('consent-denied');
  });

  it('goes offline → blocked; back online → allowed again', () => {
    const ads = setup(WEB_ON, 'web');
    ads.consent.grant();
    const d = ads.decision(() => 'search-results', () => '/properties');
    window.dispatchEvent(new Event('offline'));
    expect(d().reason).toBe('offline');
    window.dispatchEvent(new Event('online'));
    expect(d().allowed).toBeTrue();
  });

  it('a failed AdSense load blocks further requests for the session without throwing', async () => {
    const loader = { load: jasmine.createSpy('load').and.resolveTo(false) };
    const ads = setup(WEB_ON, 'web', [{ provide: AdSenseLoaderService, useValue: loader }]);
    ads.consent.grant();
    const d = ads.decision(() => 'search-results', () => '/properties');
    expect(await ads.ensureWebLibrary()).toBeFalse();
    expect(d().reason).toBe('load-failed');
    await ads.ensureWebLibrary();
    expect(loader.load).toHaveBeenCalledTimes(1);
    expect(ads.metrics.counts()['load-failed']).toBe(1);
  });

  it('loads the library once however many callers ask', async () => {
    const loader = { load: jasmine.createSpy('load').and.resolveTo(true) };
    const ads = setup(WEB_ON, 'web', [{ provide: AdSenseLoaderService, useValue: loader }]);
    await Promise.all([ads.ensureWebLibrary(), ads.ensureWebLibrary(), ads.ensureWebLibrary()]);
    expect(loader.load).toHaveBeenCalledOnceWith('ca-pub-1234567890123456');
  });

  describe('native', () => {
    const NATIVE_ON: Partial<AdsEnvironment> = { enabled: true, androidEnabled: true };
    const info = (patch: Partial<NativeConsentInfo>): NativeConsentInfo => ({
      status: 'OBTAINED',
      canRequestAds: true,
      isConsentFormAvailable: true,
      privacyOptionsRequired: false,
      ...patch
    });
    function gateway(first: NativeConsentInfo, afterForm?: NativeConsentInfo) {
      return jasmine.createSpyObj<AdMobGateway>('AdMobGateway', {
        requestConsentInfo: Promise.resolve(first),
        showConsentForm: Promise.resolve(afterForm ?? first),
        showPrivacyOptionsForm: Promise.resolve(),
        initialize: Promise.resolve(),
        showBanner: Promise.resolve(),
        hideBanner: Promise.resolve()
      });
    }

    it('shows the UMP form when required, and initialises the SDK only after consent allows requests', async () => {
      const g = gateway(info({ status: 'REQUIRED', canRequestAds: false }), info({}));
      const ads = setup(NATIVE_ON, 'android', [{ provide: AdMobGateway, useValue: g }], true);
      expect(await ads.ensureNativeConsent()).toBeTrue();
      expect(g.showConsentForm).toHaveBeenCalledTimes(1);
      expect(g.initialize).toHaveBeenCalledOnceWith(true);
      expect(ads.consent.canRequestAds()).toBeTrue();
    });

    it('never initialises the SDK when consent refuses requests', async () => {
      const g = gateway(info({ status: 'REQUIRED', canRequestAds: false, isConsentFormAvailable: false }));
      const ads = setup(NATIVE_ON, 'android', [{ provide: AdMobGateway, useValue: g }], true);
      expect(await ads.ensureNativeConsent()).toBeFalse();
      expect(g.initialize).not.toHaveBeenCalled();
      expect(ads.consent.state()).toBe('denied');
    });

    it('runs the consent flow once per session', async () => {
      const g = gateway(info({}));
      const ads = setup(NATIVE_ON, 'android', [{ provide: AdMobGateway, useValue: g }], true);
      await Promise.all([ads.ensureNativeConsent(), ads.ensureNativeConsent()]);
      expect(g.requestConsentInfo).toHaveBeenCalledTimes(1);
    });

    it('an SDK failure is contained: no throw, ads just stay off', async () => {
      const g = gateway(info({}));
      g.requestConsentInfo.and.rejectWith(new Error('sdk down'));
      const ads = setup(NATIVE_ON, 'android', [{ provide: AdMobGateway, useValue: g }], true);
      expect(await ads.ensureNativeConsent()).toBeFalse();
      expect(ads.decision(() => 'search-results', () => '/properties')().allowed).toBeFalse();
    });

    it('shows the banner once and hides it', async () => {
      const g = gateway(info({}));
      const ads = setup(NATIVE_ON, 'android', [{ provide: AdMobGateway, useValue: g }], true);
      await ads.showNativeBanner();
      await ads.showNativeBanner();
      expect(g.showBanner).toHaveBeenCalledTimes(1);
      expect(g.showBanner.calls.mostRecent().args[0]).toBe('ca-app-pub-3940256099942544/6300978111');
      await ads.hideNativeBanner();
      expect(g.hideBanner).toHaveBeenCalledTimes(1);
    });

    it('a banner failure does not throw', async () => {
      const g = gateway(info({}));
      g.showBanner.and.rejectWith(new Error('no fill'));
      const ads = setup(NATIVE_ON, 'android', [{ provide: AdMobGateway, useValue: g }], true);
      await expectAsync(ads.showNativeBanner()).toBeResolved();
      expect(ads.metrics.counts()['load-failed']).toBe(1);
    });

    it('privacy options reopen the form and withdraw hides the banner', async () => {
      const g = gateway(info({}));
      const ads = setup(NATIVE_ON, 'android', [{ provide: AdMobGateway, useValue: g }], true);
      await ads.showNativeBanner();
      g.requestConsentInfo.and.resolveTo(info({ status: 'REQUIRED', canRequestAds: false }));
      await ads.openAdChoices();
      expect(g.showPrivacyOptionsForm).toHaveBeenCalled();
      expect(ads.consent.canRequestAds()).toBeFalse();
      expect(g.hideBanner).toHaveBeenCalled();
    });
  });
});

describe('AdSenseLoaderService', () => {
  afterEach(() => document.querySelectorAll('script[data-hn-adsense]').forEach(s => s.remove()));

  it('adds exactly one script for the whole session and resolves false on error', async () => {
    TestBed.configureTestingModule({});
    const loader = TestBed.inject(AdSenseLoaderService);
    const doc = TestBed.inject(DOCUMENT);
    const append = spyOn(doc.head, 'appendChild').and.callFake(<T extends Node>(node: T) => {
      queueMicrotask(() => (node as unknown as HTMLScriptElement).onerror?.(new Event('error')));
      return node;
    });
    const results = await Promise.all([loader.load('ca-pub-1234567890123456'), loader.load('ca-pub-1234567890123456')]);
    expect(results).toEqual([false, false]);
    expect(append).toHaveBeenCalledTimes(1);
    expect((append.calls.mostRecent().args[0] as HTMLScriptElement).src).toContain('client=ca-pub-1234567890123456');
  });
});
