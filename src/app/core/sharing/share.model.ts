// =============================================================
// src/app/core/sharing/share.model.ts
//
// Social Sharing & Distribution — shared types for the sharing layer.
// Mirrors PropertyApi.Domain.Listings.Enums.SharePlatform exactly (string values match the
// backend's [HttpPost("{id}/share-events")] JSON contract — see
// PropertyShareEventsApiService). Keeping the two in sync is a deliberate manual mirror, the
// same convention this codebase already uses for every other DTO shared across the two repos
// (see e.g. ListingExtensionQuote in property-api.service.ts).
// =============================================================

/** One distribution channel a visitor can use to share a property listing. */
export enum SharePlatform {
  Facebook = 'Facebook',
  WhatsApp = 'WhatsApp',
  Telegram = 'Telegram',
  /** Device-native share sheet (Web Share API today; a Capacitor Share plugin could replace it later). */
  Native = 'Native',
  CopyLink = 'CopyLink',
  Other = 'Other'
}

/** The minimal, non-sensitive content a ShareProvider needs to build a share action. */
export interface ShareableContent {
  /** Property title, e.g. "شقة للبيع في طرطوس". */
  readonly title: string;
  /** Short human-readable summary line (area • rooms • price • "شاهد الإعلان على..."). */
  readonly text: string;
  /** Canonical public URL — see PropertyShareUrlService.getPropertyPublicUrl(). Never internal. */
  readonly url: string;
}

/** Outcome of a single share attempt. Always reflects what actually happened — never claims a
 *  share/publish succeeded when the only thing that happened is a share-intent link was opened. */
export interface ShareResult {
  readonly success: boolean;
  readonly platform: SharePlatform;
  /** True when the user deliberately dismissed a native share sheet — never surfaced as an error. */
  readonly cancelled?: boolean;
  readonly errorCode?: string;
  /** i18n key (e.g. 'SHARE.ERROR_POPUP_BLOCKED') for a non-technical, user-facing toast message.
   *  Providers never translate it themselves (they have no template/pipe context) — the
   *  component displaying the result runs it through TranslateService. */
  readonly message?: string;
}

/**
 * One sharing channel. Adding a new platform means adding one class implementing this
 * interface and registering it with SocialShareService — nothing else (not the UI, not
 * PropertyDetailPage) needs to change. See docs/social-sharing.md for the walkthrough.
 */
export interface ShareProvider {
  readonly platform: SharePlatform;
  /** i18n key for the share-sheet button label, e.g. 'SHARE.WHATSAPP' — resolved via
   *  TranslateModule in the template, never a hardcoded string (the UI must work in ar/en/de). */
  readonly labelKey: string;
  /** Whether this provider can run in the current environment/browser right now. */
  isAvailable(): boolean;
  share(content: ShareableContent): Promise<ShareResult>;
}
