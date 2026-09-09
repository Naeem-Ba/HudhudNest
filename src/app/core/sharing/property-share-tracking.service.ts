// =============================================================
// src/app/core/sharing/property-share-tracking.service.ts
//
// Non-blocking analytics for successful shares. Section 11 of the feature spec, in code:
//  - fires only after a share/copy has already succeeded (never for an attempt or a failure)
//  - never blocks or delays the share result shown to the user
//  - a tracking failure is swallowed silently — it must never surface as a share failure
// =============================================================

import { Injectable } from '@angular/core';
import { PropertyShareEventsApiService } from '../api/property-share-events-api.service';
import { SharePlatform } from './share.model';
import { AttributionContext } from './utm-attribution.model';

@Injectable({ providedIn: 'root' })
export class PropertyShareTrackingService {
  constructor(private readonly api: PropertyShareEventsApiService) {}

  /**
   * Fire-and-forget. Deliberately does not return an Observable/Promise for the caller to
   * await — SocialShareService must be able to resolve the user-facing ShareResult without
   * waiting on this at all, and a tracking error must never become a share error.
   *
   * `context` (UTM / Attribution — Phase 2) is the UTM context of the attributed link that was
   * actually shared — see SocialShareService.shareVia, the only caller.
   */
  recordSuccess(propertyId: string, platform: SharePlatform, context?: AttributionContext | null): void {
    if (!propertyId) {
      return;
    }

    this.api.track(propertyId, platform, context).subscribe({
      // No next-side effect needed — the event is fire-and-forget from the UI's perspective.
      next: () => undefined,
      // Swallow silently: a 404 (listing became unavailable between rendering the button and
      // clicking it), a 429 (rate limited), or a network error must never surface to the user
      // who already successfully shared the listing.
      error: () => undefined
    });
  }
}
