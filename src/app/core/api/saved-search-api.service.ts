// Phase-0, Task 3 — mirrors favorites-api.service.ts's shape.
// Consumes SavedSearchController (api/savedsearch/*).

import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BackendApiService } from './backend-api.service';
import { CreateSavedSearchPayload, SavedSearch, SavedSearchFrequency } from '../models/saved-search.model';

@Injectable({ providedIn: 'root' })
export class SavedSearchApiService {
  private readonly endpoint = '/savedsearch';

  constructor(private readonly api: BackendApiService) {}

  /** GET /api/savedsearch — the current user's saved searches. */
  getMine(): Observable<SavedSearch[]> {
    return this.api
      .get<unknown[]>(this.endpoint)
      .pipe(map(response => this.toSavedSearches(response)));
  }

  /** POST /api/savedsearch — UserId is set server-side from the JWT. */
  create(payload: CreateSavedSearchPayload): Observable<{ id: string }> {
    return this.api
      .post<unknown>(this.endpoint, payload)
      .pipe(map(item => {
        const result = (item as Record<string, unknown>);
        return { id: String(result['id'] ?? '') };
      }));
  }

  /** PUT /api/savedsearch/{id} — replaces all criteria (send the unchanged ones too). */
  update(id: string, payload: CreateSavedSearchPayload): Observable<void> {
    return this.api.put<void>(`${this.endpoint}/${id}`, payload);
  }

  /** POST /api/savedsearch/{id}/pause */
  pause(id: string): Observable<void> {
    return this.api.post<void>(`${this.endpoint}/${id}/pause`, {});
  }

  /** POST /api/savedsearch/{id}/resume — new listings are counted from now on. */
  resume(id: string): Observable<void> {
    return this.api.post<void>(`${this.endpoint}/${id}/resume`, {});
  }

  /** DELETE /api/savedsearch/{id} */
  remove(id: string): Observable<void> {
    return this.api.delete<void>(`${this.endpoint}/${id}`);
  }

  private toSavedSearches(response: unknown): SavedSearch[] {
    const list = Array.isArray(response) ? response : [];

    return list
      .map(item => (item as Record<string, unknown>))
      .map(item => ({
        id: String(item['id'] ?? ''),
        name: (item['name'] as string | null | undefined) ?? null,
        countryCode: (item['countryCode'] as string | null | undefined) ?? null,
        city: (item['city'] as string | null | undefined) ?? null,
        region: (item['region'] as string | null | undefined) ?? null,
        governorateId: item['governorateId'] === undefined || item['governorateId'] === null ? null : Number(item['governorateId']),
        districtId: item['districtId'] === undefined || item['districtId'] === null ? null : Number(item['districtId']),
        neighborhoodId: item['neighborhoodId'] === undefined || item['neighborhoodId'] === null ? null : Number(item['neighborhoodId']),
        propertyTypeId: item['propertyTypeId'] === undefined || item['propertyTypeId'] === null ? null : Number(item['propertyTypeId']),
        listingType: (item['listingType'] as string | null | undefined) ?? null,
        minPrice: item['minPrice'] === undefined || item['minPrice'] === null ? null : Number(item['minPrice']),
        maxPrice: item['maxPrice'] === undefined || item['maxPrice'] === null ? null : Number(item['maxPrice']),
        currencyCode: (item['currencyCode'] as string | null | undefined) ?? null,
        minRooms: item['minRooms'] === undefined || item['minRooms'] === null ? null : Number(item['minRooms']),
        maxRooms: item['maxRooms'] === undefined || item['maxRooms'] === null ? null : Number(item['maxRooms']),
        minArea: item['minArea'] === undefined || item['minArea'] === null ? null : Number(item['minArea']),
        maxArea: item['maxArea'] === undefined || item['maxArea'] === null ? null : Number(item['maxArea']),
        createdAt: String(item['createdAt'] ?? ''),
        lastMatchedAt: (item['lastMatchedAt'] as string | null | undefined) ?? null,
        hasBalcony: item['hasBalcony'] === true ? true : null,
        hasElevator: item['hasElevator'] === true ? true : null,
        hasParkingSpace: item['hasParkingSpace'] === true ? true : null,
        frequency: (item['frequency'] === 'Daily' ? 'Daily' : 'Instant') as SavedSearchFrequency,
        isPaused: item['isPaused'] === true,
        lastNotifiedAt: (item['lastNotifiedAt'] as string | null | undefined) ?? null,
        notifiedCount: Number(item['notifiedCount'] ?? 0) || 0,
        floorFrom: item['floorFrom'] === undefined || item['floorFrom'] === null ? null : Number(item['floorFrom']),
        floorTo: item['floorTo'] === undefined || item['floorTo'] === null ? null : Number(item['floorTo'])
      }))
      .filter(item => !!item.id);
  }
}
