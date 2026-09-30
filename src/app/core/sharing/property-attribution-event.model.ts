// =============================================================
// src/app/core/sharing/property-attribution-event.model.ts
//
// UTM / Attribution (Phase 2) — mirrors
// HudhudNestApi.Domain.Listings.Enums.PropertyAttributionEventType exactly (string values travel
// over the wire in the POST /properties/{id}/attribution-events body — see
// PropertyAttributionEventsApiService). Same manual-mirror convention Phase 1 already
// established for SharePlatform (see share.model.ts).
// =============================================================

/** Post-share funnel events for a public listing — what happened *after* a visitor opened a
 *  (possibly attributed) property link. Deliberately separate from SharePlatform/ShareResult:
 *  those describe the share action itself, this describes what followed it. */
export enum PropertyAttributionEventType {
  /** The property detail page was opened/rendered. Never fired merely because the Share button
   *  was tapped — see PropertyShareEvent/PropertyShareTrackingService for that. */
  View = 'View',

  /** A generic "contact the owner" affordance was used. */
  ContactClick = 'ContactClick',

  /** The owner's `tel:` phone link was tapped. */
  PhoneClick = 'PhoneClick',

  /** A WhatsApp deep link to the owner was tapped. */
  WhatsAppClick = 'WhatsAppClick',

  /** An in-app message to the owner was sent successfully. */
  MessageSent = 'MessageSent',

  /** A visit/viewing request was created successfully — the closest equivalent this product has
   *  to a "Lead" (see docs/social-sharing.md for why no separate Lead entity was introduced). */
  VisitRequestCreated = 'VisitRequestCreated'
}
