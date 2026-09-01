// =============================================================
// src/app/core/api/admin-users.service.ts
//
// يغلّف AdminController (api/Admin) — كل النقاط تتطلب دور Admin على الخادم:
//   GET    /api/Admin/users?page=&pageSize=&role=&search=&planTier=&accountStatus=
//   GET    /api/Admin/users/{id}
//   GET    /api/Admin/roles
//   PUT    /api/Admin/users/{id}/role        { role }
//   POST   /api/Admin/users/{id}/roles/{role}
//   DELETE /api/Admin/users/{id}/roles/{role}
//   DELETE /api/Admin/users/{id}             ← تعطيل (Disable) وليس حذفاً نهائياً
//
// لوحة الإدارة — الخطة/الاشتراك (لا دفع فعلي، تفعيل/تمديد/إلغاء إداري فقط):
//   POST /api/Admin/users/{id}/subscription/activate  { tier, durationDays, reason? }
//   POST /api/Admin/users/{id}/subscription/extend    { days, reason? }
//   POST /api/Admin/users/{id}/subscription/cancel    { reason? }
// =============================================================

import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';

import { BackendApiService } from './backend-api.service';
import { PagedResult } from '../models/api.model';
import { PlanTier } from '../models/subscription-plan.model';

/** "NoPlan" | "Active" | "Expired" | "Cancelled" — UserAccount.GetEffectivePlanStatus on the backend. */
export type EffectivePlanStatus = 'NoPlan' | 'Active' | 'Expired' | 'Cancelled';

export type AccountStatus = 'Active' | 'Disabled';

export type PlanActivationSource = 'SelfService' | 'AdminGrant' | null;

export interface AdminUserDto {
  id: string;
  email: string | null;
  phoneNumber: string | null;
  firstName: string;
  lastName: string;
  displayName: string | null;
  createdAt: string;
  roles: string[];
  accountStatus: AccountStatus;
  planTier: PlanTier | null;
  planStatus: EffectivePlanStatus;
  planExpiresAt: string | null;
  totalListings: number;
  activeListings: number;
  featuredListings: number;
}

export interface AdminUserDetailDto extends AdminUserDto {
  planNameKey: string | null;
  planStartedAt: string | null;
  planCancelledAt: string | null;
  planActivationSource: PlanActivationSource;
  listingLimit: number | null;
}

export interface AdminOperationResult {
  message: string;
  allowedRoles?: string[];
  errors?: string[];
}

export interface AdminUsersQuery {
  role?: string;
  search?: string;
  planTier?: string;
  accountStatus?: string;
}

@Injectable({ providedIn: 'root' })
export class AdminUsersService {
  constructor(private readonly api: BackendApiService) {}

  getUsers(page = 1, pageSize = 20, query: AdminUsersQuery = {}): Observable<PagedResult<AdminUserDto>> {
    const params: Record<string, string | number> = { page, pageSize };
    if (query.role) params['role'] = query.role;
    if (query.search) params['search'] = query.search;
    if (query.planTier) params['planTier'] = query.planTier;
    if (query.accountStatus) params['accountStatus'] = query.accountStatus;

    return this.api
      .get<{ total?: number; Total?: number; page?: number; pageSize?: number; data?: unknown[]; Data?: unknown[] }>('/Admin/users', params)
      .pipe(
        map(response => {
          const items = ((response.data ?? response.Data ?? []) as unknown[]).map(item => this.toUser(item));
          const totalCount = response.total ?? response.Total ?? items.length;
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
          } satisfies PagedResult<AdminUserDto>;
        })
      );
  }

  getUserDetail(userId: string): Observable<AdminUserDetailDto> {
    return this.api.get<Record<string, unknown>>(`/Admin/users/${userId}`).pipe(
      map(item => this.toUserDetail(item))
    );
  }

  getRoles(): Observable<string[]> {
    return this.api.get<string[]>('/Admin/roles');
  }

  /** يستبدل كل أدوار المستخدم بدور واحد محدد. */
  setRole(userId: string, role: string): Observable<AdminOperationResult> {
    // ✅ الـ Backend يتوقع PascalCase في الـ body (نفس نمط visit.service.ts)
    return this.api.put<AdminOperationResult>(`/Admin/users/${userId}/role`, { Role: role });
  }

  /** يضيف دوراً إضافياً دون إزالة البقية. */
  assignRole(userId: string, role: string): Observable<AdminOperationResult> {
    return this.api.post<AdminOperationResult>(`/Admin/users/${userId}/roles/${role}`);
  }

  removeRole(userId: string, role: string): Observable<AdminOperationResult> {
    return this.api.delete<AdminOperationResult>(`/Admin/users/${userId}/roles/${role}`);
  }

  /** تحذير: يُعطِّل الحساب (Soft-disable) على الخادم، وليس حذفاً نهائياً. */
  disableUser(userId: string): Observable<void> {
    return this.api.delete<void>(`/Admin/users/${userId}`);
  }

  /** تفعيل خطة مدفوعة للمستخدم يدوياً — بلا أي عملية دفع فعلية. */
  activatePlan(userId: string, tier: PlanTier, durationDays: number, reason?: string): Observable<AdminOperationResult> {
    return this.api.post<AdminOperationResult>(`/Admin/users/${userId}/subscription/activate`, {
      tier,
      durationDays,
      reason: reason || null
    });
  }

  /** تمديد الاشتراك الحالي بعدد أيام محدد. */
  extendSubscription(userId: string, days: number, reason?: string): Observable<AdminOperationResult> {
    return this.api.post<AdminOperationResult>(`/Admin/users/${userId}/subscription/extend`, {
      days,
      reason: reason || null
    });
  }

  /** إلغاء/إيقاف الاشتراك — فوري، يعيد المستخدم إلى الخطة المجانية. */
  cancelSubscription(userId: string, reason?: string): Observable<AdminOperationResult> {
    return this.api.post<AdminOperationResult>(`/Admin/users/${userId}/subscription/cancel`, {
      reason: reason || null
    });
  }

  private toUser(item: unknown): AdminUserDto {
    const user = (item as Record<string, unknown>);

    return {
      id: String(user['id'] ?? ''),
      email: (user['email'] as string) ?? null,
      phoneNumber: (user['phoneNumber'] as string) ?? null,
      firstName: String(user['firstName'] ?? ''),
      lastName: String(user['lastName'] ?? ''),
      displayName: (user['displayName'] as string) ?? null,
      createdAt: String(user['createdAt'] ?? ''),
      roles: Array.isArray(user['roles']) ? (user['roles'] as string[]) : [],
      accountStatus: (user['accountStatus'] as AccountStatus) ?? 'Active',
      planTier: (user['planTier'] as PlanTier) ?? null,
      planStatus: (user['planStatus'] as EffectivePlanStatus) ?? 'NoPlan',
      planExpiresAt: (user['planExpiresAt'] as string) ?? null,
      totalListings: Number(user['totalListings'] ?? 0),
      activeListings: Number(user['activeListings'] ?? 0),
      featuredListings: Number(user['featuredListings'] ?? 0)
    };
  }

  private toUserDetail(item: Record<string, unknown>): AdminUserDetailDto {
    return {
      ...this.toUser(item),
      planNameKey: (item['planNameKey'] as string) ?? null,
      planStartedAt: (item['planStartedAt'] as string) ?? null,
      planCancelledAt: (item['planCancelledAt'] as string) ?? null,
      planActivationSource: (item['planActivationSource'] as PlanActivationSource) ?? null,
      listingLimit: item['listingLimit'] === null || item['listingLimit'] === undefined
        ? null
        : Number(item['listingLimit'])
    };
  }
}
