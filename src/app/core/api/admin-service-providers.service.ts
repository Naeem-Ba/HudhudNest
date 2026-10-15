// src/app/core/api/admin-service-providers.service.ts
//
// Admin-only (Role Admin enforced on the server for every route).
//   GET  /api/admin/service-providers/applications?search&status&category&governorateId&page&pageSize
//   GET  /api/admin/service-providers/applications/pending-count
//   GET  /api/admin/service-providers/applications/{id}
//   POST /api/admin/service-providers/applications/{id}/notes|request-info|approve|reject
//   GET  /api/admin/service-providers?search&status&category&governorateId&page&pageSize
//   GET  /api/admin/service-providers/{id}
//   PUT  /api/admin/service-providers/{id}
//   POST /api/admin/service-providers/{id}/suspend|reactivate|revoke
//   PUT  /api/admin/service-providers/{id}/verification

import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';

import { BackendApiService, QueryValue } from './backend-api.service';
import {
  AdminApplicationDetailDto,
  AdminApplicationSummaryDto,
  AdminProviderDetailDto,
  AdminProviderSummaryDto,
  ApplicationFilter,
  ApproveApplicationPayload,
  ProviderFilter,
  ServicePage,
  UpdateProviderByAdminPayload
} from '../models/provider-onboarding.model';
import { ServiceProviderDto, ServiceProviderVerificationLevel } from '../models/service.model';

@Injectable({ providedIn: 'root' })
export class AdminServiceProvidersService {
  private readonly endpoint = '/admin/service-providers';

  constructor(private readonly api: BackendApiService) {}

  // ── Applications ──────────────────────────────────────────────

  searchApplications(filter: ApplicationFilter): Observable<ServicePage<AdminApplicationSummaryDto>> {
    return this.api.get<ServicePage<AdminApplicationSummaryDto>>(`${this.endpoint}/applications`, this.query(filter));
  }

  pendingCount(): Observable<number> {
    return this.api
      .get<{ count: number }>(`${this.endpoint}/applications/pending-count`)
      .pipe(map(r => Number(r?.count ?? 0)));
  }

  getApplication(id: string): Observable<AdminApplicationDetailDto> {
    return this.api.get<AdminApplicationDetailDto>(`${this.endpoint}/applications/${id}`);
  }

  addNote(id: string, note: string, visibleToApplicant: boolean): Observable<AdminApplicationDetailDto> {
    return this.api.post<AdminApplicationDetailDto>(`${this.endpoint}/applications/${id}/notes`, { note, visibleToApplicant });
  }

  requestInfo(id: string, message: string): Observable<AdminApplicationDetailDto> {
    return this.api.post<AdminApplicationDetailDto>(`${this.endpoint}/applications/${id}/request-info`, { message });
  }

  approve(id: string, payload: ApproveApplicationPayload): Observable<AdminApplicationDetailDto> {
    return this.api.post<AdminApplicationDetailDto>(`${this.endpoint}/applications/${id}/approve`, payload);
  }

  reject(id: string, reason: string): Observable<AdminApplicationDetailDto> {
    return this.api.post<AdminApplicationDetailDto>(`${this.endpoint}/applications/${id}/reject`, { reason });
  }

  // ── Providers ─────────────────────────────────────────────────

  searchProviders(filter: ProviderFilter): Observable<ServicePage<AdminProviderSummaryDto>> {
    return this.api.get<ServicePage<AdminProviderSummaryDto>>(this.endpoint, this.query(filter));
  }

  getProvider(id: string): Observable<AdminProviderDetailDto> {
    return this.api.get<AdminProviderDetailDto>(`${this.endpoint}/${id}`);
  }

  updateProvider(id: string, payload: UpdateProviderByAdminPayload): Observable<AdminProviderDetailDto> {
    return this.api.put<AdminProviderDetailDto>(`${this.endpoint}/${id}`, payload);
  }

  suspend(id: string, reason: string): Observable<AdminProviderDetailDto> {
    return this.api.post<AdminProviderDetailDto>(`${this.endpoint}/${id}/suspend`, { reason });
  }

  reactivate(id: string, reason?: string | null): Observable<AdminProviderDetailDto> {
    return this.api.post<AdminProviderDetailDto>(`${this.endpoint}/${id}/reactivate`, { reason: reason ?? null });
  }

  revoke(id: string, reason: string): Observable<AdminProviderDetailDto> {
    return this.api.post<AdminProviderDetailDto>(`${this.endpoint}/${id}/revoke`, { reason });
  }

  setVerification(id: string, level: ServiceProviderVerificationLevel): Observable<ServiceProviderDto> {
    return this.api.put<ServiceProviderDto>(`${this.endpoint}/${id}/verification`, { level });
  }

  private query(filter: ApplicationFilter | ProviderFilter): Record<string, QueryValue> {
    return {
      search: filter.search?.trim() || undefined,
      status: filter.status || undefined,
      category: filter.category || undefined,
      governorateId: filter.governorateId || undefined,
      page: filter.page ?? 1,
      pageSize: filter.pageSize ?? 20
    };
  }
}
