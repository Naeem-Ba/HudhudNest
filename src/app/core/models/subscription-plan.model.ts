// Subscription plan catalog — the four tiers shown on /pricing.
//
// IMPORTANT: there is no backend for plans yet. A repo-wide search of PropertyApi
// for subscription/plan/billing/agency returns zero results — no entity, no table,
// no endpoint. So the catalog below is the single source of truth for now, and
// PlansApiService is written contract-first so swapping it for GET /api/plans is
// a one-line change. See FRONTEND_BACKEND_CONTRACT.md.

/** The four tiers. Kept as a string union so routes/query params stay readable. */
export type PlanTier = 'free' | 'basic' | 'premium' | 'elite';

/**
 * How the price is presented.
 * - 'free'    — no figure, no checkout; the card shows PRICING.FREE_PRICE.
 * - 'monthly' — priceUsd is rendered with PRICING.PER_MONTH.
 * - 'contact' — no public number; the user is routed to sales instead.
 */
export type PlanPriceKind = 'free' | 'monthly' | 'contact';

export interface SubscriptionPlan {
  tier: PlanTier;
  /** i18n key, never a literal — see angular-ui-development-roadmap.md §6. */
  nameKey: string;
  taglineKey: string;
  priceKind: PlanPriceKind;
  /** USD. 0 for the free tier, null when priceKind is 'contact'. USD is the base
   *  currency in CurrencySeed.cs. */
  priceUsd: number | null;
  /** i18n keys, rendered as the feature checklist. */
  featureKeys: string[];
  /**
   * Optional i18n key for a caveat rendered under the checklist, outside it.
   * Deliberately NOT a featureKey: the checklist is a list of things you get, and
   * putting "your listing is deleted" behind a green tick would misread.
   */
  noteKey?: string;
  /** Exactly one plan should carry this — it drives the highlighted card styling. */
  isRecommended: boolean;
  ctaKey: string;
  /**
   * Where the CTA goes. The free tier points at the listing form because that flow
   * exists and works today; the paid tiers point at the contact form because no
   * checkout exists (see FRONTEND_BACKEND_CONTRACT.md §11).
   */
  ctaRoute: string;
  ctaQueryParams: Record<string, string>;
}

/**
 * Only the numbers are data here; every visible string is an i18n key.
 *
 * The free tier's three-month validity, the expiry alert and the paid extension are
 * now implemented in PropertyApi (2026-08-23): ExpiresAt is set on publish,
 * ListingExpiryHostedService warns then expires then deletes after a 30-day grace,
 * and the one-active-listing limit is enforced with a 409. What is still only a
 * TERM is the payment itself — there is no payment gateway, so an extension is
 * granted by an admin-only endpoint. See FRONTEND_BACKEND_CONTRACT.md §11.6.
 *
 * An earlier version of this comment claimed none of that existed. It was written
 * without reading the backend source; ExpiresAt and the notification producer were
 * already there. Corrected here for the same reason it was corrected in the docs.
 */
export const SUBSCRIPTION_PLANS: readonly SubscriptionPlan[] = [
  {
    tier: 'free',
    nameKey: 'PRICING.FREE.NAME',
    taglineKey: 'PRICING.FREE.TAGLINE',
    priceKind: 'free',
    priceUsd: 0,
    featureKeys: [
      'PRICING.FREE.F1',
      'PRICING.FREE.F2',
      'PRICING.FREE.F3',
      'PRICING.FREE.F4'
    ],
    noteKey: 'PRICING.FREE.NOTE',
    isRecommended: false,
    ctaKey: 'PRICING.FREE.CTA',
    ctaRoute: '/property-form',
    ctaQueryParams: {}
  },
  {
    tier: 'basic',
    nameKey: 'PRICING.BASIC.NAME',
    taglineKey: 'PRICING.BASIC.TAGLINE',
    priceKind: 'monthly',
    priceUsd: 49,
    featureKeys: [
      'PRICING.BASIC.F1',
      'PRICING.BASIC.F2',
      'PRICING.BASIC.F3',
      'PRICING.BASIC.F4',
      'PRICING.BASIC.F5'
    ],
    isRecommended: false,
    ctaKey: 'PRICING.BASIC.CTA',
    ctaRoute: '/kontakt',
    ctaQueryParams: { plan: 'basic' }
  },
  {
    tier: 'premium',
    nameKey: 'PRICING.PREMIUM.NAME',
    taglineKey: 'PRICING.PREMIUM.TAGLINE',
    priceKind: 'monthly',
    priceUsd: 99,
    featureKeys: [
      'PRICING.PREMIUM.F1',
      'PRICING.PREMIUM.F2',
      'PRICING.PREMIUM.F3',
      'PRICING.PREMIUM.F4',
      'PRICING.PREMIUM.F5'
    ],
    isRecommended: true,
    ctaKey: 'PRICING.PREMIUM.CTA',
    ctaRoute: '/kontakt',
    ctaQueryParams: { plan: 'premium' }
  },
  {
    tier: 'elite',
    nameKey: 'PRICING.ELITE.NAME',
    taglineKey: 'PRICING.ELITE.TAGLINE',
    priceKind: 'contact',
    priceUsd: null,
    featureKeys: ['PRICING.ELITE.F1', 'PRICING.ELITE.F2', 'PRICING.ELITE.F3'],
    isRecommended: false,
    ctaKey: 'PRICING.ELITE.CTA',
    ctaRoute: '/kontakt',
    ctaQueryParams: { plan: 'elite' }
  }
];
