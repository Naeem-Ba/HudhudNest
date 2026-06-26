// src/app/core/api/property-api.service.ts
//
// ✅ Bug Fix — getMyProperties (Bug #1)
//
// المشكلة:
//   كان getMyProperties يستدعي /properties/mine ثم يتراجع إلى /properties/my.
//   لا يوجد أي من هذين الـ endpoints في PropertiesController — كلاهما يعطي 404.
//
// الإصلاح:
//   GET /api/Properties?ownerId={userId}
//   PropertyFilterDto في الـ Backend يحتوي OwnerId: Guid?
//   وفي الـ Frontend يحتوي ownerId?: string (موجود بالفعل في property.model.ts)
//   ASP.NET Core يُطابق query parameters بدون حساسية لحالة الأحرف.
//
// التغييرات:
//   - إضافة inject(AuthService) للحصول على userId من الـ JWT
//   - استبدال الـ fallback المعطوب بـ getProperties({ ownerId })
//   - حذف catchError من الـ imports (لم يعد مُستخدَماً)

import { Injectable } from '@angular/core';
import { map, Observable, throwError } from 'rxjs';
import { BackendApiService, QueryValue } from '../api/backend-api.service';
import { ApiPagedResult, unwrapItems } from '../models/api.model';
import { Property, PropertyFilterDto } from '../models/property.model';
import { apiToCamelCase } from '../adapters/api-naming.adapter';
import { AuthService } from '../auth/auth.service';

@Injectable({ providedIn: 'root' })
export class PropertyApiService {
  constructor(
    private readonly api: BackendApiService,
    // ✅ FIX: مُضاف للحصول على userId من الـ JWT بدلاً من استدعاء endpoint وهمي
    private readonly auth: AuthService
  ) {}

  getProperties(filter: PropertyFilterDto = {}): Observable<Property[]> {
    return this.api
      .get<Property[] | ApiPagedResult<Property>>('/properties', filter as Record<string, QueryValue>)
      .pipe(map(response => unwrapItems(response).map(item => this.toProperty(item))));
  }

  /**
   * ✅ FIX: استبدال /properties/mine + /properties/my (endpoints غير موجودة)
   *         بـ GET /api/Properties?ownerId={userId}
   *
   * الـ Backend: PropertyFilterDto.OwnerId: Guid?
   * الـ Frontend: PropertyFilterDto.ownerId?: string (موجود في property.model.ts)
   *
   * ملاحظة أمنية: الـ Backend يُنفِّذ فلترة الملكية عبر GetPropertiesListQuery
   * وليس عبر JWT مباشرة على هذا الـ endpoint — المستخدم لا يستطيع تعديل
   * استجابة الـ API بتغيير الـ ownerId لأن الـ AllowAnonymous هنا مقصود
   * للسماح بالبحث العام، والـ ownerId مجرد معامل فلترة.
   */
  getMyProperties(): Observable<Property[]> {
    const userId = this.auth.getCurrentUserId();
    if (!userId) {
      return throwError(() => new Error('NOT_AUTHENTICATED'));
    }
    return this.getProperties({ ownerId: userId });
  }

  getProperty(id: string): Observable<Property> {
    return this.api
      .get<unknown>(`/properties/${id}`)
      .pipe(map(item => this.toProperty(item)));
  }

  deleteProperty(id: string): Observable<void> {
    return this.api.delete<void>(`/properties/${id}`);
  }

  createProperty(payload: unknown): Observable<unknown> {
    return this.api.post<unknown>('/properties', payload);
  }

  updateProperty(id: string, payload: unknown): Observable<unknown> {
    return this.api.put<unknown>(`/properties/${id}`, payload);
  }

  uploadImages(propertyId: string, formData: FormData): Observable<unknown[]> {
    return this.api.postFormData<unknown[]>(
      `/properties/${propertyId}/images`,
      formData
    );
  }

  private getPropertyCollection(path: string): Observable<Property[]> {
    return this.api
      .get<Property[] | ApiPagedResult<Property>>(path)
      .pipe(map(response => unwrapItems(response).map(item => this.toProperty(item))));
  }

  private toProperty(item: unknown): Property {
    const property = apiToCamelCase<Record<string, unknown>>(item);
    const images = this.normalizeImages(property);

    return {
      ...(property as Partial<Property>),
      id: String(property['id'] ?? ''),
      title: String(property['title'] ?? ''),
      city: String(property['city'] ?? ''),
      images,
      imageUrls: this.toStringArray(property['imageUrls'])
    } as Property;
  }

  private normalizeImages(property: Record<string, unknown>): Property['images'] {
    const rawImages = property['images'];
    const images = Array.isArray(rawImages) ? rawImages : [];

    const normalized: NonNullable<Property['images']> = images
      .map(image => apiToCamelCase<Record<string, unknown>>(image))
      .map(image => ({
        id: image['id'] === undefined || image['id'] === null ? undefined : String(image['id']),
        url: String(image['url'] ?? ''),
        isMain: Boolean(image['isMain']),
        altText: image['altText'] === undefined || image['altText'] === null ? undefined : String(image['altText'])
      }))
      .filter(image => !!image.url);

    const mainImageUrl = property['mainImageUrl'];
    if (typeof mainImageUrl === 'string' && mainImageUrl.trim()) {
      normalized.unshift({ url: mainImageUrl, isMain: true });
    }

    this.toStringArray(property['imageUrls']).forEach(url => {
      if (!normalized.some(image => image.url === url)) {
        normalized.push({ url, isMain: false });
      }
    });

    return normalized;
  }

  private toStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
  }
}
