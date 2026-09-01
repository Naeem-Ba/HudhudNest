// =============================================================
// src/app/core/api/admin-properties.service.ts
//
// لوحة الإدارة — إدارة إعلانات مستخدم محدد. يغلّف AdminController's listing endpoints
// (كل النقاط تتطلب دور Admin على الخادم، ومنفصلة تماماً عن مسار الرسوم/الدفع الذي
// يستخدمه المالك نفسه في listing-fees-api.service.ts):
//
//   GET  /api/Admin/users/{id}/properties?page=&pageSize=&status=
//   POST /api/Admin/properties/{propertyId}/feature    { days?, reason? }
//   POST /api/Admin/properties/{propertyId}/unfeature  { reason? }
//   POST /api/Admin/properties/{propertyId}/extend     { days, reason? }
//
// تمديد الإعلان هنا يعمل حتى لو كان صاحب الإعلان على الخطة المجانية — لا يوجد أي
// فحص للخطة/الحصة على هذا المسار إطلاقاً (القاعدة صريحة في المواصفة).
// =============================================================

import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';

import { BackendApiService } from './backend-api.service';
import { PagedResult } from '../models/api.model';
import { AdminPropertyStatus, AdminPropertySummary } from '../models/admin-property.model';
import { AdminOperationResult } from './admin-users.service';

@Injectable({ providedIn: 'root' })
export class AdminPropertiesService {
  constructor(private readonly api: BackendApiService) {}

  getUserProperties(
    userId: string,
    page = 1,
    pageSize = 20,
    status?: AdminPropertyStatus
  ): Observable<PagedResult<AdminPropertySummary>> {
    const params: Record<string, string | number> = { page, pageSize };
    if (status) params['status'] = status;

    return this.api
      .get<{ total?: number; page?: number; pageSize?: number; data?: unknown[] }>(
        `/Admin/users/${userId}/properties`,
        params
      )
      .pipe(
        map(response => {
          const items = ((response.data ?? []) as unknown[]).map(item => this.toSummary(item));
          const totalCount = response.total ?? items.length;
          const currentPage = response.page ?? page;
          const currentPageSize = response.pageSize ?? pageSize;

          return {
            items,
            totalCount,
            page: currentPage,
            pageSize: currentPageSize,
            totalPages: Math.max(1, Math.ceil(totalCount / (currentPageSize || 1))),
            hasNext: currentPage * currentPageSize < totalCount,
            hasPrevious: currentPage > 1
          } satisfies PagedResult<AdminPropertySummary>;
        })
      );
  }

  featureListing(propertyId: string, days?: number, reason?: string): Observable<AdminOperationResult> {
    return this.api.post<AdminOperationResult>(`/Admin/properties/${propertyId}/feature`, {
      days: days ?? null,
      reason: reason || null
    });
  }

  unfeatureListing(propertyId: string, reason?: string): Observable<AdminOperationResult> {
    return this.api.post<AdminOperationResult>(`/Admin/properties/${propertyId}/unfeature`, {
      reason: reason || null
    });
  }

  extendListing(propertyId: string, days: number, reason?: string): Observable<AdminOperationResult> {
    return this.api.post<AdminOperationResult>(`/Admin/properties/${propertyId}/extend`, {
      days,
      reason: reason || null
    });
  }

  private toSummary(item: unknown): AdminPropertySummary {
    const p = item as Record<string, unknown>;

    return {
      id: String(p['id'] ?? ''),
      title: String(p['title'] ?? ''),
      status: (p['status'] as AdminPropertyStatus) ?? 'Available',
      isPublished: Boolean(p['isPublished']),
      publishedAt: (p['publishedAt'] as string) ?? null,
      expiresAt: (p['expiresAt'] as string) ?? null,
      isFeatured: Boolean(p['isFeatured']),
      featuredUntil: (p['featuredUntil'] as string) ?? null,
      createdAt: String(p['createdAt'] ?? '')
    };
  }
}
