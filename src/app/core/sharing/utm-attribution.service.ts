// =============================================================
// src/app/core/sharing/utm-attribution.service.ts
//
// UTM / Attribution (Phase 2 of Social Sharing & Distribution). The single place that turns a
// property + a platform source into an "attributed" share URL, and the single place that reads
// utm_* parameters back out of a URL. Deliberately separate from SocialShareService (which
// orchestrates *sharing*, not attribution) and from PropertyShareUrlService (canonical URL
// only — this service wraps it, never duplicates it). No UI code, no Tracking/HTTP calls here —
// see section 5 of the feature spec ("لا تخلط بين بناء الرابط وتسجيل الحدث").
// =============================================================

import { Injectable, inject } from '@angular/core';
import { Property } from '../models/property.model';
import { PropertyShareUrlService } from './property-share-url.service';
import { AttributionContext, AttributionUrlOptions } from './utm-attribution.model';
import { UTM_CAMPAIGN_PROPERTY_SHARE, UTM_MEDIUM_BY_SOURCE } from './utm-platform-mapping';

/** Letters, digits, underscore, hyphen, dot only, 1-60 chars — matches
 *  HudhudNestApi.Domain.Listings.Entities.PropertyShareEvent's server-side sanitizer exactly, so
 *  a value that passes here is guaranteed to survive backend storage untouched (section 4: "لا
 *  تحتوي على مسافات أو أحرف غير مناسبة"). */
const VALID_UTM_VALUE = /^[a-zA-Z0-9_.-]{1,60}$/;

const UTM_PARAM_NAMES = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'] as const;

/** GA-style convention filler for "utm_source was present but this other field wasn't" — never
 *  used for utm_source itself (a missing/invalid utm_source means "not attributed at all", see
 *  parseAttributionFromUrl). Passes VALID_UTM_VALUE, so it round-trips through the backend and
 *  through a later buildAttributedPropertyUrl call unchanged. */
const UNSPECIFIED_UTM_VALUE = 'none';

@Injectable({ providedIn: 'root' })
export class UtmAttributionService {
  private readonly shareUrl = inject(PropertyShareUrlService);

  /**
   * Builds the property's canonical URL with utm_source/utm_medium/utm_campaign/utm_content
   * appended — this is the URL every ShareProvider actually opens or copies (see
   * SocialShareService.shareVia). NEVER use this for `og:url`/`<link rel="canonical">` — those
   * stay on PropertyShareUrlService.getPropertyPublicUrl directly (see PropertyMetaService,
   * which never imports this service).
   *
   * Returns null exactly when the underlying canonical URL is null (property not public/
   * shareable, or its origin somehow doesn't match this app's own site origin) — same
   * "null means hide/disable, never guess" contract PropertyShareUrlService already uses.
   */
  buildAttributedPropertyUrl(options: AttributionUrlOptions): string | null {
    const canonicalUrl = this.shareUrl.getPropertyPublicUrl(options.property);
    if (!canonicalUrl) {
      return null;
    }

    let url: URL;
    try {
      url = new URL(canonicalUrl);
    } catch {
      return null;
    }

    // Defense in depth: canonicalUrl only ever comes from PropertyShareUrlService, which is
    // already restricted to environment.siteUrl/window.location.origin — this guards against
    // ever attaching UTM parameters to (or copy-linking) an origin other than our own, and
    // against a non-http(s) scheme (e.g. a hypothetical javascript: value) ever reaching here.
    if (url.origin !== this.shareUrl.getSiteOrigin() || !this.isHttpProtocol(url)) {
      return null;
    }

    const defaults = this.getDefaultContext(options.property, options.source);
    const context: AttributionContext = {
      source: defaults.source,
      medium: this.sanitizeUtmValue(options.medium) ?? defaults.medium,
      campaign: this.sanitizeUtmValue(options.campaign) ?? defaults.campaign,
      content: this.sanitizeUtmValue(options.content) ?? defaults.content
    };

    // URLSearchParams.set() replaces any existing value for that key rather than appending a
    // second one — this is what prevents duplicate utm_* parameters on repeated calls, and it
    // leaves every other, unrelated query parameter on the canonical URL untouched (section 8:
    // "التعامل مع وجود Query Parameters سابقة" / "منع تكرار نفس UTM Parameter").
    UTM_PARAM_NAMES.forEach(name => url.searchParams.delete(name));
    url.searchParams.set('utm_source', context.source);
    url.searchParams.set('utm_medium', context.medium);
    url.searchParams.set('utm_campaign', context.campaign);
    url.searchParams.set('utm_content', context.content);

    return url.toString();
  }

