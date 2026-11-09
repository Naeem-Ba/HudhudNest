import { Injectable, computed, inject, signal } from '@angular/core';

import { AdsConfigService } from './ads-config.service';
import { AdsConsentService } from './ads-consent.service';
import { AdsMetricsService, logAdsIssue } from './ads-metrics.service';
import { AdMobGateway } from './admob.gateway';
import { AdSenseLoaderService } from './adsense-loader.service';
import { evaluateAdEligibility } from './ads-policy';
import { AdDecision, AdPlacement } from './ads.model';

/**
 * Facade the ad slots talk to. It never throws into the page: every failure becomes "no ad" plus a short code.
 * Network, consent, switches and ids are all inputs of evaluateAdEligibility(); this class only supplies them and
 * runs the provider-specific start-up (AdSense script on web, UMP consent + SDK init on native) at most once.
 */
@Injectable({ providedIn: 'root' })
export class AdsService {
  readonly config = inject(AdsConfigService);
  readonly consent = inject(AdsConsentService);
  readonly metrics = inject(AdsMetricsService);
  private readonly adsense = inject(AdSenseLoaderService);
  private readonly admob = inject(AdMobGateway);

  private readonly online = signal(typeof navigator === 'undefined' ? true : navigator.onLine !== false);
  private readonly providerFailed = signal(false);
  private webReady?: Promise<boolean>;
  private nativeReady?: Promise<boolean>;
  private bannerShown = false;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.online.set(true));
      window.addEventListener('offline', () => this.online.set(false));
    }
  }

  /** Reactive eligibility for a placement on the given router path. */
  decision(placement: () => AdPlacement, path: () => string): () => AdDecision {
    return computed(() =>
      evaluateAdEligibility({
        masterEnabled: this.config.masterEnabled,
        platformEnabled: this.config.platformEnabled,
        idsPresent: this.config.idsPresent(placement()),
        placement: placement(),
        path: path(),
        online: this.online(),
        consent: this.consent.state(),
        loadFailed: this.providerFailed()
      })
    );
  }

  /** Native only: runs the UMP flow once so consent state exists before any request. Safe to call repeatedly. */
  ensureNativeConsent(): Promise<boolean> {
    return (this.nativeReady ??= this.startNative());
  }

  private async startNative(): Promise<boolean> {
    try {
      let info = await this.admob.requestConsentInfo();
      if (info.status === 'REQUIRED' && info.isConsentFormAvailable) {
        info = await this.admob.showConsentForm();
      }
      this.consent.applyNative(info);
      if (!info.canRequestAds) return false;
      await this.admob.initialize(this.config.testMode);
      return true;
    } catch {
      logAdsIssue('native-start-failed');
      this.providerFailed.set(true);
      return false;
    }
  }

  /** Web only: loads the AdSense library once. Marks the provider failed (for this session) when it cannot load. */
  ensureWebLibrary(): Promise<boolean> {
    return (this.webReady ??= this.adsense.load(this.config.publisherId).then(ok => {
      if (!ok) {
        logAdsIssue('adsense-script-failed');
        this.metrics.record('load-failed');
        this.providerFailed.set(true);
      }
      return ok;
    }));
  }

  /** Native: show the overlay banner while the slot's placeholder is on screen. */
  async showNativeBanner(): Promise<void> {
    if (this.bannerShown) return;
    this.bannerShown = true;
    this.metrics.record('requested');
    try {
      await this.admob.showBanner(this.config.admobUnit(), this.config.testMode, {
        onLoaded: () => this.metrics.record('filled'),
        onFailed: () => {
          this.metrics.record('load-failed');
          logAdsIssue('banner-failed');
        },
        onImpression: () => this.metrics.record('impression')
      });
    } catch {
      this.bannerShown = false;
      this.metrics.record('load-failed');
      logAdsIssue('banner-show-failed');
    }
  }

  async hideNativeBanner(): Promise<void> {
    if (!this.bannerShown) return;
    this.bannerShown = false;
    try {
      await this.admob.hideBanner();
    } catch {
      logAdsIssue('banner-hide-failed');
    }
  }

  /** Opens the visitor's ad-choice controls (web panel or UMP privacy options form). */
  async openAdChoices(): Promise<void> {
    if (this.config.platform === 'web') {
      this.consent.reopen();
      return;
    }
    try {
      await this.admob.showPrivacyOptionsForm();
      const info = await this.admob.requestConsentInfo();
      this.consent.applyNative(info);
      if (!info.canRequestAds) await this.hideNativeBanner();
    } catch {
      logAdsIssue('privacy-options-failed');
    }
  }
}
