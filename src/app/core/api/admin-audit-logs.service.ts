// =============================================================
// src/app/core/api/admin-audit-logs.service.ts
//
// قراءة سجل التدقيق للمشرف فقط (المرحلة 14، D06) — AdminAuditLogsController:
//   GET /api/admin/audit-logs?page=&pageSize=&action=&userId=&from=&to=&search=
// قراءة فقط: لا يوجد تعديل ولا حذف لأي سطر. عنوان IP يصل مقنّعاً من الخادم.
// =============================================================

import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';

import { BackendApiService } from './backend-api.service';

export interface AdminAuditLogEntry {
  id: string;
  timestamp: string;
  userId: string | null;
  userName: string | null;
  action: string;
  ipAddress: string | null;
  oldValue: string | null;
  newValue: string | null;
}

export interface AdminAuditLogPage {
  items: AdminAuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AdminAuditLogQuery {
  action?: string;
  userId?: string;
  from?: string;
  to?: string;
  search?: string;
}

@Injectable({ providedIn: 'root' })
export class AdminAuditLogsService {
  constructor(private readonly api: BackendApiService) {}

  search(page = 1, pageSize = 50, query: AdminAuditLogQuery = {}): Observable<AdminAuditLogPage> {
    const params: Record<string, string | number> = { page, pageSize };
    if (query.action) params['action'] = query.action;
    if (query.userId) params['userId'] = query.userId;
    if (query.from) params['from'] = query.from;
    if (query.to) params['to'] = query.to;
    if (query.search) params['search'] = query.search;

    return this.api
      .get<{ total?: number; page?: number; pageSize?: number; data?: AdminAuditLogEntry[] }>('/admin/audit-logs', params)
      .pipe(
        map(response => {
          const items = response.data ?? [];
          const total = response.total ?? items.length;
          const size = response.pageSize ?? pageSize;
          return {
            items,
            total,
            page: response.page ?? page,
            pageSize: size,
            totalPages: Math.max(1, Math.ceil(total / (size || 1)))
          } satisfies AdminAuditLogPage;
        })
      );
  }
}
