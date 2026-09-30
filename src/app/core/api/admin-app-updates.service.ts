// يغلّف نقاط النهاية الإدارية لـ App Update Management (HudhudNestApi.Controllers.
// AdminAppReleasesController) — كل نقطة هنا تتطلب دور Admin على الخادم
// ([Authorize(Roles = "Admin")])؛ AdminGuard على المسار في app.routes.ts وسيلة UX فقط،
// الخادم هو الحد الفعلي.
//
//   GET    /api/admin/app-releases                 ← قائمة مُرقَّمة، تصفية بالمنصة/التفعيل
//   GET    /api/admin/app-releases/{id}             ← تفاصيل
//   POST   /api/admin/app-releases                  ← إنشاء
//   PUT    /api/admin/app-releases/{id}              ← تعديل (Platform غير قابل للتعديل —
//                                                       تغيير المنصة يعني إنشاء سجل جديد)
//   POST   /api/admin/app-releases/{id}/enable
//   POST   /api/admin/app-releases/{id}/disable
//   DELETE /api/admin/app-releases/{id}             ← حذف ناعم (IsDeleted، لا حذف فعلي)
//
// كل الحقول camelCase (JsonNamingPolicy.CamelCase على الباك-إند بالكامل).
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ApiPagedResult, PagedResult, normalizePagedResult } from '../models/api.model';
import { BackendApiService, QueryValue } from './backend-api.service';

export type AppReleasePlatform = 'Android' | 'IOS' | 'Web';

export interface AppReleaseDto {
  id: string;
  platform: AppReleasePlatform;
  version: string;
  minimumSupportedVersion: string;
  storeUrl: string | null;
  releaseNotesAr: string | null;
  releaseNotesEn: string | null;
  releaseNotesDe: string | null;
  releaseDate: string;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AppReleaseFilter {
  platform?: AppReleasePlatform;
  isEnabled?: boolean;
  page?: number;
  pageSize?: number;
}

/** يطابق CreateAppReleaseRequest على الخادم حرفياً. */
export interface CreateAppReleaseValue {
  platform: AppReleasePlatform;
  version: string;
  minimumSupportedVersion: string;
  storeUrl: string | null;
  releaseNotesAr: string | null;
  releaseNotesEn: string | null;
  releaseNotesDe: string | null;
  releaseDate: string;
  isEnabled: boolean;
}

/** يطابق UpdateAppReleaseRequest — بلا platform وبلا isEnabled عمداً (التفعيل/التعطيل
 * عبر enable/disable فقط، لا عبر PUT عام). */
export interface UpdateAppReleaseValue {
  version: string;
  minimumSupportedVersion: string;
  storeUrl: string | null;
  releaseNotesAr: string | null;
  releaseNotesEn: string | null;
  releaseNotesDe: string | null;
  releaseDate: string;
}

@Injectable({ providedIn: 'root' })
export class AdminAppUpdatesService {
  private readonly endpoint = '/admin/app-releases';

  constructor(private readonly api: BackendApiService) {}

  getReleases(filter: AppReleaseFilter = {}): Observable<PagedResult<AppReleaseDto>> {
    const page = filter.page ?? 1;
    const pageSize = filter.pageSize ?? 20;
    const query: Record<string, QueryValue> = { page, pageSize };
    if (filter.platform) query['platform'] = filter.platform;
    if (filter.isEnabled !== undefined) query['isEnabled'] = filter.isEnabled;

    return this.api
      .get<AppReleaseDto[] | ApiPagedResult<AppReleaseDto>>(this.endpoint, query)
      .pipe(map(response => normalizePagedResult(response, item => item, page, pageSize)));
  }

  createRelease(value: CreateAppReleaseValue): Observable<{ id: string }> {
    return this.api.post<{ id: string }>(this.endpoint, value);
  }

  updateRelease(id: string, value: UpdateAppReleaseValue): Observable<void> {
    return this.api.put<void>(`${this.endpoint}/${id}`, value);
  }

  enableRelease(id: string): Observable<void> {
    return this.api.post<void>(`${this.endpoint}/${id}/enable`);
  }

  disableRelease(id: string): Observable<void> {
    return this.api.post<void>(`${this.endpoint}/${id}/disable`);
  }

  deleteRelease(id: string): Observable<void> {
    return this.api.delete<void>(`${this.endpoint}/${id}`);
  }
}
