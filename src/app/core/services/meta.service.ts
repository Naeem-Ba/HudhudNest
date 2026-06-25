// ─────────────────────────────────────────────────────────
// meta.service.ts
// إدارة SEO Meta Tags ديناميكياً في Angular
// ─────────────────────────────────────────────────────────
import { Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

export interface PageMeta {
  title:       string;
  description: string;
  keywords?:   string;
  ogImage?:    string;
  canonical?:  string;
}

@Injectable({ providedIn: 'root' })
export class MetaService {
  private readonly title = inject(Title);
  private readonly meta  = inject(Meta);

  /**
   * تعيين جميع meta tags لصفحة معينة
   */
  setMeta(opts: PageMeta): void {
    const siteName = 'PropertyApp';
    const fullTitle = `${opts.title} | ${siteName}`;

    // ── Title ──
    this.title.setTitle(fullTitle);

    // ── Standard ──
    this.meta.updateTag({ name: 'description', content: opts.description });
    if (opts.keywords) {
      this.meta.updateTag({ name: 'keywords', content: opts.keywords });
    }

    // ── Open Graph ──
    this.meta.updateTag({ property: 'og:title',       content: fullTitle });
    this.meta.updateTag({ property: 'og:description', content: opts.description });
    this.meta.updateTag({ property: 'og:type',        content: 'website' });
    this.meta.updateTag({ property: 'og:locale',      content: 'ar_SY' });
    this.meta.updateTag({ property: 'og:site_name',   content: siteName });
    if (opts.ogImage) {
      this.meta.updateTag({ property: 'og:image', content: opts.ogImage });
    }

    // ── Twitter Card ──
    this.meta.updateTag({ name: 'twitter:card',        content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title',       content: fullTitle });
    this.meta.updateTag({ name: 'twitter:description', content: opts.description });
    if (opts.ogImage) {
      this.meta.updateTag({ name: 'twitter:image', content: opts.ogImage });
    }
  }

  /**
   * Meta Tags المُعدَّة مسبقاً لصفحة الهبوط
   */
  setLandingMeta(): void {
    this.setMeta({
      title:       'منصة عقارية رقمية في سوريا',
      description: 'ابحث عن شقق وعقارات للبيع والإيجار في سوريا بسهولة. صور واضحة، معلومات منظمة، وتواصل مباشر مع المالك أو المكتب العقاري.',
      keywords:    'عقارات سوريا, شقق للإيجار في دمشق, عقارات للبيع في حلب, منصة عقارية سوريا, بيع وشراء العقارات',
      ogImage:     'https://propertyapp.sy/assets/images/og-cover.jpg',
    });
  }
}
