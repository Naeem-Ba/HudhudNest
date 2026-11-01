// Admin queue of payments waiting for confirmation: paid-plan requests and featured-listing
// requests. Consumes AdminPaymentRequestsController (api/admin/payment-requests), which is
// [Authorize(Roles = Admin)] on every action — the page-level AdminGuard is only a UX convenience.

import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BackendApiService } from './backend-api.service';
import {
  PendingExtensionPayment,
  PendingFeaturedPayment,
  PendingPaymentRequests,
  PendingPlanRequest
} from '../models/payment-request.model';

@Injectable({ providedIn: 'root' })
export class AdminPaymentRequestsApiService {
  private readonly endpoint = '/admin/payment-requests';

  constructor(private readonly api: BackendApiService) {}

  /** GET /api/admin/payment-requests — everything waiting for payment confirmation. */
  getPending(): Observable<PendingPaymentRequests> {
    return this.api.get<unknown>(this.endpoint).pipe(map(r => this.toPending(r)));
  }

  /** POST …/plans/{id}/approve — activates the requested plan for `durationDays`. */
  approvePlan(requestId: string, durationDays: number, reason?: string): Observable<unknown> {
    return this.api.post<unknown>(`${this.endpoint}/plans/${requestId}/approve`, {
      durationDays,
      reason: reason ?? null
    });
  }

  rejectPlan(requestId: string, reason?: string): Observable<unknown> {
    return this.api.post<unknown>(`${this.endpoint}/plans/${requestId}/reject`, { reason: reason ?? null });
  }

  /** POST …/featured/{transactionId}/approve — confirms the fee and promotes the listing. */
  approveFeatured(transactionId: string): Observable<unknown> {
    return this.api.post<unknown>(`${this.endpoint}/featured/${transactionId}/approve`, {});
  }

  rejectFeatured(transactionId: string, reason?: string): Observable<unknown> {
    return this.api.post<unknown>(`${this.endpoint}/featured/${transactionId}/reject`, {
      reason: reason ?? null
    });
  }

  /** POST …/extensions/{transactionId}/approve — confirms the fee and extends the listing by 30 days. */
  approveExtension(transactionId: string): Observable<unknown> {
    return this.api.post<unknown>(`${this.endpoint}/extensions/${transactionId}/approve`, {});
  }

  rejectExtension(transactionId: string, reason?: string): Observable<unknown> {
    return this.api.post<unknown>(`${this.endpoint}/extensions/${transactionId}/reject`, {
      reason: reason ?? null
    });
  }

  private toPending(response: unknown): PendingPaymentRequests {
    const root = (response ?? {}) as Record<string, unknown>;
    const plans = Array.isArray(root['plans']) ? (root['plans'] as Record<string, unknown>[]) : [];
    const featured = Array.isArray(root['featured']) ? (root['featured'] as Record<string, unknown>[]) : [];
    const extensions = Array.isArray(root['extensions']) ? (root['extensions'] as Record<string, unknown>[]) : [];

    return {
      plans: plans
        .map<PendingPlanRequest>(p => ({
          requestId: String(p['requestId'] ?? ''),
          userId: String(p['userId'] ?? ''),
          userName: String(p['userName'] ?? ''),
          email: (p['email'] as string | null | undefined) ?? null,
          tier: String(p['tier'] ?? ''),
          priceUsd: p['priceUsd'] == null ? null : Number(p['priceUsd']),
          requestedAt: String(p['requestedAt'] ?? '')
        }))
        .filter(p => !!p.requestId),
      featured: featured
        .map<PendingFeaturedPayment>(f => ({
          transactionId: String(f['transactionId'] ?? ''),
          propertyId: String(f['propertyId'] ?? ''),
          propertyTitle: String(f['propertyTitle'] ?? ''),
          ownerId: String(f['ownerId'] ?? ''),
          ownerName: String(f['ownerName'] ?? ''),
          ownerEmail: (f['ownerEmail'] as string | null | undefined) ?? null,
          amountUsd: Number(f['amountUsd'] ?? 0),
          requestedAt: String(f['requestedAt'] ?? '')
        }))
        .filter(f => !!f.transactionId),
      extensions: extensions
        .map<PendingExtensionPayment>(e => ({
          transactionId: String(e['transactionId'] ?? ''),
          propertyId: String(e['propertyId'] ?? ''),
          propertyTitle: String(e['propertyTitle'] ?? ''),
          ownerId: String(e['ownerId'] ?? ''),
          ownerName: String(e['ownerName'] ?? ''),
          ownerEmail: (e['ownerEmail'] as string | null | undefined) ?? null,
          amountUsd: Number(e['amountUsd'] ?? 0),
          requestedAt: String(e['requestedAt'] ?? ''),
          listingExpiresAt: (e['listingExpiresAt'] as string | null | undefined) ?? null
        }))
        .filter(e => !!e.transactionId)
    };
  }
}
