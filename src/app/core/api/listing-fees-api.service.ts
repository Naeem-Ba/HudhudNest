// Consumes the two listing-fee endpoints on PropertiesController.
//
// Both return 202 Accepted, not 200: they record an outstanding charge and change nothing
// about the listing. The settlement endpoints are admin-only and are deliberately NOT
// wrapped here — a client that could call them could grant itself a free extension.

import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BackendApiService } from './backend-api.service';
import { ListingFeeKind, ListingFeeQuote } from '../models/listing-fee.model';

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
    const path = kind === 'extension'
      ? `${this.endpoint}/${propertyId}/extension`
      : `${this.endpoint}/${propertyId}/featured`;

    return this.api
      .post<unknown>(path, {})
      .pipe(map(response => this.toQuote(kind, response)));
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
