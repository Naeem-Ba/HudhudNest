// =============================================================
// src/app/core/sharing/property-attribution-tracking.service.ts
//
// UTM / Attribution (Phase 2) — non-blocking tracking for the funnel events that follow a
// share: a property view, and the contact/lead actions that already existed on the property
// detail page (message, phone tap, visit-request). Same posture as
// PropertyShareTrackingService: fire-and-forget, never awaited by its caller, a tracking
// failure never surfaces to the user and never blocks the real action (section 10: "لا يمنع
// فشل Tracking عملية المشاركة" — the same rule applies here to view/contact/lead tracking).
// =============================================================

import { Injectable, inject } from '@angular/core';
import { PropertyAttributionEventsApiService } from '../api/property-attribution-events-api.service';
import { AttributionContextService } from './attribution-context.service';
import { PropertyAttributionEventType } from './property-attribution-event.model';

@Injectable({ providedIn: 'root' })
export class PropertyAttributionTrackingService {
  private readonly api = inject(PropertyAttributionEventsApiService);
  private readonly attributionContext = inject(AttributionContextService);

  /** propertyId+eventType pairs already sent this page session — de-duplicates a "view" that
   *  would otherwise double-fire (e.g. change detection re-running, navigating back to the same
   *  property within the same session). Deliberately NOT applied to contact/lead actions below:
   *  a visitor sending two separate messages or tapping the phone number twice is two real
   *  actions, not a duplicate. In-memory only — a full page reload is legitimately a new view. */
  private readonly viewedThisSession = new Set<string>();

  /** Fired once per property per page session, from PropertyDetailPage's load — never from the
   *  Share button (a share attempt is not a visit; see PropertyShareEvent for that). */
  trackView(propertyId: string): void {
    if (!propertyId || this.viewedThisSession.has(propertyId)) {
      return;
    }

    this.viewedThisSession.add(propertyId);
    this.track(propertyId, PropertyAttributionEventType.View);
  }

  trackPhoneClick(propertyId: string): void {
    this.track(propertyId, PropertyAttributionEventType.PhoneClick);
  }

  trackWhatsAppClick(propertyId: string): void {
    this.track(propertyId, PropertyAttributionEventType.WhatsAppClick);
  }

  trackMessageSent(propertyId: string): void {
    this.track(propertyId, PropertyAttributionEventType.MessageSent);
  }

  /** The closest thing this product has to a "Lead" event — fired after a visit/viewing request
   *  is created successfully (see docs/social-sharing.md for why no separate Lead entity/entry
   *  point exists here). */
  trackLead(propertyId: string): void {
    this.track(propertyId, PropertyAttributionEventType.VisitRequestCreated);
  }

  private track(propertyId: string, eventType: PropertyAttributionEventType): void {
    if (!propertyId) {
      return;
    }

    this.api.track(propertyId, eventType, this.attributionContext.getContext()).subscribe({
      next: () => undefined,
      // Swallow silently — a 404 (listing became unavailable), a 429 (rate limited), or a
      // network error must never surface to a user who is just browsing or has already
      // successfully contacted the owner.
      error: () => undefined
    });
  }
}
