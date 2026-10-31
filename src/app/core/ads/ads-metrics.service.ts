import { Injectable, signal } from '@angular/core';

export type AdMetricEvent = 'requested' | 'filled' | 'unfilled' | 'load-failed' | 'impression';

/**
 * In-memory counters for the current page session. Nothing is persisted or sent anywhere: no personal data, no
 * network, no extra identifiers, so it needs no consent. Revenue, impressions and RPM/eCPM come from Google's own
 * AdSense/AdMob reports and are not recomputed here. "requested"/"filled" are NOT ad impressions and must never be
 * added to property view counts.
 */
@Injectable({ providedIn: 'root' })
export class AdsMetricsService {
  private readonly state = signal<Record<AdMetricEvent, number>>({
    requested: 0,
    filled: 0,
    unfilled: 0,
    'load-failed': 0,
    impression: 0
  });
  readonly counts = this.state.asReadonly();

  record(event: AdMetricEvent): void {
    this.state.update(s => ({ ...s, [event]: s[event] + 1 }));
  }
}

/** Safe diagnostics: a short machine code only, never a URL, id, user value or error message from the provider. */
export function logAdsIssue(code: string): void {
  console.warn(`[ads] ${code}`);
}
