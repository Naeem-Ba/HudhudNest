// Mirrors saved-search-api.service.ts's shape.
//
// Contract-first: GET /api/plans does NOT exist on the backend yet (verified — there
// is no PlansController, no SubscriptionPlan entity, no migration). getPlans() therefore
// serves the local catalog today. The response mapper below is already written against
// the documented contract, so enabling the real endpoint is a one-line swap inside
// getPlans(). The planned contract lives in FRONTEND_BACKEND_CONTRACT.md.

import { Injectable } from '@angular/core';
import { Observable, map, of } from 'rxjs';
import { BackendApiService } from './backend-api.service';
import {
  PlanPriceKind,
  PlanTier,
  SUBSCRIPTION_PLANS,
  SubscriptionPlan
} from '../models/subscription-plan.model';

const VALID_TIERS: readonly PlanTier[] = ['free', 'basic', 'premium', 'elite'];
const VALID_PRICE_KINDS: readonly PlanPriceKind[] = ['free', 'monthly', 'contact'];

@Injectable({ providedIn: 'root' })
export class PlansApiService {
  private readonly endpoint = '/plans';

  constructor(private readonly api: BackendApiService) {}

  /**
   * The public plan catalog.
   *
   * Today: served from the local constant so the page is real and testable without
   * a backend. When PlansController ships, delete the `of(...)` line and uncomment
   * the request below — toPlans() already handles the PascalCase payload.
   */
  getPlans(): Observable<SubscriptionPlan[]> {
    return of([...SUBSCRIPTION_PLANS]);

    // return this.api.get<unknown[]>(this.endpoint)
    //   .pipe(map(response => this.toPlans(response)));
  }

  /**
   * Reserved for the future GET /api/plans response shape. Kept live (and exercised by
   * getPlansFromApi) rather than commented out so it cannot silently rot.
   */
  getPlansFromApi(): Observable<SubscriptionPlan[]> {
    return this.api.get<unknown[]>(this.endpoint)
      .pipe(map(response => this.toPlans(response)));
  }

  private toPlans(response: unknown): SubscriptionPlan[] {
    const list = Array.isArray(response) ? response : [];

    return list
      .map(item => (item as Record<string, unknown>))
      .map(item => {
        const tier = this.toTier(item['tier']);
        const noteKey = String(item['noteKey'] ?? '');

        return {
          tier,
          nameKey: String(item['nameKey'] ?? ''),
          taglineKey: String(item['taglineKey'] ?? ''),
          priceKind: this.toPriceKind(item['priceKind']),
          priceUsd: item['priceUsd'] === null || item['priceUsd'] === undefined
            ? null
            : Number(item['priceUsd']),
          featureKeys: Array.isArray(item['featureKeys'])
            ? (item['featureKeys'] as unknown[]).map(key => String(key))
            : [],
          // Empty string would render as a blank note row, so drop it entirely.
          ...(noteKey ? { noteKey } : {}),
          isRecommended: item['isRecommended'] === true,
          ctaKey: String(item['ctaKey'] ?? ''),
          ...this.toCta(tier)
        };
      })
      .filter(plan => !!plan.nameKey);
  }

  /**
   * Destinations stay client-side on purpose: they are Angular routes, and letting the
   * API hand the app a URL to navigate to would be an open-redirect surface for no gain.
   */
  private toCta(tier: PlanTier): Pick<SubscriptionPlan, 'ctaRoute' | 'ctaQueryParams'> {
    return tier === 'free'
      ? { ctaRoute: '/property-form', ctaQueryParams: {} }
      : { ctaRoute: '/kontakt', ctaQueryParams: { plan: tier } };
  }

  private toTier(value: unknown): PlanTier {
    const raw = String(value ?? '').toLowerCase() as PlanTier;
    return VALID_TIERS.includes(raw) ? raw : 'basic';
  }

  private toPriceKind(value: unknown): PlanPriceKind {
    const raw = String(value ?? '').toLowerCase() as PlanPriceKind;
    return VALID_PRICE_KINDS.includes(raw) ? raw : 'monthly';
  }
}
