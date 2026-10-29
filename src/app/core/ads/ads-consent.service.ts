import { Injectable, computed, inject, signal } from '@angular/core';

import { AdsConfigService } from './ads-config.service';
import { AdConsentState } from './ads.model';
import { NativeConsentInfo } from './admob.gateway';

export const ADS_CONSENT_STORAGE_KEY = 'hn.ads.consent.v1';

/**
 * Consent state for advertising only (it says nothing about the privacy policy or other processing).
 *
 * Web: an explicit opt-in kept on this device. "unknown" (nothing chosen yet) and "denied" both mean no ad request,
 * everywhere, regardless of region. That is stricter than the law requires outside the EEA/UK/CH, on purpose,
 * because the page cannot reliably tell where a visitor is. The built-in choice is NOT a Google-certified CMP, so
 * AdSense is told to serve non-personalised ads only; before EEA/UK/CH traffic is monetised the owner must switch
 * to Google's certified "Privacy & messaging" CMP (docs/MONETIZATION.md).
 *
 * Native: the state mirrors Google's UMP SDK (canRequestAds), never a local guess.
 */
@Injectable({ providedIn: 'root' })
export class AdsConsentService {
  private readonly config = inject(AdsConfigService);

  private readonly stateSignal = signal<AdConsentState>(this.readStoredWebChoice());
  readonly state = this.stateSignal.asReadonly();
  readonly canRequestAds = computed(() => {
    const s = this.stateSignal();
    return s === 'granted' || s === 'not-required';
  });

  /** Native only: UMP says the user can reopen the privacy options form. */
  readonly nativePrivacyOptions = signal(false);
  /** Web only: the preference panel was reopened on request. */
  private readonly reopened = signal(false);

  /** The web banner shows only when ads could run on this build at all and the visitor has not chosen yet (or reopened it). */
  readonly showWebPrompt = computed(
    () =>
      this.config.platform === 'web' &&
      this.config.masterEnabled &&
      this.config.platformEnabled &&
      (this.stateSignal() === 'unknown' || this.reopened())
  );

  /** A "manage ad choices" entry is offered whenever the visitor can actually change something. */
  readonly canManageChoices = computed(() =>
    this.config.platform === 'web' ? this.config.masterEnabled && this.config.platformEnabled : this.nativePrivacyOptions()
  );

  grant(): void {
    this.setWeb('granted');
  }

  deny(): void {
    this.setWeb('denied');
  }

  /** Reopens the choice panel (web). Withdrawal is just "deny" from there; ads stop at once. */
  reopen(): void {
    this.reopened.set(true);
  }

  applyNative(info: NativeConsentInfo): void {
    this.stateSignal.set(info.canRequestAds ? (info.status === 'NOT_REQUIRED' ? 'not-required' : 'granted') : info.status === 'UNKNOWN' ? 'unknown' : 'denied');
    this.nativePrivacyOptions.set(info.privacyOptionsRequired);
  }

  private setWeb(choice: 'granted' | 'denied'): void {
    this.stateSignal.set(choice);
    this.reopened.set(false);
    try {
      localStorage.setItem(ADS_CONSENT_STORAGE_KEY, JSON.stringify({ v: 1, choice, at: new Date().toISOString() }));
    } catch {
      /* storage blocked: the choice still applies for this page session */
    }
  }

  private readStoredWebChoice(): AdConsentState {
    if (this.config.platform !== 'web') return 'unknown';
    try {
      const parsed = JSON.parse(localStorage.getItem(ADS_CONSENT_STORAGE_KEY) ?? 'null') as { v?: number; choice?: string } | null;
      if (parsed?.v === 1 && (parsed.choice === 'granted' || parsed.choice === 'denied')) return parsed.choice;
    } catch {
      /* unreadable or blocked: treated as "no choice yet" */
    }
    return 'unknown';
  }
}
