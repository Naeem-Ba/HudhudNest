import { AdBlockReason, AdConsentState, AdDecision, AdPlacement, PLACEMENT_ROUTES } from './ads.model';

export interface AdEligibilityInput {
  masterEnabled: boolean;
  platformEnabled: boolean;
  /** True when the platform has every id it needs for this placement. */
  idsPresent: boolean;
  placement: AdPlacement;
  /** Router path without query/fragment. */
  path: string;
  online: boolean;
  consent: AdConsentState;
  /** The provider failed to load earlier in this session. */
  loadFailed: boolean;
}

/** Strips query and fragment so "/properties?page=2#top" is treated as "/properties". */
export function pathOnly(url: string): string {
  return url.split(/[?#]/, 1)[0] ?? '';
}

/**
 * The single decision point. An ad is requested only when every layer agrees: master switch, platform switch,
 * an allowed page, configured ids, a network, usable consent and a provider that has not failed. The order only
 * decides which reason is reported; any failing layer blocks the request.
 */
export function evaluateAdEligibility(input: AdEligibilityInput): AdDecision {
  const block = (reason: AdBlockReason): AdDecision => ({ allowed: false, reason });
  if (!input.masterEnabled) return block('master-disabled');
  if (!input.platformEnabled) return block('platform-disabled');
  if (!PLACEMENT_ROUTES[input.placement].test(pathOnly(input.path))) return block('placement-not-allowed');
  if (!input.idsPresent) return block('missing-ids');
  if (input.loadFailed) return block('load-failed');
  if (!input.online) return block('offline');
  if (input.consent === 'unknown') return block('consent-unknown');
  if (input.consent === 'denied') return block('consent-denied');
  return { allowed: true };
}
