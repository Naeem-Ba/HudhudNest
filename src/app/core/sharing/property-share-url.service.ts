// =============================================================
// src/app/core/sharing/property-share-url.service.ts
//
// Single source of truth for "what is the public, shareable URL of this property, and is it
// even shareable at all". Every share provider, the Web Share API call, Copy Link, the OG/
// Twitter/canonical <meta> tags, and share-event tracking all go through THIS service instead
// of building or repeating the URL themselves (see SocialShareService).
// =============================================================

import { Injectable } from '@angular/core';
import { Property } from '../models/property.model';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class PropertyShareUrlService {

  /**
   * True only for a listing that may legally be shared/publicly linked right now:
   *  - has an id (nothing to link to otherwise)
   *  - not explicitly unpublished (`isPublished === false`) — `undefined` is treated as
   *    published because every read path that can reach the share button (property-detail's
   *    public GET, published list/search results) already only ever returns published listings
   *    in the first place; this is a defensive second check, not the only one.
   *  - not expired (`expiresAt` in the past)
   *
   * A property that failed to load, was deleted, or 404'd on the backend never reaches this
   * method with a value at all — property-detail.page.ts only ever has a Property once the
   * public GET has already succeeded, and that endpoint itself 404s for anything unpublished,
   * expired, or deleted (GetPublishedByIdWithDetailsAsync on the backend).
   */
  canShare(property: Property | null | undefined): property is Property {
    if (!property?.id) {
      return false;
    }

    if (property.isPublished === false) {
      return false;
    }

    if (property.expiresAt) {
      const expiresAt = new Date(property.expiresAt).getTime();
      if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
        return false;
      }
    }

    return true;
  }

  /**
   * Builds the canonical public URL for a property, e.g.
   * "https://hudhudnest.com/properties/{id}".
   *
   * Returns null when the property isn't shareable (see canShare) instead of ever returning a
   * partial/best-effort link — callers (SocialShareService, MetaService, the share button) must
   * treat null as "hide/disable sharing for this property", not fall back to guessing a URL.
   *
   * 📌 قرار معماري موثَّق: لا يملك هذا المشروع حاليًا حقل slug أو publicId منفصل على العقار —
   * فقط Id (GUID) الداخلي، وهو نفسه المستخدَم أصلاً في مسار /properties/:id للتنقّل العادي
   * (راجع app.routes.ts). إضافة نظام slugs كامل (توليد، فرادة، ترحيل البيانات القديمة) خارج
   * نطاق ميزة المشاركة نفسها. بما أن Id هذا عام أصلاً (يظهر في كل رابط تفاصيل عقار وكل طلب API
   * عام) وليس معرّفًا داخليًا حساسًا، استخدامه هنا آمن ولا يكسر أي شيء قائم. هذه الدالة هي
   * المكان الوحيد في كامل التطبيق الذي يبني هذا الرابط — إن أُضيف slug مستقبلاً، هذا هو الموضع
   * الوحيد الذي يحتاج تعديلاً.
   */
  getPropertyPublicUrl(property: Property | null | undefined): string | null {
    if (!this.canShare(property)) {
      return null;
    }

    return `${this.getSiteOrigin()}/properties/${encodeURIComponent(property.id)}`;
  }

  /**
   * The public URL of an office page, "https://hudhudnest.com/offices/{slug}" (share-links audit M-05). Office
   * slugs may contain Arabic letters, so the slug is always percent-encoded here and nowhere else. Null for an
   * empty slug, so a caller never shares the directory by accident.
   */
  getOfficePublicUrl(slug: string | null | undefined): string | null {
    const value = slug?.trim();
    return value ? `${this.getSiteOrigin()}/offices/${encodeURIComponent(value)}` : null;
  }

  /** The address printed in an office's QR code, "https://hudhudnest.com/o/{code}"; null without a code. */
  getOfficeQrUrl(code: string | null | undefined): string | null {
    const value = code?.trim();
    return value ? `${this.getSiteOrigin()}/o/${encodeURIComponent(value)}` : null;
  }

  /**
   * The public origin to build share links against. Prefers the configured environment.siteUrl
   * (real domain in staging/production — see environment.model.ts's siteUrl doc comment); falls
   * back to window.location.origin only when that isn't configured (local dev, where there is no
   * public domain to point a shared link at). Never a hardcoded "localhost" default.
   */
  /** The app's own public origin — exposed (not just used internally) so
   *  PropertyMetaService can build an absolute fallback og:image URL from it. */
  getSiteOrigin(): string {
    const configured = environment.siteUrl?.trim().replace(/\/+$/, '');
    if (configured) {
      return configured;
    }

    return typeof window !== 'undefined'
      ? window.location.origin
      : '';
  }
}
