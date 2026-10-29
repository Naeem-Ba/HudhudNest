import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { ADS_DISABLED, AdsEnvironment } from '../../../environments/environment.model';
import { AdSlotComponent } from './ad-slot.component';
import { ADS_DEV_BUILD, ADS_ENVIRONMENT, ADS_PLATFORM } from './ads-config.service';
import { ADS_CONSENT_STORAGE_KEY } from './ads-consent.service';
import { AdsService } from './ads.service';
import { AdMobGateway } from './admob.gateway';
import { AdSenseLoaderService } from './adsense-loader.service';
import { AdPlacement, AdPlatform } from './ads.model';

@Component({
  standalone: true,
  imports: [AdSlotComponent],
  template: `<p id="before">content</p><app-ad-slot [placement]="placement" /><p id="after">after</p>`
})
class HostComponent {
  placement: AdPlacement = 'search-results';
}

const WEB_ON: Partial<AdsEnvironment> = {
  enabled: true,
  webEnabled: true,
  adsensePublisherId: 'ca-pub-1234567890123456',
  adsenseSlotSearch: '1234567890',
  adsenseSlotDetail: '1234567891'
};

describe('AdSlotComponent', () => {
  let loader: { load: jasmine.Spy };
  let routerUrl: string;
  let queue: unknown[] & { requestNonPersonalizedAds?: number };

  function render(env: Partial<AdsEnvironment>, platform: AdPlatform = 'web', extra: unknown[] = []): ComponentFixture<HostComponent> {
    TestBed.configureTestingModule({
      imports: [HostComponent, TranslateModule.forRoot()],
      providers: [
        { provide: ADS_ENVIRONMENT, useValue: { ...ADS_DISABLED, ...env } },
        { provide: ADS_PLATFORM, useValue: platform },
        { provide: ADS_DEV_BUILD, useValue: true },
        { provide: AdSenseLoaderService, useValue: loader },
        { provide: Router, useValue: { get url() { return routerUrl; } } },
        ...(extra as never[])
      ]
    });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return fixture;
  }

  const slot = (f: ComponentFixture<HostComponent>) => f.nativeElement.querySelector('app-ad-slot') as HTMLElement;
  const settle = async (f: ComponentFixture<HostComponent>) => {
    for (let i = 0; i < 4; i++) {
      await f.whenStable();
      f.detectChanges();
    }
  };

  beforeEach(() => {
    localStorage.removeItem(ADS_CONSENT_STORAGE_KEY);
    loader = { load: jasmine.createSpy('load').and.resolveTo(true) };
    routerUrl = '/properties?page=1';
    queue = [];
    (window as unknown as { adsbygoogle: unknown }).adsbygoogle = queue;
  });
  afterEach(() => {
    localStorage.removeItem(ADS_CONSENT_STORAGE_KEY);
    delete (window as unknown as { adsbygoogle?: unknown }).adsbygoogle;
  });

  it('renders nothing and requests nothing with the default (disabled) configuration', async () => {
    const f = render({});
    await settle(f);
    expect(slot(f).children.length).toBe(0);
    expect(loader.load).not.toHaveBeenCalled();
    expect(queue.length).toBe(0);
    expect(f.nativeElement.querySelector('#before')).toBeTruthy();
    expect(f.nativeElement.querySelector('#after')).toBeTruthy();
  });

  it('with ads on but no consent yet: renders nothing and never touches the provider', async () => {
    const f = render(WEB_ON);
    await settle(f);
    expect(slot(f).children.length).toBe(0);
    expect(loader.load).not.toHaveBeenCalled();
  });

  it('with consent: a labelled slot, one library load and exactly one non-personalised request', async () => {
    localStorage.setItem(ADS_CONSENT_STORAGE_KEY, JSON.stringify({ v: 1, choice: 'granted' }));
    const f = render(WEB_ON);
    await settle(f);
    expect(slot(f).querySelector('.ad-slot__label')?.textContent).toContain('ADS.LABEL');
    expect(slot(f).querySelectorAll('ins.adsbygoogle').length).toBe(1);
    const ins = slot(f).querySelector('ins.adsbygoogle')!;
    expect(ins.getAttribute('data-ad-client')).toBe('ca-pub-1234567890123456');
    expect(ins.getAttribute('data-ad-slot')).toBe('1234567890');
    expect(ins.getAttribute('data-adtest')).toBe('on');
    expect(queue.length).toBe(1);
    expect(queue.requestNonPersonalizedAds).toBe(1);
    expect(loader.load).toHaveBeenCalledTimes(1);
  });

  it('does not duplicate the request on re-render or when the language changes', async () => {
    localStorage.setItem(ADS_CONSENT_STORAGE_KEY, JSON.stringify({ v: 1, choice: 'granted' }));
    const f = render(WEB_ON);
    await settle(f);
    const translate = TestBed.inject(TranslateService);
    for (const lang of ['de', 'en', 'ar']) {
      translate.use(lang);
      f.detectChanges();
    }
    f.componentInstance.placement = 'search-results';
    await settle(f);
    expect(slot(f).querySelectorAll('ins.adsbygoogle').length).toBe(1);
    expect(queue.length).toBe(1);
  });

  it('withdrawing consent removes the ad and stops requests', async () => {
    localStorage.setItem(ADS_CONSENT_STORAGE_KEY, JSON.stringify({ v: 1, choice: 'granted' }));
    const f = render(WEB_ON);
    await settle(f);
    TestBed.inject(AdsService).consent.deny();
    await settle(f);
    expect(slot(f).children.length).toBe(0);
    expect(queue.length).toBe(1);
  });

  it('stays hidden on routes that are not the placement page', async () => {
    localStorage.setItem(ADS_CONSENT_STORAGE_KEY, JSON.stringify({ v: 1, choice: 'granted' }));
    routerUrl = '/auth/login';
    const f = render(WEB_ON);
    await settle(f);
    expect(slot(f).children.length).toBe(0);
    expect(loader.load).not.toHaveBeenCalled();
  });

  it('property-detail uses its own slot id', async () => {
    localStorage.setItem(ADS_CONSENT_STORAGE_KEY, JSON.stringify({ v: 1, choice: 'granted' }));
    routerUrl = '/properties/42';
    TestBed.configureTestingModule({});
    const f = render(WEB_ON);
    f.componentInstance.placement = 'property-detail';
    f.changeDetectorRef.markForCheck();
    f.detectChanges();
    await settle(f);
    expect(slot(f).querySelector('ins')?.getAttribute('data-ad-slot')).toBe('1234567891');
  });

  it('the page keeps working when the ad library fails to load (blocker, outage)', async () => {
    loader.load.and.resolveTo(false);
    localStorage.setItem(ADS_CONSENT_STORAGE_KEY, JSON.stringify({ v: 1, choice: 'granted' }));
    const f = render(WEB_ON);
    await settle(f);
    expect(slot(f).querySelector('ins')).toBeNull();
    expect(queue.length).toBe(0);
    expect(f.nativeElement.querySelector('#after')).toBeTruthy();
  });

  it('collapses when Google reports the slot unfilled', async () => {
    localStorage.setItem(ADS_CONSENT_STORAGE_KEY, JSON.stringify({ v: 1, choice: 'granted' }));
    const f = render(WEB_ON);
    await settle(f);
    slot(f).querySelector('ins')!.setAttribute('data-ad-status', 'unfilled');
    await new Promise(r => setTimeout(r));
    await settle(f);
    expect(slot(f).children.length).toBe(0);
    expect(TestBed.inject(AdsService).metrics.counts().unfilled).toBe(1);
  });

  it('offline: no request is made', async () => {
    localStorage.setItem(ADS_CONSENT_STORAGE_KEY, JSON.stringify({ v: 1, choice: 'granted' }));
    spyOnProperty(navigator, 'onLine').and.returnValue(false);
    const f = render(WEB_ON);
    await settle(f);
    expect(loader.load).not.toHaveBeenCalled();
    expect(slot(f).children.length).toBe(0);
  });

  describe('native', () => {
    class FakeObserver {
      static last?: FakeObserver;
      constructor(public cb: (e: Partial<IntersectionObserverEntry>[]) => void) { FakeObserver.last = this; }
      observe(): void {}
      disconnect(): void {}
    }
    let original: typeof IntersectionObserver;
    let gateway: jasmine.SpyObj<AdMobGateway>;

    beforeEach(() => {
      original = window.IntersectionObserver;
      (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = FakeObserver;
      gateway = jasmine.createSpyObj<AdMobGateway>('AdMobGateway', {
        requestConsentInfo: Promise.resolve({ status: 'OBTAINED', canRequestAds: true, isConsentFormAvailable: false, privacyOptionsRequired: false }),
        showConsentForm: Promise.resolve({ status: 'OBTAINED', canRequestAds: true, isConsentFormAvailable: false, privacyOptionsRequired: false }),
        showPrivacyOptionsForm: Promise.resolve(),
        initialize: Promise.resolve(),
        showBanner: Promise.resolve(),
        hideBanner: Promise.resolve()
      });
    });
    afterEach(() => ((window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = original));

    it('runs consent first, then shows the overlay only while the placeholder is on screen', async () => {
      const f = render({ enabled: true, androidEnabled: true }, 'android', [{ provide: AdMobGateway, useValue: gateway }]);
      await settle(f);
      expect(gateway.requestConsentInfo).toHaveBeenCalledTimes(1);
      expect(gateway.initialize).toHaveBeenCalledTimes(1);
      FakeObserver.last!.cb([{ isIntersecting: true }]);
      await settle(f);
      expect(gateway.showBanner).toHaveBeenCalledTimes(1);
      FakeObserver.last!.cb([{ isIntersecting: false }]);
      await settle(f);
      expect(gateway.hideBanner).toHaveBeenCalledTimes(1);
    });

    it('does nothing at all when the Android flag is off', async () => {
      const f = render({ enabled: true, androidEnabled: false }, 'android', [{ provide: AdMobGateway, useValue: gateway }]);
      await settle(f);
      expect(gateway.requestConsentInfo).not.toHaveBeenCalled();
      expect(slot(f).children.length).toBe(0);
    });

    it('a crashing SDK leaves the page untouched', async () => {
      gateway.requestConsentInfo.and.rejectWith(new Error('boom'));
      const f = render({ enabled: true, androidEnabled: true }, 'android', [{ provide: AdMobGateway, useValue: gateway }]);
      await settle(f);
      expect(slot(f).children.length).toBe(0);
      expect(f.nativeElement.querySelector('#after')).toBeTruthy();
    });
  });
});
