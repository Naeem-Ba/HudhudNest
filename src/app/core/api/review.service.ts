// src/app/core/api/review.service.ts
//
// ✅ Bug Fix — getPropertyReviews (Bug #3)
//
// المشكلة:
//   كان getPropertyReviews يُشغِّل:
//     .get<ReviewDto[] | ApiPagedResult<ReviewDto>>(...)
//     .pipe(map(response => unwrapItems(response).map(...)))
//
//   لكن Backend يُعيد PropertyReviewSummaryDto:
//     { AverageRating: 4.2, TotalCount: 15, Reviews: [...] }
//
//   unwrapItems() يبحث عن items | Items | data | Data | results | Results
//   → لا يجد أياً منها → يُعيد [] دائماً
//   → التقييمات لا تظهر أبداً.
//
// الإصلاح:
//   1. تغيير نوع الإرجاع إلى Observable<PropertyReviewSummaryDto>
//   2. إضافة toReviewSummary() لقراءة حقل reviews مباشرةً
//   3. تحديث toReview() لتضمين reviewerImageUrl
//   4. حذف ApiPagedResult + unwrapItems (لم يعودا مطلوبَين)

import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BackendApiService } from '../api/backend-api.service';
import { apiToCamelCase } from '../adapters/api-naming.adapter';
import {
  CreateReviewRequest,
  PropertyReviewSummaryDto,
  ReviewDto
} from '../models/review.model';

@Injectable({ providedIn: 'root' })
export class ReviewService {
  private readonly endpoint = '/reviews';

  constructor(private readonly api: BackendApiService) {}

  /**
   * ✅ FIX: تقييمات عقار محدد — عام بدون JWT.
   *
   * Backend يُعيد PropertyReviewSummaryDto (وليس PagedResult):
   *   { averageRating, totalCount, reviews: ReviewDto[] }
   *
   * التغيير في نوع الإرجاع مقصود — يمنح المكونات الوصول لـ averageRating و totalCount
   * بدلاً من إخفائهما. المكونات التي تحتاج فقط للقائمة تقرأ summary.reviews.
   */
  getPropertyReviews(
    propertyId: string,
    page = 1,
    pageSize = 10
  ): Observable<PropertyReviewSummaryDto> {
    return this.api
      .get<unknown>(
        `${this.endpoint}/property/${propertyId}`,
        { page, pageSize }
      )
      .pipe(map(response => this.toReviewSummary(response)));
  }

  /**
   * إضافة تقييم — يتطلب تسجيل الدخول.
   * قيود: Rating ∈ [1,5] — يتم التحقق من Backend و Frontend.
   * UNIQUE(PropertyId, ReviewerId) — لا يمكن تقييم نفس العقار مرتين.
   */
  addReview(request: CreateReviewRequest): Observable<ReviewDto> {
    // Backend AddReviewRequest يتوقع PascalCase
    const body = {
      PropertyId: request.propertyId,
      Rating: request.rating,
      Comment: request.comment ?? null
    };

    return this.api
      .post<unknown>(this.endpoint, body)
      .pipe(map(response => this.toReview(response)));
  }

  /**
   * حذف تقييم — المالك أو Admin فقط.
   */
  deleteReview(reviewId: string): Observable<void> {
    return this.api.delete<void>(`${this.endpoint}/${reviewId}`);
  }

  /**
   * ✅ مُضاف: تحويل PropertyReviewSummaryDto من Backend
   *
   * بعد apiToCamelCase() على الاستجابة:
   *   { averageRating: number, totalCount: number, reviews: unknown[] }
   */
  private toReviewSummary(raw: unknown): PropertyReviewSummaryDto {
    const s = apiToCamelCase<Record<string, unknown>>(raw);
    const rawReviews = s['reviews'];

    return {
      averageRating: Number(s['averageRating'] ?? 0),
      totalCount: Number(s['totalCount'] ?? 0),
      reviews: Array.isArray(rawReviews)
        ? rawReviews.map(item => this.toReview(item))
        : []
    };
  }

  private toReview(raw: unknown): ReviewDto {
    const r = apiToCamelCase<Record<string, unknown>>(raw);
    return {
      id: String(r['id'] ?? ''),
      propertyId: String(r['propertyId'] ?? ''),
      reviewerId: String(r['reviewerId'] ?? ''),
      reviewerName: r['reviewerName'] as string | undefined,
      /** ✅ مُضاف: Backend PropertyReviewDto يُعيد ReviewerImageUrl */
      reviewerImageUrl: r['reviewerImageUrl'] as string | null | undefined,
      rating: Number(r['rating'] ?? 0),
      comment: r['comment'] as string | null | undefined,
      createdAt: String(r['createdAt'] ?? '')
    };
  }
}
