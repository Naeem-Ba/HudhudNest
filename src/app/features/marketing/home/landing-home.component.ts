import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { MarketingEventsApiService } from '../../../core/api/marketing-events-api.service';
import { OffersApiService } from '../../../core/api/offers-api.service';
import { numberLocaleFor } from '../../../core/i18n/supported-preferences';
import { Offer } from '../../../core/models/offer.model';
import { PageMetaService } from '../../../core/services/page-meta.service';
import { CtaTarget, MARKETING_CONFIG, heroCtas, platformUrl, startCards } from '../marketing.config';
import { WaitlistService } from '../waitlist/waitlist.service';

/** The 24x24 line icons of the "Hier starten" cards. */
const ICONS = {
  home: ['M3 11 12 4l9 7v9H3z', 'M9 20v-6h6v6'],
  key: ['M3 15a4 4 0 1 0 8 0a4 4 0 1 0-8 0', 'm11 12 9-9M16 7l3 3'],
  bed: ['M3 18V7M3 14h18v4M21 14v-3a3 3 0 0 0-3-3h-7v6'],
  plus: ['M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4z', 'M12 8v8M8 12h8']
} as const;

/**
 * Public home page (/landing): hero, three reasons, four ways to start. Nothing else.
 * Vision, provider pitch and contact live on their own pages. With no listings yet (listingsLive false) there is
 * no search and no link into an empty result list.
 */
@Component({
  selector: 'app-landing-home',
  standalone: true,
  imports: [NgTemplateOutlet, RouterLink, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './landing-home.component.html',
  styleUrl: './landing-home.component.scss'
})
export class LandingHomeComponent implements OnInit {
  private readonly config = inject(MARKETING_CONFIG);
  private readonly waitlist = inject(WaitlistService);
  private readonly offersApi = inject(OffersApiService);
  private readonly events = inject(MarketingEventsApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * The live marketing offer created in the admin area (GET /api/offers/active). null = nothing to show: while it
   * loads, when there is no active offer, and when the request fails. The card has no loading, empty or error
   * state on purpose (a Beta visitor should never see "no offers" or an error here).
   */
  readonly offer = signal<Offer | null>(null);

  readonly icons = ICONS;
  readonly hero = heroCtas(this.config.listingsLive);
  readonly cards = startCards(this.config.listingsLive);
  readonly whyKeys = ['ALL', 'CLEAR', 'DIRECT'] as const;

  constructor() {
    inject(PageMetaService).applyTranslated('LANDING.SEO', '/landing', inject(DestroyRef));
  }

  ngOnInit(): void {
    this.offersApi
      .getActiveOfferState()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(state => {
        const offer = state.status === 'ready' ? state.offer : null;
        this.offer.set(offer);
        // One page view per visit (funnel counter, no personal data); the offer id attributes it to the live offer.
        this.events.track('PageView', { offerId: offer?.id, campaign: this.campaign() });
      });
  }

  /** utm_campaign of a shared link: attribution only, no personal data. */
  private campaign(): string | null {
    return this.route.snapshot.queryParamMap.get('utm_campaign');
  }

  trackOfferCta(): void {
    this.events.track('CtaClick', { offerId: this.offer()?.id, campaign: this.campaign() });
  }

  offerDiscountText(offer: Offer): string {
    switch (offer.discountType) {
      case 'Percentage':
        return this.translate.instant('OFFER_COMMON.DISCOUNT_PERCENT', { value: offer.discountValue });
      case 'FixedAmountUsd':
        return this.translate.instant('OFFER_COMMON.DISCOUNT_FIXED_USD', { value: offer.discountValue });
      case 'FreeMonths':
        return this.translate.instant(
          offer.discountValue === 1 ? 'OFFER_COMMON.DISCOUNT_FREE_MONTH' : 'OFFER_COMMON.DISCOUNT_FREE_MONTHS',
          { value: offer.discountValue }
        );
      default:
        return '';
    }
  }

  offerEndsOn(offer: Offer): string | null {
    if (!offer.endsAtUtc) {
      return null;
    }
    const lang = this.translate.currentLang || this.translate.defaultLang || 'ar';
    let date: string;
    try {
      date = new Intl.DateTimeFormat(numberLocaleFor(lang), { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(offer.endsAtUtc));
    } catch {
      date = offer.endsAtUtc.slice(0, 10);
    }
    return this.translate.instant('SITE.OFFER.ENDS_ON', { date });
  }

  offerProgress(offer: Offer, key: 'PROGRESS_ARIA' | 'PROGRESS_LABEL'): string {
    return this.translate.instant(key === 'PROGRESS_ARIA' ? 'SITE.OFFER.PROGRESS_ARIA' : 'SITE.OFFER.PROGRESS_LABEL', {
      count: offer.redeemedCount,
      max: offer.maxRedemptions
    });
  }

  href(target: CtaTarget): string | null {
    return target.kind === 'platform' ? platformUrl(this.config, target.path) : null;
  }

  openWaitlist(target: CtaTarget): void {
    if (target.kind === 'waitlist') {
      this.waitlist.open(target.interest);
    }
  }
}
