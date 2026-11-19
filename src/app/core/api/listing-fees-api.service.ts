// Consumes the two listing-fee endpoints on PropertiesController.
//
// Both return 202 Accepted, not 200: they record an outstanding charge and change nothing
// about the listing. The settlement endpoints are admin-only and are deliberately NOT
// wrapped here — a client that could call them could grant itself a free extension.

import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BackendApiService } from './backend-api.service';
import { ExtraListingStatus, ListingFeeKind, ListingFeeQuote, PendingFeaturedRequest } from '../models/listing-fee.model';

@Injectable({ providedIn: 'root' })
export class ListingFeesApiService {
  private readonly endpoint = '/properties';

  constructor(private readonly api: BackendApiService) {}

  /**
   * Records what the owner owes for the given fee, and returns it as a quote.
   *
   * Safe to call twice: the server reuses an existing Pending fee of the same type rather
   * than stacking a second charge, and flags the reuse in `isExistingPendingFee`.
   */
  request(kind: ListingFeeKind, propertyId: string): Observable<ListingFeeQuote> {
    if (kind === 'extra-listing') {
      return this.api
        .post<unknown>('/extra-listing/request', {})
        .pipe(map(response => this.toExtraListingQuote(response)));
    }

    const path = kind === 'extension'
      ? `${this.endpoint}/${propertyId}/extension`
      : `${this.endpoint}/${propertyId}/featured`;

    return this.api
      .post<unknown>(path, {})
      .pipe(map(response => this.toQuote(kind, response)));
  }

  /** GET /extra-listing — can the owner pay for one more listing, and what is already pending or paid. */
  getExtraListingStatus(): Observable<ExtraListingStatus> {
    return this.api.get<unknown>('/extra-listing').pipe(map(response => {
      const row = (response ?? {}) as Record<string, unknown>;
      return {
        canRequest: row['canRequest'] === true,
        blockedCode: this.asNullableString(row['blockedCode']),
        hasPendingRequest: row['hasPendingRequest'] === true,
        pendingRequestId: this.asNullableString(row['pendingRequestId']),
        availableCredits: Number(row['availableCredits'] ?? 0),
        priceUsd: Number(row['priceUsd'] ?? 0),
        listingDays: Number(row['listingDays'] ?? 0),
        activeListings: Number(row['activeListings'] ?? 0),
        limit: Number(row['limit'] ?? 0)
      };
    }));
  }

  /**
   * The owner's featured requests an administrator has not confirmed yet
   * (GET /properties/featured/pending), so "my listings" can mark the listings that
   * already have one instead of offering to request it again.
   */
  getMyPendingFeatured(): Observable<PendingFeaturedRequest[]> {
    return this.api
      .get<unknown[]>(`${this.endpoint}/featured/pending`)
      .pipe(map(list => (Array.isArray(list) ? list : []).map(item => {
        const row = item as Record<string, unknown>;
        return {
          transactionId: String(row['transactionId'] ?? ''),
          propertyId: String(row['propertyId'] ?? ''),
          amountUsd: Number(row['amountUsd'] ?? 0),
          featuredDays: Number(row['featuredDays'] ?? 0),
          requestedAt: String(row['requestedAt'] ?? '')
        };
      })));
  }

  /** The request id is the reference the owner quotes on the payment, like a transaction id for the other fees. */
  private toExtraListingQuote(response: unknown): ListingFeeQuote {
    const item = (response ?? {}) as Record<string, unknown>;
    return {
      kind: 'extra-listing',
      transactionId: String(item['requestId'] ?? ''),
      propertyId: '',
      amountUsd: Number(item['amountUsd'] ?? 0),
      days: Number(item['listingDays'] ?? 0),
      expiresAt: null,
      graceEndsAt: null,
      currentFeaturedUntil: null,
      projectedFeaturedUntil: null,
      isExistingPendingFee: item['isExistingPendingRequest'] === true
    };
  }

  private toQuote(kind: ListingFeeKind, response: unknown): ListingFeeQuote {
    const item = (response as Record<string, unknown>);

    // The two endpoints return different day fields (ExtensionDays / FeaturedDays) because
    // they sell different things. Normalised to one `days` here so the template does not
    // branch on the fee kind just to read a number.
    const days = kind === 'extension' ? item['extensionDays'] : item['featuredDays'];

    return {
      kind,
      transactionId: String(item['transactionId'] ?? ''),
      propertyId: String(item['propertyId'] ?? ''),
      amountUsd: Number(item['amountUsd'] ?? 0),
      days: Number(days ?? 0),
      expiresAt: this.asNullableString(item['expiresAt']),
      graceEndsAt: this.asNullableString(item['graceEndsAt']),
      currentFeaturedUntil: this.asNullableString(item['currentFeaturedUntil']),
      projectedFeaturedUntil: this.asNullableString(item['projectedFeaturedUntil']),
      isExistingPendingFee: item['isExistingPendingFee'] === true
    };
  }

  private asNullableString(value: unknown): string | null {
    return value === undefined || value === null ? null : String(value);
  }
}
