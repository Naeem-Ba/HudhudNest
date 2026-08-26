// src/app/core/api/review.service.ts

import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BackendApiService } from '../api/backend-api.service';
import {
  CreateReviewRequest,
  PropertyReviewSummaryDto,
  ReviewDto
} from '../models/review.model';

@Injectable({ providedIn: 'root' })
export class ReviewService {
  private readonly endpoint = '/reviews';

  constructor(private readonly api: BackendApiService) {}

  getPropertyReviewSummary(
    propertyId: string,
    page = 1,
    pageSize = 10
  ): Observable<PropertyReviewSummaryDto> {
    return this.api
      .get<unknown>(`${this.endpoint}/property/${propertyId}`, { page, pageSize })
      .pipe(map(response => this.toReviewSummary(response)));
  }

  getPropertyReviews(
    propertyId: string,
    page = 1,
    pageSize = 10
  ): Observable<ReviewDto[]> {
    return this.getPropertyReviewSummary(propertyId, page, pageSize).pipe(
      map(summary => summary.reviews)
    );
  }

  addReview(request: CreateReviewRequest): Observable<ReviewDto> {
    const body = {
      PropertyId: request.propertyId,
      Rating: request.rating,
      Comment: request.comment?.trim() || null
    };

    return this.api
      .post<unknown>(this.endpoint, body)
      .pipe(map(response => this.toReview(response)));
  }

  deleteReview(reviewId: string): Observable<void> {
    return this.api.delete<void>(`${this.endpoint}/${reviewId}`);
  }

  private toReviewSummary(raw: unknown): PropertyReviewSummaryDto {
    if (Array.isArray(raw)) {
      const reviews = raw.map(review => this.toReview(review));
      const averageRating = reviews.length
        ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
        : 0;

      return {
        averageRating,
        totalCount: reviews.length,
        reviews
      };
    }

    const s = (raw as Record<string, unknown>);
    const rawReviews = Array.isArray(s['reviews']) ? s['reviews'] : [];
    const reviews = rawReviews.map(review => this.toReview(review));

    return {
      averageRating: Number(s['averageRating'] ?? 0),
      totalCount: Number(s['totalCount'] ?? reviews.length),
      reviews
    };
  }

  private toReview(raw: unknown): ReviewDto {
    const r = (raw as Record<string, unknown>);
    return {
      id: String(r['id'] ?? ''),
      propertyId: String(r['propertyId'] ?? ''),
      reviewerId: String(r['reviewerId'] ?? ''),
      reviewerName: r['reviewerName'] as string | undefined,
      reviewerImageUrl: r['reviewerImageUrl'] as string | null | undefined,
      rating: Number(r['rating'] ?? 0),
      comment: r['comment'] as string | null | undefined,
      createdAt: String(r['createdAt'] ?? '')
    };
  }
}
