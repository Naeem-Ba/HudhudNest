// src/app/core/api/admin-listing-reports.service.ts
//
// Admin-only (Role Admin enforced on the server for every route). Request bodies carry only the
// decision's own inputs: no status and no actor, the server decides both.
//   GET  /api/admin/listing-reports?search&status&open&reason&priority&assignedAdminId&unassigned&propertyId&from&to&overdue&sort&page&pageSize
//   GET  /api/admin/listing-reports/stats           (same filters, minus status/open/overdue/sort/paging)
//   GET  /api/admin/listing-reports/assignees
//   GET  /api/admin/listing-reports/{id}
//   POST /api/admin/listing-reports/{id}/start-review|assign|priority|notes|request-info|action-required|close|reopen
//   POST /api/admin/listing-reports/{id}/take-down-listing|restore-listing

import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { BackendApiService, QueryValue } from './backend-api.service';
import {
  AdminAssigneeDto,
  AdminListingReportDetailDto,
  AdminListingReportStatsDto,
  AdminListingReportSummaryDto,
  ListingReportFilter,
  ListingReportOutcome,
  ListingReportPriority,
  ReportPage
} from '../models/listing-report.model';

@Injectable({ providedIn: 'root' })
export class AdminListingReportsService {
  private readonly endpoint = '/admin/listing-reports';

  constructor(private readonly api: BackendApiService) {}

  search(filter: ListingReportFilter): Observable<ReportPage<AdminListingReportSummaryDto>> {
    return this.api.get<ReportPage<AdminListingReportSummaryDto>>(this.endpoint, this.query(filter, true));
  }

  stats(filter: ListingReportFilter): Observable<AdminListingReportStatsDto> {
    return this.api.get<AdminListingReportStatsDto>(`${this.endpoint}/stats`, this.query(filter, false));
  }

  assignees(): Observable<AdminAssigneeDto[]> {
    return this.api.get<AdminAssigneeDto[]>(`${this.endpoint}/assignees`);
  }

  get(id: string): Observable<AdminListingReportDetailDto> {
    return this.api.get<AdminListingReportDetailDto>(`${this.endpoint}/${id}`);
  }

  startReview(id: string): Observable<AdminListingReportDetailDto> {
    return this.act(id, 'start-review', {});
  }

  assign(id: string, adminUserId: string | null): Observable<AdminListingReportDetailDto> {
    return this.act(id, 'assign', { adminUserId });
  }

  changePriority(id: string, priority: ListingReportPriority, reason?: string): Observable<AdminListingReportDetailDto> {
    return this.act(id, 'priority', { priority, reason: reason?.trim() || null });
  }

  addNote(id: string, note: string): Observable<AdminListingReportDetailDto> {
    return this.act(id, 'notes', { note });
  }

  /** The message is shown to the reporter. */
  requestInfo(id: string, message: string): Observable<AdminListingReportDetailDto> {
    return this.act(id, 'request-info', { message });
  }

  markActionRequired(id: string, note: string): Observable<AdminListingReportDetailDto> {
    return this.act(id, 'action-required', { note });
  }

  close(id: string, outcome: ListingReportOutcome, note: string): Observable<AdminListingReportDetailDto> {
    return this.act(id, 'close', { outcome, note });
  }

  reopen(id: string, reason: string): Observable<AdminListingReportDetailDto> {
    return this.act(id, 'reopen', { reason });
  }

  /** Reason is shown to the listing owner. */
  takeDownListing(id: string, reason: string): Observable<AdminListingReportDetailDto> {
    return this.act(id, 'take-down-listing', { reason });
  }

  restoreListing(id: string, reason: string): Observable<AdminListingReportDetailDto> {
    return this.act(id, 'restore-listing', { reason });
  }

  private act(id: string, action: string, body: unknown): Observable<AdminListingReportDetailDto> {
    return this.api.post<AdminListingReportDetailDto>(`${this.endpoint}/${id}/${action}`, body);
  }

  private query(filter: ListingReportFilter, paged: boolean): Record<string, QueryValue> {
    const common: Record<string, QueryValue> = {
      search: filter.search?.trim() || undefined,
      reason: filter.reason || undefined,
      priority: filter.priority || undefined,
      assignedAdminId: filter.assignedAdminId || undefined,
      unassigned: filter.unassigned ? true : undefined,
      propertyId: filter.propertyId || undefined,
      from: filter.from || undefined,
      to: filter.to || undefined
    };
    if (!paged) return common;
    return {
      ...common,
      status: filter.status || undefined,
      open: filter.open ? true : undefined,
      overdue: filter.overdue ? true : undefined,
      sort: filter.sort || undefined,
      page: filter.page ?? 1,
      pageSize: filter.pageSize ?? 20
    };
  }
}
