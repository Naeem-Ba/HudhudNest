// Endpoints (HudhudNestApi.Controllers.ShortStayListingsController):
//   GET    /api/short-stay/listings                          ← بحث عام (anonymous)
//   GET    /api/short-stay/listings/{id}                     ← تفاصيل إعلان (anonymous)
//   GET    /api/short-stay/listings/mine                     ← إعلاناتي (مضيف)
//   POST   /api/short-stay/listings                          ← إنشاء إعلان
//   PUT    /api/short-stay/listings/{id}                     ← تعديل إعلان
//   PUT    /api/short-stay/listings/{id}/publish              ← نشر
//   PUT    /api/short-stay/listings/{id}/unpublish            ← إلغاء نشر
//   POST   /api/short-stay/listings/{id}/room-types                    ← إضافة نوع غرفة
//   POST   /api/short-stay/listings/room-types/{roomTypeId}/units      ← إضافة وحدة
//   PUT    /api/short-stay/listings/room-types/{roomTypeId}/pricing-rules
//   PUT    /api/short-stay/listings/room-types/{roomTypeId}/minimum-stay-rules
//   GET    /api/short-stay/listings/units/{unitId}/blocks              ← فترات المضيف المحجوبة
//   POST   /api/short-stay/listings/units/{unitId}/blocks              ← حجب فترة (409 تقاطع / 422 نطاق غير صالح)
//   DELETE /api/short-stay/listings/units/{unitId}/blocks/{blockId}    ← فك الحجب
//   PUT    /api/short-stay/listings/units/{unitId}/availability        ← «غير متاح حاليًا» / «متاح»
//   GET    /api/short-stay/listings/{id}/reviews?page=&pageSize=       ← تقييمات الإعلان (anonymous)

import { HttpContext } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BackendApiService, QueryValue } from './backend-api.service';
import { SKIP_ERROR_TOAST } from '../interceptors/api-error.interceptor';
import { ApiPagedResult, normalizePagedResult, PagedResult, unwrapItems } from '../models/api.model';
import {
  AccommodationTypeDto,
  AddAccommodationUnitRequest,
  AddRoomTypeRequest,
  AddUnitBlockRequest,
  AccommodationUnitDto,
  CreateShortStayListingRequest,
  MinimumStayRuleDto,
  PricingRuleDto,
  RoomTypeDto,
  ShortStayListing,
  ShortStayReviewItem,
  ShortStayReviewSummary,
  ShortStayListingSearchFilter,
  ShortStayListingSummary,
  UnitBlockDto,
  UpdateShortStayListingRequest
} from '../models/short-stay.model';

@Injectable({ providedIn: 'root' })
export class ShortStayListingApiService {
  private readonly endpoint = '/short-stay/listings';

  constructor(private readonly api: BackendApiService) {}

  getAccommodationTypes(): Observable<AccommodationTypeDto[]> {
    return this.api
      .get<AccommodationTypeDto[] | ApiPagedResult<AccommodationTypeDto>>(`${this.endpoint}/accommodation-types`)
      .pipe(map(response => unwrapItems(response)));
  }

  search(filter: ShortStayListingSearchFilter = {}): Observable<PagedResult<ShortStayListingSummary>> {
    const page = filter.page ?? 1;
    const pageSize = filter.pageSize ?? 20;
    const query: Record<string, QueryValue> = {
      city: filter.city,
      searchTerm: filter.searchTerm,
      accommodationTypeId: filter.accommodationTypeId,
      locationId: filter.locationId,
      checkIn: filter.checkIn,
      checkOut: filter.checkOut,
      guests: filter.guests,
      minBedrooms: filter.minBedrooms,
      instantBooking: filter.instantBooking,
      amenityIds: filter.amenityIds,
      minPrice: filter.minPrice,
      maxPrice: filter.maxPrice,
      currencyCode: filter.currencyCode,
      sortBy: filter.sortBy,
      sortDescending: filter.sortDescending,
      page,
      pageSize
    };

    return this.api
      .get<ShortStayListingSummary[] | ApiPagedResult<ShortStayListingSummary>>(this.endpoint, query)
      .pipe(map(response => normalizePagedResult(response, item => item, page, pageSize)));
  }

  getById(id: string): Observable<ShortStayListing> {
    return this.api.get<ShortStayListing>(`${this.endpoint}/${id}`);
  }

