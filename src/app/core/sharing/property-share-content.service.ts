// =============================================================
// src/app/core/sharing/property-share-content.service.ts
//
// Builds the text content (title/summary line/full message) shared to external platforms.
// Deliberately separate from PropertyShareUrlService (URL only) and from any single Provider —
// every provider gets the same ShareableContent from here, so a WhatsApp message and a
// Telegram message never drift apart.
//
// The message follows the sender's UI language (ar / en / de) through the app's own translation
// keys (SHARE.MSG.*). It used to be hard-coded Arabic, so someone sharing from the German or English
// UI sent an Arabic sentence. The listing's own title/description are still sent as written.
// =============================================================

import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Property } from '../models/property.model';
import { PropertyShareUrlService } from './property-share-url.service';
import { ShareableContent, SharePreview } from './share.model';
import { uiNumberLocale } from '../i18n/ui-language';

const MAX_SUMMARY_LENGTH = 160;

@Injectable({ providedIn: 'root' })
export class PropertyShareContentService {
  private readonly translate = inject(TranslateService);

  constructor(private readonly shareUrl: PropertyShareUrlService) {}

  /**
   * Returns null exactly when the property isn't shareable — see
   * PropertyShareUrlService.canShare.
   *
   * `urlOverride` (UTM / Attribution — Phase 2) lets a caller (SocialShareService) supply the
   * platform-attributed URL to embed instead of the plain canonical one — the message text and
   * `content.url` both use it, so a WhatsApp/Telegram message and the Native/Copy-Link URL never
   * disagree about which link was actually shared. Omitted, this falls back to the canonical
   * URL exactly as before Phase 2.
   */
  build(property: Property | null | undefined, urlOverride?: string): ShareableContent | null {
    const url = urlOverride ?? this.shareUrl.getPropertyPublicUrl(property);
    if (!url || !property) {
      return null;
    }

    const title = this.buildTitle(property);
    const summary = this.buildSummary(property);
    const viewOn = this.translate.instant('SHARE.MSG.VIEW_ON');
    const text = summary
      ? `${title}\n${summary}\n${viewOn}\n${url}`
      : `${title}\n${viewOn}\n${url}`;

    return { title, text, url };
  }

  /**
   * What the share sheet shows above the options: public facts only (title, one price line, location,
   * first photo). Never the owner's name, phone or e-mail.
   */
  buildPreview(property: Property): SharePreview {
    const image = property.images?.find(img => img.isMain && img.url)?.url
      ?? property.images?.find(img => !!img.url)?.url
      ?? property.mainImageUrl
      ?? property.imageUrls?.[0]
      ?? null;

    return {
      title: this.buildTitle(property),
      price: this.formatPrice(property),
      location: [property.city?.trim(), property.region?.trim()].filter(Boolean).join('، ') || null,
      imageUrl: image
    };
  }

  /** Short OG/Twitter description (independent of the WhatsApp/Telegram message above, but
   *  built the same way) — used by the page's <meta> tags. Never empty when the property has
   *  at least one fact to show; falls back to the title itself otherwise. */
  buildMetaDescription(property: Property): string {
    return this.buildSummary(property) || this.buildTitle(property);
  }

  private buildTitle(property: Property): string {
    const rawTitle = property.title?.trim();
    if (rawTitle) {
      return rawTitle;
    }

    // Fallback for the rare listing with a blank title: synthesize one from listing type + city
    // rather than sharing an empty string.
    const mode = this.listingModeLabel(property);
    const city = property.city?.trim();
    return city
      ? this.translate.instant('SHARE.MSG.FALLBACK_TITLE_CITY', { mode, city })
      : this.translate.instant('SHARE.MSG.FALLBACK_TITLE', { mode });
  }

  private buildSummary(property: Property): string {
    const parts: string[] = [];

    if (property.area) {
      const unit = property.areaUnit === 'SquareMeter' || !property.areaUnit
        ? this.translate.instant('COMMON.area_unit')
        : property.areaUnit;
      parts.push(`${this.formatNumber(property.area)} ${unit}`);
    }

    if (property.rooms) {
      parts.push(this.translate.instant('SHARE.MSG.ROOMS', { count: this.formatNumber(property.rooms) }));
    }

    const price = this.formatPrice(property);
    if (price) {
      parts.push(price);
    }

    if (property.city?.trim()) {
      parts.push(property.city.trim());
    }

    const summary = parts.join(' • ');
    return summary.length > MAX_SUMMARY_LENGTH
      ? `${summary.slice(0, MAX_SUMMARY_LENGTH - 1)}…`
      : summary;
  }

  private listingModeLabel(property: Property): string {
    switch (property.listingType) {
      case 'ForSale': return this.translate.instant('SHARE.MSG.MODE_SALE');
      case 'ForRentAndSale': return this.translate.instant('SHARE.MSG.MODE_BOTH');
      case 'ForRent':
      default: return this.translate.instant('SHARE.MSG.MODE_RENT');
    }
  }

  private formatPrice(property: Property): string | null {
    const value = property.purchasePrice ?? property.coldRent ?? property.warmRent;
    if (!value) {
      return null;
    }

    const currency = property.currencyCode ?? 'USD';
    try {
      return new Intl.NumberFormat(uiNumberLocale(), {
        style: 'currency',
        currency,
        maximumFractionDigits: 0
      }).format(value);
    } catch {
      return `${this.formatNumber(value)} ${currency}`;
    }
  }

  private formatNumber(value: number): string {
    try {
      return new Intl.NumberFormat(uiNumberLocale()).format(value);
    } catch {
      return String(value);
    }
  }
}
