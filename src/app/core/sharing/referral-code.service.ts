// Growth engine P5: keeps the invitation code from a "?ref=CODE" link for 30 days so it can go with the
// sign-up. Only a well-formed code is kept; the API ignores unknown codes anyway.
import { Injectable, inject } from '@angular/core';

import { MeasurementConsentService } from '../consent/measurement-consent.service';

const STORAGE_KEY = 'hudhudnest.referral.v1';
const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;

interface StoredCode {
  readonly code: string;
  readonly capturedAt: number;
}

@Injectable({ providedIn: 'root' })
export class ReferralCodeService {
  private readonly consent = inject(MeasurementConsentService);

  private memory: StoredCode | null = null;

  /** Reads "ref" from the URL. A later valid link replaces the earlier one (the latest invitation wins). */
  captureFromUrl(url: string): void {
    let code: string | null = null;
    try {
      code = new URL(url).searchParams.get('ref');
    } catch {
      return;
    }
    const normalized = ReferralCodeService.normalize(code);
    if (normalized) {
      this.write({ code: normalized, capturedAt: Date.now() });
    }
  }

  /** The kept code, or null when none was captured or it is older than 30 days. */
  current(): string | null {
    const stored = this.read();
    if (!stored || Date.now() - stored.capturedAt > WINDOW_MS) {
      return null;
    }
    return stored.code;
  }

  clear(): void {
    this.memory = null;
    try {
      window.localStorage?.removeItem(STORAGE_KEY);
    } catch {
      // storage unavailable
    }
  }

  static normalize(value: string | null | undefined): string | null {
    const code = (value ?? '').trim().toUpperCase();
    return CODE_PATTERN.test(code) ? code : null;
  }

  private read(): StoredCode | null {
    try {
      const raw = window.localStorage?.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredCode;
        if (typeof parsed?.code === 'string' && typeof parsed?.capturedAt === 'number') {
          return parsed;
        }
      }
    } catch {
      // fall back to memory
    }
    return this.memory;
  }

  private write(value: StoredCode): void {
    this.memory = value;
    try {
      // Kept on the device only with consent where the law requires it (MeasurementConsentService).
      if (this.consent.canPersist()) window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
      // memory only
    }
  }
}
