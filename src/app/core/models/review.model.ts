// src/app/core/models/review.model.ts
//
// ✅ Bug Fix — getPropertyReviews shape (Bug #3)
//
// التغييرات:
//   1. إضافة reviewerImageUrl إلى ReviewDto
//      (Backend PropertyReviewDto يُعيد ReviewerImageUrl — كان مفقوداً في الـ model)
//
//   2. إضافة PropertyReviewSummaryDto
//      Backend GET /api/Reviews/property/{id} يُعيد:
//        PropertyReviewSummaryDto { AverageRating, TotalCount, Reviews: [...] }
//      وليس PagedResult<ReviewDto> — هذا هو سبب الـ bug:
//        unwrapItems() يبحث عن items/Items/data/Data/results/Results → لا يجد شيئاً → []

export interface ReviewDto {
  id: string;
  propertyId: string;
  reviewerId: string;
  reviewerName?: string;
  /** ✅ مُضاف: Backend يُعيد ReviewerImageUrl في PropertyReviewDto */
  reviewerImageUrl?: string | null;
  rating: number;          // 1 إلى 5
  comment?: string | null;
  createdAt: string;
}

/**
 * ✅ مُضاف: Shape الفعلي لاستجابة GET /api/Reviews/property/{propertyId}
 *
 * Backend يُعيد PropertyReviewSummaryDto — وليس PagedResult:
 *   public sealed record PropertyReviewSummaryDto(
 *     double                           AverageRating,
 *     int                              TotalCount,
 *     IReadOnlyList<PropertyReviewDto> Reviews
 *   );
 *
 * بعد apiToCamelCase() تُصبح: { averageRating, totalCount, reviews: [...] }
 */
export interface PropertyReviewSummaryDto {
  averageRating: number;
  totalCount: number;
  reviews: ReviewDto[];
}

// طلب إضافة تقييم
export interface CreateReviewRequest {
  propertyId: string;
  rating: number;          // 1 إلى 5 (مطلوب من Backend validator)
  comment?: string | null;
}

// تحقق من القيود
export function validateCreateReview(request: CreateReviewRequest): string | null {
  if (!request.propertyId?.trim()) {
    return 'REVIEW.PROPERTY_REQUIRED';
  }
  if (!Number.isInteger(request.rating) || request.rating < 1 || request.rating > 5) {
    return 'REVIEW.RATING_RANGE';
  }
  return null;
}
