// =============================================================
// src/app/core/sharing/utm-platform-mapping.ts
//
// UTM / Attribution (Phase 2 of Social Sharing & Distribution) — the single, central place that
// maps a SharePlatform to its default utm_source/utm_medium. Nothing outside this file (no
// provider, no component, no other service) hardcodes one of these strings — see
// UtmAttributionService.getDefaultContext, the only place that reads from it. Adding a new
// share platform means adding one line here, not touching every provider (section 7 of the
// feature spec: "لا تكون هذه القيم موزعة عشوائيًا داخل Providers أو Components").
// =============================================================

import { SharePlatform } from './share.model';

/**
 * utm_source per platform — stable, lowercase, snake_case values (section 4: never spaces,
 * never renamed once shipped, since historical reports key off these exact strings). Mirrors
 * PropertiesController's SharePlatform enum naming 1:1 in spirit, but deliberately uses the
 * lowercase report-facing convention UTM values are expected to have (Facebook Ads, Google
 * Analytics, etc. all lowercase utm_source) rather than the PascalCase wire-format enum name.
 */
export const SHARE_PLATFORM_UTM_SOURCE: Record<SharePlatform, string> = {
  [SharePlatform.Facebook]: 'facebook',
  [SharePlatform.WhatsApp]: 'whatsapp',
  [SharePlatform.Telegram]: 'telegram',
  [SharePlatform.Native]: 'native',
  [SharePlatform.CopyLink]: 'copy_link',
  [SharePlatform.Other]: 'other'
};

/**
 * utm_medium per platform. Every share-intent platform is 'social'.
 *
 * 📌 قرار موثَّق: Copy Link uses 'referral', not 'social' — tapping "Copy Link" doesn't post
 * anything to a social network by itself; the link is only actually distributed through
 * whatever the visitor pastes it into next (SMS, email, a completely different app). That
 * "handed off through an arbitrary next channel" behavior is exactly what utm_medium=referral
 * conventionally means. If reporting ever needs Copy Link folded into "social" instead, this is
 * the one line to change — nothing else in the codebase repeats this mapping.
 */
export const SHARE_PLATFORM_UTM_MEDIUM: Record<SharePlatform, string> = {
  [SharePlatform.Facebook]: 'social',
  [SharePlatform.WhatsApp]: 'social',
  [SharePlatform.Telegram]: 'social',
  [SharePlatform.Native]: 'social',
  [SharePlatform.CopyLink]: 'referral',
  [SharePlatform.Other]: 'social'
};

/** Every share from the property-detail share sheet belongs to the same campaign today — one
 *  stable name is what makes "how did property sharing perform overall" answerable at all. A
 *  future, genuinely different campaign (e.g. a paid boost) would pass its own `campaign`
 *  override to UtmAttributionService rather than changing this default. */
export const UTM_CAMPAIGN_PROPERTY_SHARE = 'property_share';

/** Reverse lookup (utm_source string -> utm_medium) derived from the two maps above — used when
 *  only the already-lowercased source string is on hand (e.g. UtmAttributionService.
 *  getDefaultContext, which is given a `source: string`, not a `SharePlatform`, per the spec's
 *  prescribed interface). Kept derived rather than hand-duplicated so the two maps can never
 *  drift apart. */
export const UTM_MEDIUM_BY_SOURCE: Readonly<Record<string, string>> = Object.fromEntries(
  (Object.keys(SHARE_PLATFORM_UTM_SOURCE) as SharePlatform[]).map(platform => [
    SHARE_PLATFORM_UTM_SOURCE[platform],
    SHARE_PLATFORM_UTM_MEDIUM[platform]
  ])
);
