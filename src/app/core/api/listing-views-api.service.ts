// =============================================================
// src/app/core/api/listing-views-api.service.ts
//
//   POST /api/properties/{id}/views
//   POST /api/short-stay/listings/{id}/views      record "the detail page was opened"
//   GET  /api/listing-views/stats?scope=mine|agency
//   GET  /api/listing-views/{kind}/{id}/trend?days=
//
// The client never sends a count. Recording failures are silent by design (SKIP_ERROR_TOAST): a
// statistic must never get in the way of looking at a listing.
// =============================================================

import { Injectable, inject } from '@angular/core';
import { HttpContext } from '@angular/common/http';
import { Observable } from 'rxjs';

import { BackendApiService } from './backend-api.service';
import { SKIP_ERROR_TOAST } from '../interceptors/api-error.interceptor';
import { VisitorIdService } from '../listing-views/visitor-id.service';
import { ListingViewKind, ListingViewResult, ListingViewStats, ListingViewTrend } from '../models/listing-views.model';

@Injectable({ providedIn: 'root' })
export class ListingViewsApiService {
  private readonly api = inject(BackendApiService);
  private readonly visitorId = inject(VisitorIdService);

  record(kind: ListingViewKind, listingId: string): Observable<ListingViewResult> {
    const path = kind === 'property'
      ? `/properties/${listingId}/views`
      : `/short-stay/listings/${listingId}/views`;

    return this.api.post<ListingViewResult>(path, undefined, {
      context: new HttpContext().set(SKIP_ERROR_TOAST, true),
      headers: { 'X-Visitor-Id': this.visitorId.get() }
    });
  }

  getStats(scope: 'mine' | 'agency' = 'mine'): Observable<ListingViewStats> {
    return this.api.get<ListingViewStats>('/listing-views/stats', { scope });
  }

  getTrend(kind: ListingViewKind, listingId: string, days = 30): Observable<ListingViewTrend> {
    return this.api.get<ListingViewTrend>(`/listing-views/${kind}/${listingId}/trend`, { days });
  }
}
