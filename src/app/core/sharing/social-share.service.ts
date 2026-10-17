// =============================================================
// src/app/core/sharing/social-share.service.ts
//
// The single entry point PropertyShareButtonComponent (and anything else that ever needs to
// share a property) talks to. Owns:
//   - which providers exist and are available right now (getAvailableProviders)
//   - building the shared content once per call (via PropertyShareContentService)
//   - dispatching to a provider and recording a successful share (via PropertyShareTrackingService)
//
// Nothing in this class or its providers knows about Angular templates, dialogs, or toasts —
// that is entirely PropertyShareButtonComponent's job. Adding a new platform means adding one
// ShareProvider implementation and listing it in the `providers` array below; nothing else in
// this file, and nothing in the UI, needs to change. See docs/social-sharing.md.
// =============================================================

import { Injectable, inject } from '@angular/core';
import { Property } from '../models/property.model';
import { PropertyShareContentService } from './property-share-content.service';
import { PropertyShareTrackingService } from './property-share-tracking.service';
import { PropertyShareUrlService } from './property-share-url.service';
import { UtmAttributionService } from './utm-attribution.service';
import { SHARE_PLATFORM_UTM_SOURCE } from './utm-platform-mapping';
import { ShareProvider, SharePreview, ShareResult, SharePlatform } from './share.model';
import { FacebookShareProvider } from './providers/facebook-share.provider';
import { WhatsAppShareProvider } from './providers/whatsapp-share.provider';
import { TelegramShareProvider } from './providers/telegram-share.provider';
import { NativeShareProvider } from './providers/native-share.provider';
import { EmailShareProvider } from './providers/email-share.provider';
import { CopyLinkProvider } from './providers/copy-link.provider';

@Injectable({ providedIn: 'root' })
export class SocialShareService {
  private readonly contentBuilder = inject(PropertyShareContentService);
  private readonly tracking = inject(PropertyShareTrackingService);
  private readonly shareUrl = inject(PropertyShareUrlService);
  private readonly utmAttribution = inject(UtmAttributionService);

  private readonly facebook = inject(FacebookShareProvider);
  private readonly whatsapp = inject(WhatsAppShareProvider);
  private readonly telegram = inject(TelegramShareProvider);
  private readonly native = inject(NativeShareProvider);
  private readonly email = inject(EmailShareProvider);
  private readonly copyLink = inject(CopyLinkProvider);

  /**
   * Ordered for display: the named apps first, then e-mail, the device's own sheet ("more apps") and
   * copy link last. The Instagram entry point is gone: it only ever delegated to the native sheet, so
   * it was a second button opening the same dialog (InstagramShareProvider stays for its own spec).
   */
  private readonly providers: readonly ShareProvider[] = [
    this.whatsapp,
    this.telegram,
    this.facebook,
    this.email,
    this.native,
    this.copyLink
  ];

  /**
   * The providers to actually render as buttons for this property, right now, in this
   * environment — already filtered by both "is this property shareable at all" and each
   * provider's own isAvailable(). An empty array means the share button itself must be
   * hidden/disabled (see PropertyShareButtonComponent).
   */
  getAvailableProviders(property: Property | null | undefined): ShareProvider[] {
    if (!this.shareUrl.canShare(property)) {
      return [];
    }

    return this.providers.filter(provider => provider.isAvailable());
  }

  /** The link shown in the share sheet's link field and copied by "Copy link": the same
   *  platform-attributed public URL the CopyLinkProvider copies, never an internal route. */
  getCopyLinkUrl(property: Property | null | undefined): string | null {
    if (!this.shareUrl.canShare(property)) {
      return null;
    }
    return this.utmAttribution.buildAttributedPropertyUrl({
      property: property as Property,
      source: SHARE_PLATFORM_UTM_SOURCE[SharePlatform.CopyLink]
    }) ?? this.shareUrl.getPropertyPublicUrl(property);
  }

  /** Title / price / location / first photo for the share sheet; null when not shareable. */
  getPreview(property: Property | null | undefined): SharePreview | null {
    return this.shareUrl.canShare(property) ? this.contentBuilder.buildPreview(property) : null;
  }

  /** True when the property has at least one usable share channel right now. */
  canShare(property: Property | null | undefined): boolean {
    return this.getAvailableProviders(property).length > 0;
  }

  /**
   * Dispatches to a specific provider (as returned by getAvailableProviders) and records a
   * successful share. This is what the share-sheet UI actually calls for every button.
   *
   * UTM / Attribution (Phase 2): the URL embedded in `content` (and therefore the URL every
   * provider actually opens/copies) is the platform-attributed URL from UtmAttributionService,
   * NOT the plain canonical URL — see docs/social-sharing.md §"UTM Attribution". The canonical
   * URL itself is untouched anywhere else (PropertyMetaService's og:url/canonical <link> never
   * call UtmAttributionService at all).
   */
  async shareVia(property: Property, provider: ShareProvider): Promise<ShareResult> {
    const utmSource = SHARE_PLATFORM_UTM_SOURCE[provider.platform];
    const attributedUrl = this.utmAttribution.buildAttributedPropertyUrl({ property, source: utmSource });
    const content = this.contentBuilder.build(property, attributedUrl ?? undefined);
    if (!content) {
      return {
        success: false,
        platform: provider.platform,
        errorCode: 'NOT_SHAREABLE',
        message: 'SHARE.ERROR_NOT_SHAREABLE'
      };
    }

    const result = await provider.share(content);

    if (result.success) {
      const attributionContext = this.utmAttribution.getDefaultContext(property, utmSource);
      this.tracking.recordSuccess(property.id, result.platform, attributionContext);
    }

    return result;
  }

  /** Default action for a plain "Share" tap — the device-native share sheet. */
  share(property: Property): Promise<ShareResult> {
    return this.shareVia(property, this.native);
  }

  shareToFacebook(property: Property): Promise<ShareResult> {
    return this.shareVia(property, this.facebook);
  }

  shareToWhatsApp(property: Property): Promise<ShareResult> {
    return this.shareVia(property, this.whatsapp);
  }

  shareToTelegram(property: Property): Promise<ShareResult> {
    return this.shareVia(property, this.telegram);
  }

  copyPropertyLink(property: Property): Promise<ShareResult> {
    return this.shareVia(property, this.copyLink);
  }

  /** Re-exported for convenience so callers building their own preview/meta UI don't need to
   *  inject PropertyShareUrlService directly. */
  getPropertyPublicUrl(property: Property | null | undefined): string | null {
    return this.shareUrl.getPropertyPublicUrl(property);
  }
}

export { SharePlatform };
