// src/app/core/models/review.model.ts

export interface ReviewDto {
  id: string;
  propertyId: string;
  reviewerId: string;
  reviewerName?: string;
  reviewerImageUrl?: string | null;
  rating: number;
  comment?: string | null;
  createdAt: string;
}

export interface PropertyReviewSummaryDto {
  averageRating: number;
  totalCount: number;
  reviews: ReviewDto[];
}

export interface CreateReviewRequest {
  propertyId: string;
  rating: number;
  comment?: string | null;
}

export const REVIEW_COMMENT_MAX_LENGTH = 1000;

export function validateCreateReview(request: CreateReviewRequest): string | null {
  if (!request.propertyId?.trim()) {
    return 'REVIEW.PROPERTY_REQUIRED';
  }

  if (!Number.isInteger(request.rating) || request.rating < 1 || request.rating > 5) {
    return 'REVIEW.RATING_RANGE';
  }

  if (request.comment && request.comment.length > REVIEW_COMMENT_MAX_LENGTH) {
    return 'REVIEW.COMMENT_TOO_LONG';
  }

  return null;
}
