// Admin moderation queue for user-typed district/neighborhood names — see
// LocationSuggestion.cs (backend) for the full reasoning. Consumes
// LocationSuggestionsController (api/admin/location-suggestions/*), which is
// [Authorize(Roles = Admin)] on every action.

import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BackendApiService } from './backend-api.service';
import { LocationSuggestion } from '../models/location-suggestion.model';

@Injectable({ providedIn: 'root' })
export class LocationSuggestionsApiService {
  private readonly endpoint = '/admin/location-suggestions';

  constructor(private readonly api: BackendApiService) {}

  /** GET /api/admin/location-suggestions — all Pending suggestions. */
  getPending(): Observable<LocationSuggestion[]> {
    return this.api
      .get<unknown[]>(this.endpoint)
      .pipe(map(response => this.toSuggestions(response)));
  }

  /** POST /api/admin/location-suggestions/{id}/approve */
  approve(id: string, notes?: string): Observable<{ resultingEntityId: number }> {
    return this.api
      .post<unknown>(`${this.endpoint}/${id}/approve`, { Notes: notes ?? null })
      .pipe(map(item => {
        const result = (item as Record<string, unknown>);
        return { resultingEntityId: Number(result['resultingEntityId'] ?? 0) };
      }));
  }

  /** POST /api/admin/location-suggestions/{id}/reject */
  reject(id: string, notes?: string): Observable<void> {
    return this.api.post<void>(`${this.endpoint}/${id}/reject`, { Notes: notes ?? null });
  }

  private toSuggestions(response: unknown): LocationSuggestion[] {
    const list = Array.isArray(response) ? response : [];

    return list
      .map(item => (item as Record<string, unknown>))
      .map(item => ({
        id: String(item['id'] ?? ''),
        type: (item['type'] as 'District' | 'Neighborhood') ?? 'District',
        parentId: Number(item['parentId'] ?? 0),
        parentName: String(item['parentName'] ?? ''),
        name: String(item['name'] ?? ''),
        submittedByUserId: String(item['submittedByUserId'] ?? ''),
        submittedByUserName: (item['submittedByUserName'] as string | null | undefined) ?? null,
        propertyId: (item['propertyId'] as string | null | undefined) ?? null,
        propertyTitle: (item['propertyTitle'] as string | null | undefined) ?? null,
        createdAt: String(item['createdAt'] ?? '')
      }))
      .filter(item => !!item.id);
  }
}