  getMine(): Observable<ShortStayListingSummary[]> {
    return this.api
      .get<ShortStayListingSummary[] | ApiPagedResult<ShortStayListingSummary>>(`${this.endpoint}/mine`)
      .pipe(map(response => unwrapItems(response)));
  }

  create(request: CreateShortStayListingRequest): Observable<ShortStayListing> {
    return this.api.post<ShortStayListing>(this.endpoint, request);
  }

  update(id: string, request: UpdateShortStayListingRequest): Observable<ShortStayListing> {
    return this.api.put<ShortStayListing>(`${this.endpoint}/${id}`, request);
  }

  publish(id: string): Observable<void> {
    return this.api.put<void>(`${this.endpoint}/${id}/publish`);
  }

  unpublish(id: string): Observable<void> {
    return this.api.put<void>(`${this.endpoint}/${id}/unpublish`);
  }

  setAmenities(listingId: string, amenityIds: string[]): Observable<void> {
    return this.api.put<void>(`${this.endpoint}/${listingId}/amenities`, amenityIds);
  }

  uploadPhotos(listingId: string, files: File[]): Observable<string[]> {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    return this.api.postFormData<string[]>(`${this.endpoint}/${listingId}/photos`, formData);
  }

  addRoomType(listingId: string, request: AddRoomTypeRequest): Observable<RoomTypeDto> {
    return this.api.post<RoomTypeDto>(`${this.endpoint}/${listingId}/room-types`, request);
  }

  addUnit(roomTypeId: string, request: AddAccommodationUnitRequest): Observable<AccommodationUnitDto> {
    return this.api.post<AccommodationUnitDto>(`${this.endpoint}/room-types/${roomTypeId}/units`, request);
  }

  setPricingRules(
    roomTypeId: string,
    rules: Array<Pick<PricingRuleDto, 'ruleType' | 'dayOfWeek' | 'dateRangeStart' | 'dateRangeEnd' | 'pricePerNight'>>
  ): Observable<void> {
    return this.api.put<void>(`${this.endpoint}/room-types/${roomTypeId}/pricing-rules`, rules);
  }

  setMinimumStayRules(
    roomTypeId: string,
    rules: Array<Pick<MinimumStayRuleDto, 'minimumNights' | 'dateRangeStart' | 'dateRangeEnd'>>
  ): Observable<void> {
    return this.api.put<void>(`${this.endpoint}/room-types/${roomTypeId}/minimum-stay-rules`, rules);
  }

  // ── إتاحة الوحدة (المضيف) ────────────────────────────────────────────
  getUnitBlocks(unitId: string): Observable<UnitBlockDto[]> {
    return this.api
      .get<UnitBlockDto[] | ApiPagedResult<UnitBlockDto>>(`${this.endpoint}/units/${unitId}/blocks`)
      .pipe(map(response => unwrapItems(response)));
  }

  addUnitBlock(unitId: string, request: AddUnitBlockRequest): Observable<UnitBlockDto> {
    return this.api.post<UnitBlockDto>(`${this.endpoint}/units/${unitId}/blocks`, request);
  }

  removeUnitBlock(unitId: string, blockId: string): Observable<void> {
    return this.api.delete<void>(`${this.endpoint}/units/${unitId}/blocks/${blockId}`);
  }

  setUnitAvailability(unitId: string, isActive: boolean): Observable<AccommodationUnitDto> {
    return this.api.put<AccommodationUnitDto>(`${this.endpoint}/units/${unitId}/availability`, { isActive });
  }

  // ── التقييمات (عامة) ────────────────────────────────────────────────
  /** The section on the detail page shows its own state, so a failure here must not add a toast. */
  getReviews(listingId: string, page = 1, pageSize = 10): Observable<ShortStayReviewSummary> {
    return this.api
      .get<Partial<ShortStayReviewSummary> | null>(
        `${this.endpoint}/${listingId}/reviews`,
        { page, pageSize },
        { context: new HttpContext().set(SKIP_ERROR_TOAST, true) }
      )
      .pipe(map(response => ({
        averageRating: Number(response?.averageRating ?? 0),
        totalCount: Number(response?.totalCount ?? response?.reviews?.length ?? 0),
        reviews: (response?.reviews ?? []) as ShortStayReviewItem[]
      })));
  }
}
