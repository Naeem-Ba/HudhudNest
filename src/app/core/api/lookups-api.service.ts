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

/**
 * Phase-0, Task 0 follow-up: the real, DB-backed structured-location catalog
 * (Governorate/District/Neighborhood). Distinct from LookupItem above — these
 * carry numeric ids (matching Property.GovernorateId/DistrictId/NeighborhoodId,
 * which are `int?` on the backend) and bilingual names, since the backend has
 * no German name column — see language.service.ts's LangCode ('en'|'ar'|'de');
 * `de` falls back to `nameEn` (see pickLocalizedName below).
 */
export interface StructuredLocationLookup {
  id: number;
  nameAr: string;
  nameEn: string;
  parentId?: number | null;
}

/** Phase-0, Task 0 follow-up: the real PropertyType table (id matches Property.PropertyTypeId). */
export interface PropertyTypeLookup {
  id: number;
  code: string;
  nameAr: string;
  nameEn: string;
  category: string;
  icon?: string | null;
}

/**
 * GET /api/lookups/currencies (QA Phase 7, P7-D01). `exchangeRateToUsd` is units of this currency per
 * one US dollar, set by an administrator and therefore approximate: it is good enough to compare
 * prices advertised in different currencies, not to quote a payable amount.
 */
export interface CurrencyLookup {
  code: string;
  nameEn: string;
  nameAr: string;
  symbol: string;
  decimalPlaces: number;
  exchangeRateToUsd: number;
  rateUpdatedAt: string;
  isBase: boolean;
}

/**
 * Picks the display name matching the current UI language for a bilingual
 * lookup item. No German column exists on the backend for these tables, so
 * 'de' (like any unrecognized code) falls back to English.
 */
export function pickLocalizedName(item: { nameAr: string; nameEn: string }, lang: string): string {
  return lang === 'ar' ? (item.nameAr || item.nameEn) : (item.nameEn || item.nameAr);
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

  /**
   * GET /api/lookups/cities — المدن الموجودة فعليًا ضمن العقارات الحالية.
   * مع governorateId تُقتصر القائمة على مدن تلك المحافظة.
   */
  getCities(governorateId?: number | null): Observable<LookupItem[]> {
    return this.api
      .get<unknown[]>(`${this.endpoint}/cities`, governorateId ? { governorateId } : undefined)
      .pipe(map(response => this.toLookupItems(response)));
  }

  /** GET /api/lookups/governorates?countryCode= — يفتَرض "SY" افتراضيًا إذا لم يُمرَّر. */
  getGovernorates(countryCode = 'SY'): Observable<StructuredLocationLookup[]> {
    return this.api
      .get<unknown[]>(`${this.endpoint}/governorates`, { countryCode })
      .pipe(map(response => this.toStructuredLocations(response)));
  }

  /** GET /api/lookups/districts?governorateId= — governorateId إلزامي. */
  getDistricts(governorateId: number): Observable<StructuredLocationLookup[]> {
    return this.api
      .get<unknown[]>(`${this.endpoint}/districts`, { governorateId })
      .pipe(map(response => this.toStructuredLocations(response)));
  }

  /** GET /api/lookups/neighborhoods?districtId= — districtId إلزامي. */
  getNeighborhoods(districtId: number): Observable<StructuredLocationLookup[]> {
    return this.api
      .get<unknown[]>(`${this.endpoint}/neighborhoods`, { districtId })
      .pipe(map(response => this.toStructuredLocations(response)));
  }

  /**
   * GET /api/lookups/property-type-catalog — الجدول الحقيقي (PropertyType)،
   * مختلف عن getPropertyTypes() أعلاه (كتالوج ثابت غير مرتبط بأي حقل فعلي).
   */
  getPropertyTypeCatalog(): Observable<PropertyTypeLookup[]> {
    return this.api
      .get<unknown[]>(`${this.endpoint}/property-type-catalog`)
      .pipe(map(response => this.toPropertyTypes(response)));
  }

  /** GET /api/lookups/currencies — العملات المفعّلة وأسعار صرفها التقريبية (الأساس أولًا). */
  getCurrencies(): Observable<CurrencyLookup[]> {
    return this.api
      .get<unknown[]>(`${this.endpoint}/currencies`)
      .pipe(map(response => this.toCurrencies(response)));
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
      .map(item => (item as Record<string, unknown>))
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
      .map(item => (item as Record<string, unknown>))
      .map(item => ({
        id: String(item['id'] ?? ''),
        name: String(item['name'] ?? '')
      }))
      .filter(item => !!item.id);
  }

  private toStructuredLocations(response: unknown): StructuredLocationLookup[] {
    const list = Array.isArray(response) ? response : [];

    return list
      .map(item => (item as Record<string, unknown>))
      .map(item => ({
        id: Number(item['id']),
        nameAr: String(item['nameAr'] ?? ''),
        nameEn: String(item['nameEn'] ?? ''),
        parentId: item['parentId'] === undefined || item['parentId'] === null ? null : Number(item['parentId'])
      }))
      .filter(item => Number.isFinite(item.id));
  }

  private toCurrencies(response: unknown): CurrencyLookup[] {
    const list = Array.isArray(response) ? response : [];

    return list
      .map(item => (item as Record<string, unknown>))
      .map(item => ({
        code: String(item['code'] ?? '').trim().toUpperCase(),
        nameEn: String(item['nameEn'] ?? ''),
        nameAr: String(item['nameAr'] ?? ''),
        symbol: String(item['symbol'] ?? ''),
        decimalPlaces: Number(item['decimalPlaces'] ?? 2),
        exchangeRateToUsd: Number(item['exchangeRateToUsd']),
        rateUpdatedAt: String(item['rateUpdatedAt'] ?? ''),
        isBase: Boolean(item['isBase'])
      }))
      .filter(item => !!item.code && Number.isFinite(item.exchangeRateToUsd) && item.exchangeRateToUsd > 0);
  }

  private toPropertyTypes(response: unknown): PropertyTypeLookup[] {
    const list = Array.isArray(response) ? response : [];

    return list
      .map(item => (item as Record<string, unknown>))
      .map(item => ({
        id: Number(item['id']),
        code: String(item['code'] ?? ''),
        nameAr: String(item['nameAr'] ?? ''),
        nameEn: String(item['nameEn'] ?? ''),
        category: String(item['category'] ?? ''),
        icon: item['icon'] === undefined || item['icon'] === null ? null : String(item['icon'])
      }))
      .filter(item => Number.isFinite(item.id));
  }
}
