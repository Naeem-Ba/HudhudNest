// =============================================================
// src/app/core/api/property-attribution-events-api.service.ts
//
// Thin HTTP wrapper for POST /api/properties/{id}/attribution-events — mirrors
// PropertyShareEventsApiService's shape exactly. UTM fields are sent only when an attribution
// context is actually available (a direct visit has none, and that is a valid, expected body —
// never an error, see AttributionContextService.getContext()).
// =============================================================

import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { BackendApiService } from './backend-api.service';
import { AttributionContext } from '../sharing/utm-attribution.model';
import { PropertyAttributionEventType } from '../sharing/property-attribution-event.model';

@Injectable({ providedIn: 'root' })
export class PropertyAttributionEventsApiService {
  constructor(private readonly api: BackendApiService) {}

  track(
    propertyId: string,
    eventType: PropertyAttributionEventType,
    context?: AttributionContext | null
  ): Observable<{ success: boolean; id: string }> {
    const body: Record<string, unknown> = { eventType };

    if (context) {
      body['utmSource'] = context.source;
      body['utmMedium'] = context.medium;
      body['utmCampaign'] = context.campaign;
      body['utmContent'] = context.content;
    }

    return this.api.post<{ success: boolean; id: string }>(
      `/properties/${propertyId}/attribution-events`,
      body
    );
  }
}
