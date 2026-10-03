// ─────────────────────────────────────────────────────────
// page-meta.service.ts
// Title / description / canonical for the public pages that are not a property detail page
// (those have PropertyMetaService) -- short-stay, investments, contact, valuation, ...
//
// SEO audit (2026-10-03): these pages set no metadata at all, so every one of them was indexed
// (or would have been) as "HudhudNest" with no description and no canonical. The wording lives in
// the i18n files under SEO.<PAGE>.{TITLE,DESCRIPTION} so it follows the UI language, the same way
// PricingPage's META_TITLE/META_DESCRIPTION already do.
// ─────────────────────────────────────────────────────────
import { DestroyRef, Injectable, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateService } from '@ngx-translate/core';

import { MetaService } from './meta.service';
import { PropertyShareUrlService } from '../sharing/property-share-url.service';

const OG_IMAGE_PATH = '/images/og-default.png';
const MAX_DESCRIPTION_LENGTH = 160;

function sanitize(value: string | null | undefined): string {
  return (value ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

@Injectable({ providedIn: 'root' })
export class PageMetaService {
  private readonly meta = inject(MetaService);
  private readonly translate = inject(TranslateService);
  private readonly shareUrl = inject(PropertyShareUrlService);

  /**
   * Static page whose wording is in the i18n files: `keyPrefix` is e.g. 'SEO.CONTACT' (needs
   * `.TITLE` and `.DESCRIPTION`), `path` the page's own clean path ('/kontakt'). Re-applies when the
   * UI language changes and removes the canonical again when the page is destroyed (see
   * MetaService.clearCanonical for why a leftover canonical is worse than none).
   */
  applyTranslated(keyPrefix: string, path: string, destroyRef: DestroyRef): void {
    const titleKey = `${keyPrefix}.TITLE`;
    const descriptionKey = `${keyPrefix}.DESCRIPTION`;

    this.translate
      .stream([titleKey, descriptionKey])
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe(values =>
        this.apply({
          title: values[titleKey],
          description: values[descriptionKey],
          path
        })
      );

    destroyRef.onDestroy(() => this.clear());
  }

  /**
   * Page whose wording comes from loaded data (a short-stay listing, an investment project).
   * The caller registers `clear()` on destroy -- this method may run more than once per page
   * (retry after a failed load), so it must not register the hook itself.
   */
  applyDynamic(opts: { title: string; description?: string | null; path: string; image?: string | null }): void {
    this.apply({
      title: opts.title,
      description: opts.description ?? '',
      path: opts.path,
      image: opts.image ?? undefined
    });
    this.meta.setPageRobots(null);
  }

  /** For a detail page whose entity doesn't exist / isn't public: keep it out of the index. */
  markNotFound(): void {
    this.meta.setPageRobots('noindex, nofollow');
  }

  /** Keep the page out of the index for as long as it is on screen. */
  noindex(destroyRef: DestroyRef): void {
    this.meta.setPageRobots('noindex, nofollow');
    destroyRef.onDestroy(() => this.meta.setPageRobots(null));
  }

  /** Call when the page goes away: no canonical and no noindex left over for whatever comes next. */
  clear(): void {
    this.meta.clearCanonical();
    this.meta.setPageRobots(null);
  }

  private apply(opts: { title: string; description: string; path: string; image?: string }): void {
    const title = sanitize(opts.title);
    if (!title) {
      // Nothing usable to show (e.g. an unloaded translation): leave the existing tags alone.
      return;
    }

    const origin = this.shareUrl.getSiteOrigin();
    const description = truncate(sanitize(opts.description), MAX_DESCRIPTION_LENGTH);

    this.meta.setMeta({
      title,
      description,
      ogImage: opts.image && /^https?:\/\//i.test(opts.image) ? opts.image : `${origin}${OG_IMAGE_PATH}`,
      canonical: `${origin}${opts.path}`,
      siteName: this.translate.currentLang && this.translate.currentLang !== 'ar' ? 'HudhudNest' : undefined
    });
  }
}
