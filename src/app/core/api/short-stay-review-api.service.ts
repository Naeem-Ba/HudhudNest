// Endpoint (HudhudNestApi.Controllers.ShortStayReviewsController):
//   POST /api/short-stay/reviews  { bookingId, rating (1-5), comment? (≤ 1000) }
//     201 → the review; 400 with an Arabic message when the stay is not reviewable yet / already
//     reviewed / the host has no active plan; 422 on validation.
// The listing's public review list is ShortStayListingApiService.getReviews.

import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { BackendApiService } from './backend-api.service';
import { CreateShortStayReviewRequest, ShortStayReviewDto } from '../models/short-stay.model';

@Injectable({ providedIn: 'root' })
export class ShortStayReviewApiService {
  private readonly endpoint = '/short-stay/reviews';

  constructor(private readonly api: BackendApiService) {}

  create(request: CreateShortStayReviewRequest): Observable<ShortStayReviewDto> {
    return this.api.post<ShortStayReviewDto>(this.endpoint, {
      bookingId: request.bookingId,
      rating: request.rating,
      comment: request.comment?.trim() || null
    });
  }
}
