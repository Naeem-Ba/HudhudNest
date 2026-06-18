// src/app/core/models/review.model.ts
//
// ✅ نموذج جديد كامل — مطابق لمواصفات الـ API (قسم 9.10)

export interface ReviewDto {
  id: string;
  propertyId: string;
  reviewerId: string;
  reviewerName?: string;
  rating: number;          // 1 إلى 5
  comment?: string | null;
  createdAt: string;
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