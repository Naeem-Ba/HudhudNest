// =============================================================
// src/app/core/sharing/property-share-content.service.ts
//
// Builds the text content (title/summary line/full message) shared to external platforms.
// Deliberately separate from PropertyShareUrlService (URL only) and from any single Provider —
// every provider gets the same ShareableContent from here, so a WhatsApp message and a
// Telegram message never drift apart.
//
// Content stays Arabic-first, matching how the rest of property-detail.page.html already
// renders property facts today (e.g. "🏡 شرفة" / "🛗 مصعد" are hardcoded Arabic, not run
// through TranslateModule) — this is what actually gets sent to WhatsApp/Telegram, i.e. it
// travels with the listing, not with the visitor's UI language. The share SHEET around it
// (buttons, aria-labels, toasts) is fully translated separately — see
// PropertyShareButtonComponent.
// =============================================================

import { Injectable } from '@angular/core';
import { Property } from '../models/property.model';
import { PropertyShareUrlService } from './property-share-url.service';
import { ShareableContent } from './share.model';

const MAX_SUMMARY_LENGTH = 160;

@Injectable({ providedIn: 'root' })
export class PropertyShareContentService {
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
    const text = summary
      ? `${title}\n${summary}\nشاهد الإعلان على عقار تيك:\n${url}`
      : `${title}\nشاهد الإعلان على عقار تيك:\n${url}`;

    return { title, text, url };
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
    return city ? `عقار ${mode} في ${city}` : `عقار ${mode}`;
  }

  private buildSummary(property: Property): string {
    const parts: string[] = [];

    if (property.area) {
      const unit = property.areaUnit === 'SquareMeter' || !property.areaUnit ? 'م²' : property.areaUnit;
      parts.push(`${this.formatNumber(property.area)} ${unit}`);
    }

    if (property.rooms) {
      parts.push(`${this.formatNumber(property.rooms)} غرف`);
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
      case 'ForSale': return 'للبيع';
      case 'ForRentAndSale': return 'للبيع أو الإيجار';
      case 'ForRent':
      default: return 'للإيجار';
    }
  }

  private formatPrice(property: Property): string | null {
    const value = property.purchasePrice ?? property.coldRent ?? property.warmRent;
    if (!value) {
      return null;
    }

    const currency = property.currencyCode ?? 'USD';
    try {
      return new Intl.NumberFormat('ar', {
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
      return new Intl.NumberFormat('ar').format(value);
    } catch {
      return String(value);
    }
  }
}
