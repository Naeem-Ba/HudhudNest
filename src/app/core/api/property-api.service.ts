import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { BackendApiService, QueryValue } from '../api/backend-api.service';
import { ApiPagedResult, normalizePagedResult, PagedResult, unwrapItems } from '../models/api.model';
import { DuplicateCheckResult, Property, PropertyFilterDto } from '../models/property.model';

/**
 * Mirrors PropertyApi.Application.Listings.DTOs.ListingExtensionQuoteDto exactly
 * (camelCase — Program.cs sets JsonNamingPolicy.CamelCase). A quote, not a receipt:
 * the listing is not extended until an admin confirms the fee (see
 * PropertyApiService.requestListingExtension's doc comment).
 */
export interface ListingExtensionQuote {
  transactionId: string;
  propertyId: string;
  amountUsd: number;
  extensionDays: number;
  expiresAt: string | null;
  graceEndsAt: string | null;
  isExistingPendingFee: boolean;
}

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

  /**
   * Phase-0, Task 2 — PATCH /properties/{id}/confirm-availability. Owner-only
   * on the backend (ForbiddenException for anyone else); the frontend also
   * gates the button behind isOwner (see property-detail.page.ts) so a
   * non-owner never even sees it, but the server check is what actually
   * enforces this.
   */
  confirmAvailability(id: string): Observable<void> {
    return this.api.patch<void>(`/properties/${id}/confirm-availability`);
  }

  /**
   * POST /properties/{id}/extension — PropertiesController.RequestExtension. Records a
   * pending fee for extending ONE expired-or-nearly-expired listing by one publication
   * period; does NOT extend the listing itself (no payment gateway exists yet — an admin
   * settles the fee via the admin dashboard, which is what actually applies the
   * extension). Idempotent on the backend: calling this again while a fee is still
   * pending returns the SAME transaction instead of stacking a second charge — see
   * ListingExtensionQuote.isExistingPendingFee.
   */
  requestListingExtension(propertyId: string): Observable<ListingExtensionQuote> {
    return this.api.post<ListingExtensionQuote>(`/properties/${propertyId}/extension`, {});
  }

  /** يعيّن صورة موجودة مسبقاً كصورة رئيسية (غلاف) للعقار. */
  setMainImage(propertyId: string, imageId: string): Observable<unknown> {
    return this.api.patch<unknown>(`/properties/${propertyId}/images/${imageId}/setmain`);
  }

  /** يحذف صورة محفوظة فعلياً من الخادم (وليس فقط من قائمة الرفع المحلية). */
  deleteImage(propertyId: string, imageId: string): Observable<void> {
    return this.api.delete<void>(`/properties/${propertyId}/images/${imageId}`);
  }

  /**
   * Phase-0, Task 4 — GET /properties/check-duplicate. Advisory only, never
   * blocks submission; ownerId is derived server-side from the JWT, not sent
   * here. listingType is the numeric enum value (ForRent=1, ForSale=2), which
   * matches property-form.page.ts's form.listingType control directly.
   */
  checkDuplicate(params: {
    neighborhoodId: number | null;
    area: number | null;
    price: number | null;
    listingType: number;
  }): Observable<DuplicateCheckResult> {
    return this.api
      .get<unknown>('/properties/check-duplicate', {
        neighborhoodId: params.neighborhoodId ?? undefined,
        area: params.area ?? undefined,
        price: params.price ?? undefined,
        listingType: params.listingType
      })
      .pipe(map(item => this.toDuplicateCheckResult(item)));
  }

  private toDuplicateCheckResult(item: unknown): DuplicateCheckResult {
    const result = (item as Record<string, unknown>);
    const rawCandidates = Array.isArray(result['candidates']) ? result['candidates'] : [];

    return {
      hasPotentialDuplicates: Boolean(result['hasPotentialDuplicates']),
      candidates: rawCandidates.map(candidate => {
        const c = (candidate as Record<string, unknown>);
        return {
          propertyId: String(c['propertyId'] ?? ''),
          title: String(c['title'] ?? ''),
          isSameOwner: Boolean(c['isSameOwner']),
          matchReason: String(c['matchReason'] ?? '')
        };
      })
    };
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
    const property = (item as Record<string, unknown>);
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
      .map(image => (image as Record<string, unknown>))
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
