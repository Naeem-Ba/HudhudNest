// =============================================================
// src/app/core/sharing/offer-share.service.ts
//
// Builds what the admin can hand to a social platform for a marketing offer: the share text in
// ar/en/de and the public link. It does NOT publish anything — it only prepares content and
// reuses the same share-intent providers as property sharing (WhatsApp/Telegram/Facebook open a
// platform share dialog; Native opens the device sheet; CopyLink copies). "Opened a share
// dialog" is never reported as "published": see ShareResult in share.model.ts.
//
// Public link: there is no per-offer public page in this app (GET /offers/active serves exactly
// one live offer, rendered on /landing), so the link is /landing with UTM attribution. It shows
// whichever offer is live when the visitor arrives; an offer that is not publicly visible
// (draft, paused, ended, not yet started, cap reached) is refused here rather than shared.
// =============================================================

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';
import { firstValueFrom } from 'rxjs';
import { AdminOfferDto } from '../api/admin-marketing.service';
import { PropertyShareUrlService } from './property-share-url.service';
import { ShareableContent, ShareProvider, ShareResult, SharePlatform } from './share.model';
import { SHARE_PLATFORM_UTM_MEDIUM, SHARE_PLATFORM_UTM_SOURCE } from './utm-platform-mapping';
import { FacebookShareProvider } from './providers/facebook-share.provider';
import { WhatsAppShareProvider } from './providers/whatsapp-share.provider';
import { TelegramShareProvider } from './providers/telegram-share.provider';
import { NativeShareProvider } from './providers/native-share.provider';
import { numberLocaleFor } from '../i18n/supported-preferences';
import { CopyLinkProvider } from './providers/copy-link.provider';

export type OfferShareLanguage = 'ar' | 'en' | 'de' | 'tr';

export const OFFER_SHARE_LANGUAGES: readonly OfferShareLanguage[] = ['ar', 'en', 'de', 'tr'];

/** Path of the page that shows the live offer. */
export const OFFER_PUBLIC_PATH = '/landing';

/** utm_campaign for every offer share — one stable, report-friendly value. */
export const OFFER_UTM_CAMPAIGN = 'marketing_offer';

@Injectable({ providedIn: 'root' })
export class OfferShareService {
  // The share text is written in the language the admin picks, not the UI language, so the
  // dictionaries are read straight from the same /i18n/<lang>.json files the app translates with
  // (ngx-translate only exposes the active language).
  private readonly loader = new TranslateHttpLoader(inject(HttpClient), '/i18n/', '.json');
  private readonly dictionaries = new Map<OfferShareLanguage, Promise<Record<string, unknown>>>();
  private readonly siteUrl = inject(PropertyShareUrlService);

  private readonly providers: readonly ShareProvider[] = [
    inject(NativeShareProvider),
    inject(WhatsAppShareProvider),
    inject(TelegramShareProvider),
    inject(FacebookShareProvider),
    inject(CopyLinkProvider),
  ];

  /** Only an offer the server says visitors can see right now may be shared. */
  canShare(offer: Pick<AdminOfferDto, 'isPubliclyVisible'> | null | undefined): boolean {
    return !!offer?.isPubliclyVisible;
  }

  getAvailableProviders(): ShareProvider[] {
    return this.providers.filter(provider => provider.isAvailable());
  }

  /** The public landing URL, optionally attributed to a share platform. */
  buildPublicUrl(platform?: SharePlatform): string {
    const base = `${this.siteUrl.getSiteOrigin()}${OFFER_PUBLIC_PATH}`;
    if (!platform) {
      return base;
    }

    const query = new URLSearchParams({
      utm_source: SHARE_PLATFORM_UTM_SOURCE[platform],
      utm_medium: SHARE_PLATFORM_UTM_MEDIUM[platform],
      utm_campaign: OFFER_UTM_CAMPAIGN,
    });
    return `${base}?${query.toString()}`;
  }

  /** Share text for one language. Throws when the offer is not publicly visible. */
  async buildContent(
    offer: AdminOfferDto,
    language: OfferShareLanguage,
    platform?: SharePlatform,
  ): Promise<ShareableContent> {
    if (!this.canShare(offer)) {
      throw new Error('OFFER_NOT_SHAREABLE');
    }

    const dictionary = await this.dictionary(language);
    const t = (key: string, params?: Record<string, unknown>): string => lookup(dictionary, key, params);

    const url = this.buildPublicUrl(platform);
    const lines: string[] = [offer.name.trim(), this.discountText(offer, t)];

    if (offer.description?.trim()) {
      lines.push(offer.description.trim());
    }

    if (offer.endsAtUtc) {
      lines.push(t('OFFER_SHARE.DEADLINE', { date: this.formatDate(offer.endsAtUtc, language) }));
    }

    if (offer.maxRedemptions != null) {
      const left = Math.max(0, offer.maxRedemptions - offer.redeemedCount);
      lines.push(t('OFFER_SHARE.SLOTS_LEFT', { count: left }));
    }

    lines.push(`${t('OFFER_SHARE.CTA')} ${url}`);

    return { title: offer.name.trim(), text: lines.join('\n'), url };
  }

  /** Runs one provider. The result reflects only what happened (dialog opened / copied). */
  async shareVia(
    provider: ShareProvider,
    offer: AdminOfferDto,
    language: OfferShareLanguage,
  ): Promise<ShareResult> {
    const content = await this.buildContent(offer, language, provider.platform);
    return provider.share(content);
  }

  private dictionary(language: OfferShareLanguage): Promise<Record<string, unknown>> {
    let pending = this.dictionaries.get(language);
    if (!pending) {
      pending = firstValueFrom(this.loader.getTranslation(language)) as Promise<Record<string, unknown>>;
      // A failed download must not stay cached, or sharing would be dead until a reload.
      pending.catch(() => this.dictionaries.delete(language));
      this.dictionaries.set(language, pending);
    }
    return pending;
  }

  private discountText(offer: AdminOfferDto, t: (key: string, params?: Record<string, unknown>) => string): string {
    switch (offer.discountType) {
      case 'Percentage':
        return t('OFFER_COMMON.DISCOUNT_PERCENT', { value: offer.discountValue });
      case 'FixedAmountUsd':
        return t('OFFER_COMMON.DISCOUNT_FIXED_USD', { value: offer.discountValue });
      case 'FreeMonths':
        return t(
          offer.discountValue === 1 ? 'OFFER_COMMON.DISCOUNT_FREE_MONTH' : 'OFFER_COMMON.DISCOUNT_FREE_MONTHS',
          { value: offer.discountValue },
        );
      default:
        return '';
    }
  }

  private formatDate(iso: string, language: OfferShareLanguage): string {
    try {
      return new Intl.DateTimeFormat(numberLocaleFor(language), { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(iso));
    } catch {
      return iso.slice(0, 10);
    }
  }
}

/** Dotted-path lookup plus {{param}} substitution; a missing key throws rather than leaking a raw key into a post. */
export function lookup(dictionary: Record<string, unknown>, key: string, params?: Record<string, unknown>): string {
  const value = key.split('.').reduce<unknown>(
    (node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined),
    dictionary,
  );

  if (typeof value !== 'string') {
    throw new Error(`Missing translation key: ${key}`);
  }

  return value.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name: string) => String(params?.[name] ?? ''));
}