  /**
   * The default UTM context for a property shared from the given source — utm_medium comes
   * from the central per-platform mapping (utm-platform-mapping.ts), utm_campaign is the
   * shared 'property_share' campaign, and utm_content identifies the property.
   *
   * 📌 قرار موثَّق: utm_content reuses the property's existing public Id (the same "no slug/
   * publicId field" decision already documented on PropertyShareUrlService.getPropertyPublicUrl
   * for Phase 1) prefixed as `property_{id}` — stable, analytics-safe, and never regenerated
   * randomly for the same property. An invalid/unrecognized `source` falls back to 'other'
   * rather than throwing — this mirrors the backend's "never reject the whole event over one
   * bad field" posture (see PropertyShareEvent.SanitizeUtmField).
   */
  getDefaultContext(property: Property, source: string): AttributionContext {
    const normalizedSource = this.sanitizeUtmValue(source) ?? 'other';
    const medium = UTM_MEDIUM_BY_SOURCE[normalizedSource] ?? 'social';

    return {
      source: normalizedSource,
      medium,
      campaign: UTM_CAMPAIGN_PROPERTY_SHARE,
      content: this.contentForProperty(property)
    };
  }

  /**
   * Extracts {source, medium, campaign, content} from a URL's utm_* query parameters — the
   * given `url`, or the current page's URL when omitted. Returns null when there is no *valid*
   * utm_source: a direct/organic visit is not an error, it simply isn't attributed to anything
   * (see AttributionContextService, which relies on this null to mean "leave existing
   * attribution alone" rather than fabricating a fake one). Any other missing/invalid field
   * falls back to the literal 'none' — the standard convention for "attributed, but this
   * particular dimension wasn't specified" (never silently equated with a real value).
   */
  parseAttributionFromUrl(url?: string): AttributionContext | null {
    const raw = url ?? (typeof window !== 'undefined' ? window.location.href : '');
    if (!raw) {
      return null;
    }

    let parsed: URL;
    try {
      parsed = new URL(raw, this.shareUrl.getSiteOrigin() || undefined);
    } catch {
      return null;
    }

    if (!this.isHttpProtocol(parsed)) {
      return null;
    }

    const source = this.sanitizeUtmValue(parsed.searchParams.get('utm_source'));
    if (!source) {
      return null;
    }

    return {
      source,
      medium: this.sanitizeUtmValue(parsed.searchParams.get('utm_medium')) ?? UNSPECIFIED_UTM_VALUE,
      campaign: this.sanitizeUtmValue(parsed.searchParams.get('utm_campaign')) ?? UNSPECIFIED_UTM_VALUE,
      content: this.sanitizeUtmValue(parsed.searchParams.get('utm_content')) ?? UNSPECIFIED_UTM_VALUE
    };
  }

  /**
   * Trims, lowercases (so "Facebook"/"FACEBOOK"/"facebook" all normalize to the one report
   * dimension — section 18: "لا تستخدم صيغًا متعددة لنفس المصدر"), then validates against the
   * allowed charset/length. Returns null — never a truncated/partial value — for anything that
   * fails, exactly mirroring the backend's PropertyShareEvent.SanitizeUtmField.
   */
  private sanitizeUtmValue(raw: string | null | undefined): string | null {
    const trimmed = raw?.trim().toLowerCase();
    if (!trimmed) {
      return null;
    }

    return VALID_UTM_VALUE.test(trimmed) ? trimmed : null;
  }

  private contentForProperty(property: Property): string {
    return this.sanitizeUtmValue(`property_${property.id}`) ?? 'property_unknown';
  }

  private isHttpProtocol(url: URL): boolean {
    return url.protocol === 'http:' || url.protocol === 'https:';
  }
}
