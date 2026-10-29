// Endpoints (HudhudNestApi.Controllers.AdminShortStayController, Role Admin on every action):
//   GET  /api/admin/short-stay?search=&takenDown=&page=&pageSize=  ← قائمة الإعلانات (paged)
//   POST /api/admin/short-stay/{id}/take-down  { reason }           ← إيقاف مع سبب إلزامي (≤ 500)
//   POST /api/admin/short-stay/{id}/restore    { reason? }          ← استعادة

import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BackendApiService, QueryValue } from './backend-api.service';
import { ApiPagedResult, normalizePagedResult, PagedResult } from '../models/api.model';
import { AdminShortStayFilter, AdminShortStayListing } from '../models/short-stay.model';

@Injectable({ providedIn: 'root' })
export class AdminShortStayService {
  private readonly endpoint = '/admin/short-stay';

  constructor(private readonly api: BackendApiService) {}

  search(filter: AdminShortStayFilter = {}): Observable<PagedResult<AdminShortStayListing>> {
    const page = filter.page ?? 1;
    const pageSize = filter.pageSize ?? 20;
    const query: Record<string, QueryValue> = {
      search: filter.search?.trim() || undefined,
      // "all" is the absence of the parameter; only the taken-down filter is ever sent.
      takenDown: filter.takenDown ? true : undefined,
      page,
      pageSize
    };

    return this.api
      .get<AdminShortStayListing[] | ApiPagedResult<AdminShortStayListing>>(this.endpoint, query)
      .pipe(map(response => normalizePagedResult(response, item => item, page, pageSize)));
  }

  takeDown(id: string, reason: string): Observable<AdminShortStayListing> {
    return this.api.post<AdminShortStayListing>(`${this.endpoint}/${id}/take-down`, { reason: reason.trim() });
  }

  restore(id: string, reason?: string): Observable<AdminShortStayListing> {
    return this.api.post<AdminShortStayListing>(`${this.endpoint}/${id}/restore`, { reason: reason?.trim() || null });
  }
}
