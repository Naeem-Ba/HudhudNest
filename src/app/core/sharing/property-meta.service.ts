// =============================================================
// src/app/core/sharing/property-meta.service.ts
//
// Builds the <title>/Open Graph/Twitter Card/canonical <link> tags for a property page — see
// section 6 of the feature spec. Deliberately separate from MetaService (generic tag plumbing,
// reused by every page) and from PropertyShareContentService (the WhatsApp/Telegram message
// text) so each has one job; this is the one place that turns "a Property" into "page
// metadata".
//
// IMPORTANT — this alone is NOT the fix for social crawlers: Angular here is a pure
// client-side SPA (no SSR/prerender in this project — confirmed: no @angular/ssr dependency,
// no server bundle). Tags applied via this service only exist after the JS bundle has already
// executed, so a crawler that does not run JavaScript (most of them do not, or do so
// unreliably/with a timeout — Facebook's and WhatsApp's crawlers in particular do not execute
// client JS at all) will see NONE of this. This service is what makes the tags correct for a
// browser tab and for any crawler that DOES run JS; docs/social-sharing.md documents the
// separate, required server-side piece (a Netlify Edge Function that serves known crawler user
// agents pre-rendered HTML with these same tags) that closes that gap for the crawlers that
// matter most.
// =============================================================

import { Injectable, inject } from '@angular/core';
import { Property } from '../models/property.model';
import { MetaService } from '../services/meta.service';
import { PropertyShareContentService } from './property-share-content.service';
import { PropertyShareUrlService } from './property-share-url.service';

const FALLBACK_OG_IMAGE_PATH = '/images/horizontal-logo.png';

@Injectable({ providedIn: 'root' })
export class PropertyMetaService {
  private readonly meta = inject(MetaService);
  private readonly shareUrl = inject(PropertyShareUrlService);
  private readonly content = inject(PropertyShareContentService);

  /**
   * Applies full page metadata for a public property. No-ops (and callers should fall back to
   * whatever default/landing metadata already applies) when the property isn't actually public
   * — this must never be called for, or leak metadata about, an unpublished/expired/deleted
   * listing. In practice this is defense in depth: property-detail.page.ts only ever has a
   * Property once the backend's public-only GET has already returned it.
   */
  applyTo(property: Property): void {
    const canonicalUrl = this.shareUrl.getPropertyPublicUrl(property);
    if (!canonicalUrl) {
      return;
    }

    this.meta.setMeta({
      title: this.buildTitle(property),
      description: this.sanitize(this.content.buildMetaDescription(property)),
      ogImage: this.resolveImage(property),
      canonical: canonicalUrl,
      ogType: 'website'
    });
  }

  private buildTitle(property: Property): string {
    const title = property.title?.trim();
    if (title) {
      return this.sanitize(title);
    }

    const city = property.city?.trim();
    return city ? `عقار في ${city}` : 'تفاصيل العقار';
  }

  private resolveImage(property: Property): string {
    const candidate = property.mainImageUrl?.trim() || property.images?.find(img => img.url)?.url;

    if (candidate && /^https?:\/\//i.test(candidate)) {
      return candidate;
    }

    // No image (or a relative path we can't safely resolve against the backend origin here) —
    // fall back to the app's own branded placeholder, never an empty/missing og:image.
    return `${this.shareUrl.getSiteOrigin()}${FALLBACK_OG_IMAGE_PATH}`;
  }

  /**
   * Strips any HTML markup from user-entered text before it ever reaches a <meta> tag —
   * property.title/description are free text the owner typed, and Angular's Meta.updateTag
   * writes the raw string as an attribute value; this is the guard against that free text ever
   * containing marker characters that would break out of the attribute or inject markup.
   */
  private sanitize(value: string): string {
    return value.replace(/<[^>]*>/g, '').trim();
  }
}
