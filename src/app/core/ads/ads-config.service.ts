import { Injectable, InjectionToken, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';

import { environment } from '../../../environments/environment';
import { AdsEnvironment } from '../../../environments/environment.model';
import {
  ADMOB_UNIT_PATTERN,
  ADSENSE_PUBLISHER_PATTERN,
  ADSENSE_SLOT_PATTERN,
  AdPlacement,
  AdPlatform,
  GOOGLE_TEST_ADMOB_BANNER,
  GOOGLE_TEST_PUBLISHER_FRAGMENT
} from './ads.model';

/** The build-time ad settings. Overridable in tests; production code always gets environment.ads. */
export const ADS_ENVIRONMENT = new InjectionToken<AdsEnvironment>('ADS_ENVIRONMENT', {
  providedIn: 'root',
  factory: () => environment.ads
});

/** True for a local development build, the only build allowed to fall back to Google's test units. */
export const ADS_DEV_BUILD = new InjectionToken<boolean>('ADS_DEV_BUILD', {
  providedIn: 'root',
  factory: () => environment.environmentName === 'local'
});

export const ADS_PLATFORM = new InjectionToken<AdPlatform>('ADS_PLATFORM', {
  providedIn: 'root',
  factory: () => {
    try {
      const platform = Capacitor.getPlatform();
      return platform === 'android' || platform === 'ios' ? platform : 'web';
    } catch {
      return 'web';
    }
  }
});

/** Reads the build-time settings and answers "is this layer on / which id" for the running platform. */
@Injectable({ providedIn: 'root' })
export class AdsConfigService {
  private readonly env = inject(ADS_ENVIRONMENT);
  private readonly devBuild = inject(ADS_DEV_BUILD);
  readonly platform: AdPlatform = inject(ADS_PLATFORM);

  /** Test ads/markers for anything that is not a production-grade build. */
  readonly testMode = this.devBuild;

  get masterEnabled(): boolean {
    return this.env.enabled === true;
  }

  get platformEnabled(): boolean {
    switch (this.platform) {
      case 'web':
        return this.env.webEnabled === true;
      case 'android':
        return this.env.androidEnabled === true;
      case 'ios':
        return this.env.iosEnabled === true;
    }
  }

  get publisherId(): string {
    const id = this.env.adsensePublisherId.trim();
    return ADSENSE_PUBLISHER_PATTERN.test(id) ? id : '';
  }

  /** AdSense slot for the placement, or '' when unset/malformed. */
  adsenseSlot(placement: AdPlacement): string {
    const raw = placement === 'search-results' ? this.env.adsenseSlotSearch : this.env.adsenseSlotDetail;
    const slot = raw.trim();
    return ADSENSE_SLOT_PATTERN.test(slot) ? slot : '';
  }

  /**
   * AdMob banner unit. A development build with nothing configured uses Google's test unit; every other build
   * needs a real unit and rejects Google's test publisher (so a test unit cannot be shipped by mistake).
   */
  admobUnit(): string {
    if (this.platform === 'web') return '';
    const configured = (this.platform === 'android' ? this.env.admobBannerAndroid : this.env.admobBannerIos).trim();
    if (this.devBuild) {
      return ADMOB_UNIT_PATTERN.test(configured) ? configured : GOOGLE_TEST_ADMOB_BANNER[this.platform];
    }
    if (!ADMOB_UNIT_PATTERN.test(configured) || configured.includes(GOOGLE_TEST_PUBLISHER_FRAGMENT)) return '';
    return configured;
  }

  idsPresent(placement: AdPlacement): boolean {
    return this.platform === 'web'
      ? this.publisherId !== '' && this.adsenseSlot(placement) !== ''
      : this.admobUnit() !== '';
  }
}
