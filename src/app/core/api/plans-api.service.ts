// Mirrors saved-search-api.service.ts's shape.
//
// GET /api/plans now exists on the backend (PlansController, seeded from PlansSeed.cs
// with the exact same tier/key/price data as SUBSCRIPTION_PLANS below — the two are
// meant to be kept in sync). getPlans() calls it directly. SUBSCRIPTION_PLANS/of(...)
// stays only as toCta()'s route table (see below) and as a fallback shape reference.
// The documented contract lives in FRONTEND_BACKEND_CONTRACT.md §11.

import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BackendApiService } from './backend-api.service';
import { PlanPriceKind, PlanTier, SubscriptionPlan } from '../models/subscription-plan.model';

const VALID_TIERS: readonly PlanTier[] = ['free', 'basic', 'premium', 'elite'];
const VALID_PRICE_KINDS: readonly PlanPriceKind[] = ['free', 'monthly', 'contact'];

@Injectable({ providedIn: 'root' })
export class PlansApiService {
  private readonly endpoint = '/plans';

  constructor(private readonly api: BackendApiService) {}

  /** The public plan catalog, now backend-sourced. */
  getPlans(): Observable<SubscriptionPlan[]> {
    return this.getPlansFromApi();
  }

  getPlansFromApi(): Observable<SubscriptionPlan[]> {
    return this.api.get<unknown[]>(this.endpoint)
      .pipe(map(response => this.toPlans(response)));
  }

  /**
   * Records the caller's explicit plan choice — including "free", which is a real
   * selection here rather than an implicit default (see UserAccount.PlanId's doc
   * comment on the backend). POST /api/users/me/plan, not part of the §11 contract
   * above since it's deliberately a lighter-weight addition: no billing cycle, no
   * checkout — just "which tier did they pick".
   */
  selectPlan(tier: PlanTier): Observable<void> {
    return this.api.post<void>('/users/me/plan', { tier });
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
          listingLimit: item['listingLimit'] === null || item['listingLimit'] === undefined
            ? null
            : Number(item['listingLimit']),
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
