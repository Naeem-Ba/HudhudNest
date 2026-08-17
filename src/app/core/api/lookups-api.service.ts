// src/app/core/api/lookups-api.service.ts
//
// يستهلك LookupsController (api/lookups/*) — لم يكن مُستخدَماً إطلاقاً من قبل.
// المدن، الفئات وأنواع العقارات كانت مكتوبة يدويًا (hardcoded) في الواجهة
// بدلاً من الاعتماد على هذه النقاط الديناميكية من الباك اند.
//
// ملاحظة مهمة: "categories" و "property-types" (rent/sale/residential/commercial،
// apartment/house/villa/office/land) هما كتالوجان ثابتان في الباك اند نفسه
// (مكتوبان يدويًا في CommonLookupService) ولا يقابلهما أي حقل فعلي في
// Property Domain Model أو PropertyFilterDto حاليًا — لذلك يتم عرضهما هنا فقط
// كخدمة API جاهزة للاستخدام، دون فرض حقل واجهة وهمي لا يُحفظ فعليًا في الباك اند.
// راجع تقرير الفحص لمزيد من التفاصيل قبل ربطهما بأي شاشة.

import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BackendApiService } from './backend-api.service';
import { apiToCamelCase } from '../adapters/api-naming.adapter';

export interface LookupAmenity {
  id: string;
  name: string;
  category?: string | null;
  iconName?: string | null;
}

export interface LookupItem {
  id: string;
  name: string;
}

@Injectable({ providedIn: 'root' })
export class LookupsApiService {
  private readonly endpoint = '/lookups';

  constructor(private readonly api: BackendApiService) {}

  /** GET /api/lookups/amenities — قائمة المرافق الفعلية من قاعدة البيانات. */
  getAmenities(): Observable<LookupAmenity[]> {
    return this.api
      .get<unknown[]>(`${this.endpoint}/amenities`)
      .pipe(map(response => this.toAmenities(response)));
  }

  /** GET /api/lookups/categories */
  getCategories(): Observable<LookupItem[]> {
    return this.api
      .get<unknown[]>(`${this.endpoint}/categories`)
      .pipe(map(response => this.toLookupItems(response)));
  }

  /** GET /api/lookups/property-types */
  getPropertyTypes(): Observable<LookupItem[]> {
    return this.api
      .get<unknown[]>(`${this.endpoint}/property-types`)
      .pipe(map(response => this.toLookupItems(response)));
  }

  /** GET /api/lookups/cities — المدن الموجودة فعليًا ضمن العقارات الحالية. */
  getCities(): Observable<LookupItem[]> {
    return this.api
      .get<unknown[]>(`${this.endpoint}/cities`)
      .pipe(map(response => this.toLookupItems(response)));
  }

  /**
   * POST /api/lookups/refresh أو /api/lookups/refresh/{key} — تفريغ كاش
   * القوائم المرجعية (10 دقائق افتراضيًا) فورًا بدل انتظار انتهاء صلاحيته.
   * صلاحية Admin فقط على الباك اند.
   */
  refresh(key?: 'amenities' | 'categories' | 'property-types' | 'cities'): Observable<void> {
    return key
      ? this.api.post<void>(`${this.endpoint}/refresh/${key}`)
      : this.api.post<void>(`${this.endpoint}/refresh`);
  }

  private toAmenities(response: unknown): LookupAmenity[] {
    const list = Array.isArray(response) ? response : [];

    return list
      .map(item => apiToCamelCase<Record<string, unknown>>(item))
      .map(item => ({
        id: String(item['id'] ?? ''),
        name: String(item['name'] ?? ''),
        category: item['category'] === undefined || item['category'] === null ? null : String(item['category']),
        iconName: item['iconName'] === undefined || item['iconName'] === null ? null : String(item['iconName'])
      }))
      .filter(item => !!item.id && !!item.name);
  }

  private toLookupItems(response: unknown): LookupItem[] {
    const list = Array.isArray(response) ? response : [];

    return list
      .map(item => apiToCamelCase<Record<string, unknown>>(item))
      .map(item => ({
        id: String(item['id'] ?? ''),
        name: String(item['name'] ?? '')
      }))
      .filter(item => !!item.id);
  }
}
