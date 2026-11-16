import { Agency } from '../models/agency.model';

/** Days an office stays visible after its owner's plan ends, so it can be renewed (product decision 2026-11-07). */
export const AGENCY_GRACE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface AgencyGrace {
  /** The owner's plan ended less than AGENCY_GRACE_DAYS ago. */
  active: boolean;
  /** Whole days left (rounded up, at least 1 while active); 0 when not active. */
  daysLeft: number;
  /** When the grace period ends, ISO string; null when not active. */
  endsAt: string | null;
}

const NONE: AgencyGrace = { active: false, daysLeft: 0, endsAt: null };

/**
 * The grace period of an office whose owner's plan has expired. It applies to the owner and to every
 * member alike (the owner's plan is what counts). No end date (never had a plan, or a cancelled plan
 * without one) means no grace: there is nothing to renew back to.
 */
export function agencyGrace(agency: Agency | null | undefined, now: Date = new Date()): AgencyGrace {
  if (!agency || agency.ownerPlanStatus !== 'Expired' || !agency.ownerPlanExpiresAt) {
    return NONE;
  }

  const expiredAt = new Date(agency.ownerPlanExpiresAt).getTime();
  if (Number.isNaN(expiredAt)) {
    return NONE;
  }

  const endsAt = expiredAt + AGENCY_GRACE_DAYS * DAY_MS;
  const left = endsAt - now.getTime();
  if (left <= 0) {
    return NONE;
  }

  return { active: true, daysLeft: Math.max(1, Math.ceil(left / DAY_MS)), endsAt: new Date(endsAt).toISOString() };
}
