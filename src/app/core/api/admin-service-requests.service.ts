// src/app/core/api/admin-service-requests.service.ts
//
// Admin-only (Role Admin enforced on the server for every route).
//   GET  /api/admin/service-requests?search&status&category&offeringId&providerId&from&to&needsAttention&page&pageSize
//   GET  /api/admin/service-requests/stats?from&to
//   GET  /api/admin/service-requests/{id}
//   PUT  /api/admin/service-requests/{id}/outcome
//   PUT  /api/admin/service-requests/reviews/{reviewId}/visibility
// Cancelling uses the existing PUT /api/ServiceRequests/{id}/cancel (an admin may cancel any request).

import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { BackendApiService, QueryValue } from './backend-api.service';
import {
  AdminServiceRequestDetailDto,
  AdminServiceRequestFilter,
  AdminServiceRequestPage,
  AdminServiceReviewDto,
  AdminSetOutcomePayload,
  ServiceStatsDto
} from '../models/admin-service-requests.model';

@Injectable({ providedIn: 'root' })
export class AdminServiceRequestsService {
  private readonly endpoint = '/admin/service-requests';

  constructor(private readonly api: BackendApiService) {}

  search(filter: AdminServiceRequestFilter): Observable<AdminServiceRequestPage> {
    const query: Record<string, QueryValue> = {
      search: filter.search?.trim() || undefined,
      status: filter.status || undefined,
      category: filter.category || undefined,
      offeringId: filter.offeringId || undefined,
      providerId: filter.providerId || undefined,
      from: filter.from || undefined,
      to: filter.to || undefined,
      needsAttention: filter.needsAttention ? true : undefined,
      confirmed: filter.confirmed ?? undefined,
      page: filter.page ?? 1,
      pageSize: filter.pageSize ?? 20
    };
    return this.api.get<AdminServiceRequestPage>(this.endpoint, query);
  }

  stats(from?: string | null, to?: string | null): Observable<ServiceStatsDto> {
    return this.api.get<ServiceStatsDto>(`${this.endpoint}/stats`, { from: from || undefined, to: to || undefined });
  }

  get(id: string): Observable<AdminServiceRequestDetailDto> {
    return this.api.get<AdminServiceRequestDetailDto>(`${this.endpoint}/${id}`);
  }

  setOutcome(id: string, payload: AdminSetOutcomePayload): Observable<AdminServiceRequestDetailDto> {
    return this.api.put<AdminServiceRequestDetailDto>(`${this.endpoint}/${id}/outcome`, {
      completed: payload.completed,
      reason: payload.reason ?? null,
      providerNote: payload.providerNote?.trim() || null,
      adminNote: payload.adminNote.trim()
    });
  }

  setReviewVisibility(reviewId: string, hidden: boolean, reason?: string | null): Observable<AdminServiceReviewDto> {
    return this.api.put<AdminServiceReviewDto>(`${this.endpoint}/reviews/${reviewId}/visibility`, {
      hidden,
      reason: reason?.trim() || null
    });
  }
}
