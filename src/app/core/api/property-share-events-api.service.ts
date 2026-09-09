// =============================================================
// src/app/core/api/property-share-events-api.service.ts
//
// Thin HTTP wrapper for POST /api/properties/{id}/share-events — mirrors the style of every
// other *-api.service.ts in this folder (e.g. property-api.service.ts). Kept deliberately
// separate from PropertyApiService: this endpoint belongs to the Social Sharing & Distribution
// feature, not to general property CRUD.
// =============================================================

import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { BackendApiService } from './backend-api.service';
import { SharePlatform } from '../sharing/share.model';
import { AttributionContext } from '../sharing/utm-attribution.model';

@Injectable({ providedIn: 'root' })
export class PropertyShareEventsApiService {
  constructor(private readonly api: BackendApiService) {}

  /**
   * Records a successful share/copy-link event. Callers (PropertyShareTrackingService) must
   * only ever call this AFTER the share/copy actually succeeded — never for an attempt, a
   * cancellation, or a failure. The backend independently re-validates the property is still
   * public before persisting anything (never trusted purely because the button was visible).
   *
   * `context` (UTM / Attribution — Phase 2) is the UTM context attached to the attributed link
   * that was actually opened/copied — sent as flat `utmSource`/`utmMedium`/`utmCampaign`/
   * `utmContent` fields, all optional on the backend DTO, so a caller that omits it (or an
   * older client) behaves exactly as it did before Phase 2.
   */
  track(
    propertyId: string,
    platform: SharePlatform,
    context?: AttributionContext | null
  ): Observable<{ success: boolean; id: string }> {
    const body: Record<string, unknown> = { platform };

    if (context) {
      body['utmSource'] = context.source;
      body['utmMedium'] = context.medium;
      body['utmCampaign'] = context.campaign;
      body['utmContent'] = context.content;
    }

    return this.api.post<{ success: boolean; id: string }>(
      `/properties/${propertyId}/share-events`,
      body
    );
  }
}
