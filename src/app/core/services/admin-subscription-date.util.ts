// Pure date-math for the admin dashboard's "extend subscription/listing" confirm dialogs —
// extracted so the preview shown BEFORE the admin confirms and the backend's actual
// computation can never silently drift, and so the rule is unit-testable without mounting
// a component.
//
// Mirrors UserAccount.ExtendPlan on the backend exactly:
//   - Active AND currentExpiresAt in the future  → add the extension on top of it.
//   - Expired / Cancelled / no expiry set at all  → start from "now".

export type EffectivePlanStatusLike = 'NoPlan' | 'Active' | 'Expired' | 'Cancelled';

/**
 * Computes the new expiry date an "extend" action would produce, without calling the
 * server — used to show the admin a live preview inside the confirm dialog.
 */
export function computeExtendedExpiry(
  currentStatus: EffectivePlanStatusLike,
  currentExpiresAt: Date | string | null,
  extraDays: number,
  now: Date = new Date()
): Date {
  const base = resolveExtensionBaseDate(currentStatus, currentExpiresAt, now);
  return addDays(base, extraDays);
}

/**
 * Same rule, exposed separately for callers (e.g. the listing-extend dialog, which has no
 * "status" concept — a listing is either extendable or it isn't) that just need the base
 * date an extension would start from, given an existing expiry (or null for "now").
 */
export function resolveExtensionBaseDate(
  currentStatus: EffectivePlanStatusLike,
  currentExpiresAt: Date | string | null,
  now: Date = new Date()
): Date {
  if (currentStatus !== 'Active' || !currentExpiresAt) {
    return now;
  }

  const expiry = typeof currentExpiresAt === 'string' ? new Date(currentExpiresAt) : currentExpiresAt;

  return expiry.getTime() > now.getTime() ? expiry : now;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + days);
  return result;
}
