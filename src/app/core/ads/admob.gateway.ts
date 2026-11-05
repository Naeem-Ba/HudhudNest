// Thin wrapper over @capacitor-community/admob so the rest of the ads layer (and its tests) never touch the plugin
// proxy directly, and so the plugin is only loaded when the native app actually needs it: the import is dynamic,
// which keeps it out of the web bundle's initial chunk.
//
// The community plugin offers overlay banners only (a native view above the WebView), not banners inside the page.
// AdSlotComponent shows that overlay while its in-page placeholder is on screen. See docs/MONETIZATION.md.
import { Injectable } from '@angular/core';

export interface NativeConsentInfo {
  /** REQUIRED | OBTAINED | NOT_REQUIRED | UNKNOWN (UMP). */
  status: string;
  canRequestAds: boolean;
  isConsentFormAvailable: boolean;
  privacyOptionsRequired: boolean;
}

export interface NativeBannerHandlers {
  onLoaded: () => void;
  onFailed: () => void;
  onImpression: () => void;
}

type Plugin = typeof import('@capacitor-community/admob');

@Injectable({ providedIn: 'root' })
export class AdMobGateway {
  private plugin?: Promise<Plugin>;
  private listeners: Array<{ remove: () => Promise<void> }> = [];

  private load(): Promise<Plugin> {
    return (this.plugin ??= import('@capacitor-community/admob'));
  }

  async requestConsentInfo(): Promise<NativeConsentInfo> {
    const { AdMob } = await this.load();
    return this.toInfo(await AdMob.requestConsentInfo({ tagForUnderAgeOfConsent: false }));
  }

  async showConsentForm(): Promise<NativeConsentInfo> {
    const { AdMob } = await this.load();
    return this.toInfo(await AdMob.showConsentForm());
  }

  async showPrivacyOptionsForm(): Promise<void> {
    const { AdMob } = await this.load();
    await AdMob.showPrivacyOptionsForm();
  }

  async initialize(testMode: boolean): Promise<void> {
    const { AdMob } = await this.load();
    await AdMob.initialize({ initializeForTesting: testMode });
  }

  async showBanner(adId: string, testMode: boolean, handlers: NativeBannerHandlers): Promise<void> {
    const { AdMob, BannerAdPluginEvents, BannerAdSize, BannerAdPosition } = await this.load();
    await this.removeListeners();
    this.listeners = [
      await AdMob.addListener(BannerAdPluginEvents.Loaded, () => handlers.onLoaded()),
      await AdMob.addListener(BannerAdPluginEvents.FailedToLoad, () => handlers.onFailed()),
      await AdMob.addListener(BannerAdPluginEvents.AdImpression, () => handlers.onImpression())
    ];
    await AdMob.showBanner({
      adId,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: 0,
      isTesting: testMode
    });
  }

  async hideBanner(): Promise<void> {
    const { AdMob } = await this.load();
    await this.removeListeners();
    await AdMob.removeBanner();
  }

  private async removeListeners(): Promise<void> {
    const old = this.listeners;
    this.listeners = [];
    await Promise.all(old.map(l => l.remove().catch(() => undefined)));
  }

  private toInfo(raw: {
    status: string;
    canRequestAds: boolean;
    isConsentFormAvailable?: boolean;
    privacyOptionsRequirementStatus: string;
  }): NativeConsentInfo {
    return {
      status: String(raw.status),
      canRequestAds: raw.canRequestAds === true,
      isConsentFormAvailable: raw.isConsentFormAvailable === true,
      privacyOptionsRequired: String(raw.privacyOptionsRequirementStatus) === 'REQUIRED'
    };
  }
}
