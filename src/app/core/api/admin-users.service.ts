// =============================================================
// src/app/core/api/admin-users.service.ts
//
// يغلّف AdminController (api/Admin) — كل النقاط تتطلب دور Admin على الخادم:
//   GET    /api/Admin/users?page=&pageSize=&role=
//   GET    /api/Admin/roles
//   PUT    /api/Admin/users/{id}/role        { role }
//   POST   /api/Admin/users/{id}/roles/{role}
//   DELETE /api/Admin/users/{id}/roles/{role}
//   DELETE /api/Admin/users/{id}             ← تعطيل (Disable) وليس حذفاً نهائياً
// =============================================================

import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';

import { BackendApiService } from './backend-api.service';
import { PagedResult } from '../models/api.model';

export interface AdminUserDto {
  id: string;
  email: string | null;
  firstName: string;
  lastName: string;
  displayName: string | null;
  createdAt: string;
  roles: string[];
}

export interface AdminOperationResult {
  message: string;
  allowedRoles?: string[];
  errors?: string[];
}

@Injectable({ providedIn: 'root' })
export class AdminUsersService {
  constructor(private readonly api: BackendApiService) {}

  getUsers(page = 1, pageSize = 20, role?: string): Observable<PagedResult<AdminUserDto>> {
    const query: Record<string, string | number> = { page, pageSize };
    if (role) {
      query['role'] = role;
    }

    return this.api
      .get<{ total?: number; Total?: number; page?: number; pageSize?: number; data?: unknown[]; Data?: unknown[] }>('/Admin/users', query)
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

  private toUser(item: unknown): AdminUserDto {
    const user = (item as Record<string, unknown>);

    return {
      id: String(user['id'] ?? ''),
      email: (user['email'] as string) ?? null,
      firstName: String(user['firstName'] ?? ''),
      lastName: String(user['lastName'] ?? ''),
      displayName: (user['displayName'] as string) ?? null,
      createdAt: String(user['createdAt'] ?? ''),
      roles: Array.isArray(user['roles']) ? (user['roles'] as string[]) : []
    };
  }
}
