// Endpoints (HudhudNestApi.Controllers.AdminAgenciesController, Role Admin on every action):
//   GET /api/admin/agencies?search=&status=&page=&pageSize=      ← المكاتب مع حالة التوثيق (المعلّقة أولًا)
//   GET /api/admin/agencies/{id}/verification-history             ← سجل تغييرات التوثيق، الأحدث أولًا
//   PUT /api/admin/agencies/{id}/verification  { status, reason } ← تغيير الحالة بسبب إلزامي (≤ 1000)

import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BackendApiService, QueryValue } from './backend-api.service';
import { ApiPagedResult, normalizePagedResult, PagedResult } from '../models/api.model';
import { AdminAgencySummary, AgencyVerificationEvent, AgencyVerificationStatus } from '../models/agency.model';

export const AGENCY_VERIFICATION_REASON_MAX_LENGTH = 1000;

export interface AdminAgencyFilter {
  search?: string;
  status?: AgencyVerificationStatus | '';
  page?: number;
  pageSize?: number;
}

@Injectable({ providedIn: 'root' })
export class AdminAgenciesService {
  private readonly endpoint = '/admin/agencies';

  constructor(private readonly api: BackendApiService) {}

  search(filter: AdminAgencyFilter = {}): Observable<PagedResult<AdminAgencySummary>> {
    const page = filter.page ?? 1;
    const pageSize = filter.pageSize ?? 20;
    const query: Record<string, QueryValue> = {
      search: filter.search?.trim() || undefined,
      status: filter.status || undefined,
      page,
      pageSize
    };

    return this.api
      .get<AdminAgencySummary[] | ApiPagedResult<AdminAgencySummary>>(this.endpoint, query)
      .pipe(map(response => normalizePagedResult(response, item => item, page, pageSize)));
  }

  history(agencyId: string): Observable<AgencyVerificationEvent[]> {
    return this.api.get<AgencyVerificationEvent[]>(`${this.endpoint}/${agencyId}/verification-history`);
  }

  setVerification(agencyId: string, status: AgencyVerificationStatus, reason: string): Observable<AdminAgencySummary> {
    return this.api.put<AdminAgencySummary>(`${this.endpoint}/${agencyId}/verification`, { status, reason: reason.trim() });
  }
}
