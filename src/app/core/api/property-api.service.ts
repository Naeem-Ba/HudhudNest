import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { BackendApiService, QueryValue } from '../api/backend-api.service';
import { ApiPagedResult, normalizePagedResult, PagedResult, unwrapItems } from '../models/api.model';
import { Property, PropertyFilterDto } from '../models/property.model';
import { apiToCamelCase } from '../adapters/api-naming.adapter';

@Injectable({ providedIn: 'root' })
export class PropertyApiService {
  constructor(private readonly api: BackendApiService) {}

  getProperties(filter: PropertyFilterDto = {}): Observable<Property[]> {
    return this.getPropertiesPaged(filter).pipe(map(result => result.items));
  }

  getPropertiesPaged(filter: PropertyFilterDto = {}): Observable<PagedResult<Property>> {
    const page = filter.page ?? 1;
    const pageSize = filter.pageSize ?? 20;

    return this.api
      .get<Property[] | ApiPagedResult<Property>>(
        '/properties',
        this.toQuery(filter)
      )
      .pipe(
        map(response => normalizePagedResult(
          response,
          item => this.toProperty(item),
          page,
          pageSize
        ))
      );
  }

  /**
   * Loads only the authenticated user's own listings.
   * This avoids the unsafe frontend fallback of requesting all properties and
   * filtering them by ownerId on the client.
   *
   * ✅ تنظيف: أُزيل fallback كان يتراجع عند 404 إلى GET /properties/my
   * (مفرد) — هذا المسار غير موجود بالباك اند الحالي إطلاقاً (PropertiesController
   * يوفّر فقط GET /properties/mine بصيغة الجمع). كود ميت لا يُنفَّذ أبدًا؛
   * تأكدت من ذلك بفحص PropertiesController.cs مباشرة قبل الحذف.
   */
  getMyProperties(): Observable<Property[]> {
    return this.getPropertyCollection('/properties/mine');
  }

  getProperty(id: string): Observable<Property> {
    return this.api
      .get<unknown>(`/properties/${id}`)
      .pipe(map(item => this.toProperty(item)));
  }

  /**
   * ✅ إضافة: GET /properties/{id}/manage — نقطة مخصصة لصفحة التعديل، مصممة
   * لتُرجع العقار للمالك أو الأدمن حتى لو لم يكن منشوراً بعد (Draft)، بينما
   * getProperty() العام أعلاه يعتمد على GetPublishedByIdWithDetailsAsync
   * بالباك اند ويرفض أي عقار غير منشور بـ 404 — حتى لصاحبه. كما يتحقق الخادم
   * من الملكية صراحة هنا (403 لغير المالك/الأدمن) بدل الاعتماد فقط على تحقق
   * الملكية عند الحفظ. شكل الاستجابة مطابق تماماً لـ getProperty() (نفس
   * PropertyDto بالباك اند)، لذا toProperty() هنا تعمل دون أي تعديل.
   */
  getPropertyForManagement(id: string): Observable<Property> {
    return this.api
      .get<unknown>(`/properties/${id}/manage`)
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

  // 📌 قرار معماري موثَّق: الباك اند يوفر أيضاً GET منفصل لجلب صور عقار محدد
  // (PropertyImagesController.GetAll)، لكن الواجهة لا تستدعيه مباشرة لأن كل
  // نقاط الاستهلاك الحالية (بطاقة العقار، صفحة التفاصيل، نموذج التعديل) تحصل
  // على الصور أصلاً ضمن استجابة GetProperty/GetPropertyForManagement (نفس
  // PropertyDto يتضمن Images/ImageUrls). يستحق إضافة هذه النقطة لاحقاً فقط إذا
  // ظهرت شاشة تحتاج تحديث الصور دون إعادة تحميل بيانات العقار كاملة.

  /**
   * ينشر إعلاناً في وضع مسودة. الخادم يوفر PUBLISH فقط (نشر لمرة واحدة) —
   * لا يوجد endpoint "unpublish" للتراجع عن النشر (تحقق مباشر من الكود).
   *
   * 📌 قرار معماري موثَّق: الباك اند (PropertiesController) يقبل هذا المسار
   * نفسه عبر PATCH و POST معاً (نفس الـ handler بالضبط) — الأرجح أن POST كان
   * الفعل الأصلي واستُبدل بـ PATCH لاحقاً (الأنسب دلاليًا لعملية "تحديث حالة")
   * وتُرك POST لتوافقية النسخ القديمة. الواجهة تستخدم PATCH فقط عمدًا، وهذا
   * ليس نقصًا يحتاج إصلاحًا.
   */
  publishProperty(id: string): Observable<void> {
    return this.api.patch<void>(`/properties/${id}/publish`);
  }

  /**
   * بحث جغرافي عبر PostGIS. radiusKm محدود إلى 50 كم من طرف الخادم،
   * ونمرره كما هو هنا دون تكرار التحقق كي لا نخفي أخطاء الخادم الحقيقية.
   */
  geoSearch(
    latitude: number,
    longitude: number,
    radiusKm = 5,
    filter: PropertyFilterDto = {}
  ): Observable<PagedResult<Property>> {
    const page = filter.page ?? 1;
    const pageSize = filter.pageSize ?? 20;

    const query: Record<string, QueryValue> = {
      ...this.toQuery(filter),
      latitude,
      longitude,
      radiusKm
    };

    return this.api
      .get<Property[] | ApiPagedResult<Property>>('/properties/geo-search', query)
      .pipe(
        map(response => normalizePagedResult(
          response,
          item => this.toProperty(item),
          page,
          pageSize
        ))
      );
  }

  /** يعيّن صورة موجودة مسبقاً كصورة رئيسية (غلاف) للعقار. */
  setMainImage(propertyId: string, imageId: string): Observable<unknown> {
    return this.api.patch<unknown>(`/properties/${propertyId}/images/${imageId}/setmain`);
  }

  /** يحذف صورة محفوظة فعلياً من الخادم (وليس فقط من قائمة الرفع المحلية). */
  deleteImage(propertyId: string, imageId: string): Observable<void> {
    return this.api.delete<void>(`/properties/${propertyId}/images/${imageId}`);
  }

  private getPropertyCollection(path: string): Observable<Property[]> {
    return this.api
      .get<Property[] | ApiPagedResult<Property>>(path)
      .pipe(map(response => unwrapItems(response).map(item => this.toProperty(item))));
  }

  private toQuery(filter: PropertyFilterDto): Record<string, QueryValue> {
    const query: Record<string, QueryValue> = {};

    Object.entries(filter).forEach(([key, value]) => {
      if (key === 'isPublished') {
        return;
      }

      if (Array.isArray(value)) {
        if (value.length > 0) {
          query[key] = value.map(String);
        }
        return;
      }

      if (value !== undefined && value !== null && value !== '') {
        query[key] = value as QueryValue;
      }
    });

    return query;
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
