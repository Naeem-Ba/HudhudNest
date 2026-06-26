// src/app/core/services/review.service.ts
//
// ✅ خدمة جديدة كاملة — مطابقة لمواصفات الـ API (قسم 9.10)
//
// Endpoints:
//   GET    /api/Reviews/property/{propertyId}?page=1&pageSize=10   ← تقييمات عقار (عام)
//   POST   /api/Reviews                                            ← إضافة تقييم (يتطلب تسجيل دخول)
//   DELETE /api/Reviews/{id}                                       ← حذف تقييم (المالك أو Admin)

import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BackendApiService } from '../api/backend-api.service';
import { ApiPagedResult, unwrapItems } from '../models/api.model';
import { apiToCamelCase } from '../adapters/api-naming.adapter';
import { CreateReviewRequest, ReviewDto } from '../models/review.model';

@Injectable({ providedIn: 'root' })
export class ReviewService {
  private readonly endpoint = '/reviews';

  constructor(private readonly api: BackendApiService) {}

  /**
   * تقييمات عقار محدد — عام بدون JWT.
   */
  getPropertyReviews(
    propertyId: string,
    page = 1,
    pageSize = 10
  ): Observable<ReviewDto[]> {
    return this.api
      .get<ReviewDto[] | ApiPagedResult<ReviewDto>>(
        `${this.endpoint}/property/${propertyId}`,
        { page, pageSize }
      )
      .pipe(map(response => unwrapItems(response).map(item => this.toReview(item))));
  }

  /**
   * إضافة تقييم — يتطلب تسجيل الدخول.
   * قيود: Rating ∈ [1,5] — يتم التحقق من Backend و Frontend.
   * UNIQUE(PropertyId, ReviewerId) — لا يمكن تقييم نفس العقار مرتين.
   */
  addReview(request: CreateReviewRequest): Observable<ReviewDto> {
    // ✅ الـ Backend يتوقع PascalCase
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

  private toReview(raw: unknown): ReviewDto {
    const r = apiToCamelCase<Record<string, unknown>>(raw);
    return {
      id: String(r['id'] ?? ''),
      propertyId: String(r['propertyId'] ?? ''),
      reviewerId: String(r['reviewerId'] ?? ''),
      reviewerName: r['reviewerName'] as string | undefined,
      rating: Number(r['rating'] ?? 0),
      comment: r['comment'] as string | null | undefined,
      createdAt: String(r['createdAt'] ?? '')
    };
  }
}