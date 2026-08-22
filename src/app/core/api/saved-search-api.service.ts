// Phase-0, Task 3 — mirrors favorites-api.service.ts's shape.
// Consumes SavedSearchController (api/savedsearch/*).

import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BackendApiService } from './backend-api.service';
import { apiToCamelCase } from '../adapters/api-naming.adapter';
import { CreateSavedSearchPayload, SavedSearch } from '../models/saved-search.model';

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
        const result = apiToCamelCase<Record<string, unknown>>(item);
        return { id: String(result['id'] ?? '') };
      }));
  }

  /** DELETE /api/savedsearch/{id} */
  remove(id: string): Observable<void> {
    return this.api.delete<void>(`${this.endpoint}/${id}`);
  }

  private toSavedSearches(response: unknown): SavedSearch[] {
    const list = Array.isArray(response) ? response : [];

    return list
      .map(item => apiToCamelCase<Record<string, unknown>>(item))
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
        lastMatchedAt: (item['lastMatchedAt'] as string | null | undefined) ?? null
      }))
      .filter(item => !!item.id);
  }
}
