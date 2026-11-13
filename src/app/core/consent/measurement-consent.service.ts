import { Injectable, computed, signal } from '@angular/core';

export const MEASUREMENT_CONSENT_STORAGE_KEY = 'hn.measurement.consent.v1';

/** The first-party measurement values that may only be kept on the device with consent where the law requires it. */
export const MEASUREMENT_STORAGE_KEYS: readonly string[] = ['hn.visitorId', 'hudhudnest.attribution.v1', 'hudhudnest.referral.v1'];

/**
 * EU and EEA member states, the United Kingdom, Switzerland and Türkiye: here storing a non-essential value on the
 * device needs prior consent (ePrivacy Art. 5(3) as transposed, e.g. § 25 TDDDG; UK PECR; Swiss and Turkish rules are
 * treated the same way to be safe). An unknown country is treated as one of them.
 */
export const CONSENT_REQUIRED_COUNTRIES: ReadonlySet<string> = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
  'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'GB', 'CH', 'TR'
]);

export type MeasurementChoice = 'granted' | 'denied' | 'unset';

/**
 * Consent for first-party measurement only: the random visitor id that counts a listing view once, the UTM tags of
 * a tracked link, and an invitation code (MEASUREMENT_STORAGE_KEYS). Nothing here goes to a third party; advertising
 * has its own consent (AdsConsentService).
 *
 * The values are always usable in the page's memory. They are written to localStorage only when canPersist() is
 * true: the visitor agreed, or their country is known and does not require consent. Until the country is known the
 * answer is "no". Declining (or withdrawing) removes values already stored.
 *
 * Deliberately has no dependencies, so the storage services that consult it stay constructible in every spec.
 */
@Injectable({ providedIn: 'root' })
export class MeasurementConsentService {
  private readonly choiceSignal = signal<MeasurementChoice>(readStoredChoice());
  /** null = not determined yet; true/false once the country is known (or found to be unknown). */
  private readonly requiredSignal = signal<boolean | null>(null);

  readonly choice = this.choiceSignal.asReadonly();
  readonly consentRequired = this.requiredSignal.asReadonly();

  readonly canPersist = computed(() => {
    const choice = this.choiceSignal();
    if (choice !== 'unset') return choice === 'granted';
    return this.requiredSignal() === false;
  });

  /** The banner asks only where consent is required (or the country is unknown) and nothing was chosen yet. */
  readonly showPrompt = computed(() => this.choiceSignal() === 'unset' && this.requiredSignal() === true);

  /** Called once with the visitor's country (two letters), or null when it could not be told. */
  setCountry(countryCode: string | null): void {
    const code = (countryCode ?? '').trim().toUpperCase();
    const required = !code || CONSENT_REQUIRED_COUNTRIES.has(code);
    this.requiredSignal.set(required);
    if (required && this.choiceSignal() === 'unset') {
      purgeMeasurementStorage();
    }
  }

  grant(): void {
    this.store('granted');
  }

  deny(): void {
    this.store('denied');
    purgeMeasurementStorage();
  }

  private store(choice: 'granted' | 'denied'): void {
    this.choiceSignal.set(choice);
    try {
      localStorage.setItem(MEASUREMENT_CONSENT_STORAGE_KEY, JSON.stringify({ v: 1, choice, at: new Date().toISOString() }));
    } catch {
      /* storage blocked: the choice applies for this page session */
    }
  }
}

function readStoredChoice(): MeasurementChoice {
  try {
    const raw = globalThis.localStorage?.getItem(MEASUREMENT_CONSENT_STORAGE_KEY);
    if (!raw) return 'unset';
    const parsed = JSON.parse(raw) as { choice?: unknown };
    return parsed.choice === 'granted' || parsed.choice === 'denied' ? parsed.choice : 'unset';
  } catch {
    return 'unset';
  }
}

function purgeMeasurementStorage(): void {
  for (const key of MEASUREMENT_STORAGE_KEYS) {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      /* storage unavailable */
    }
  }
}
