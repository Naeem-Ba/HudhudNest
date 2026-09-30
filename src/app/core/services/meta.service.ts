// ─────────────────────────────────────────────────────────
// meta.service.ts
// إدارة SEO Meta Tags ديناميكياً في Angular
// ─────────────────────────────────────────────────────────
import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

export interface PageMeta {
  title:       string;
  description: string;
  keywords?:   string;
  ogImage?:    string;
  /**
   * Canonical public URL for this page — sets BOTH <link rel="canonical"> and og:url (Social
   * Sharing & Distribution feature). Must be the same canonical URL used everywhere else the
   * page is shared (Web Share API, Facebook/WhatsApp/Telegram links, Copy Link) — see
   * PropertyShareUrlService.getPropertyPublicUrl(), the single place that URL is built.
   */
  canonical?:  string;
  /** Open Graph type — defaults to 'website'; a property page passes 'website' too (there is
   *  no dedicated 'product'/'real_estate' og:type this app opts into). */
  ogType?: string;
}

@Injectable({ providedIn: 'root' })
export class MetaService {
  private readonly title = inject(Title);
  private readonly meta  = inject(Meta);
  private readonly document = inject(DOCUMENT);

  /**
   * تعيين جميع meta tags لصفحة معينة
   */
  setMeta(opts: PageMeta): void {
    const siteName = 'هدهد نيست';
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
    this.meta.updateTag({ property: 'og:type',        content: opts.ogType ?? 'website' });
    this.meta.updateTag({ property: 'og:locale',      content: 'ar_SY' });
    this.meta.updateTag({ property: 'og:site_name',   content: siteName });
    if (opts.ogImage) {
      this.meta.updateTag({ property: 'og:image', content: opts.ogImage });
    }
    if (opts.canonical) {
      this.meta.updateTag({ property: 'og:url', content: opts.canonical });
    }

    // ── Twitter Card ──
    this.meta.updateTag({ name: 'twitter:card',        content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title',       content: fullTitle });
    this.meta.updateTag({ name: 'twitter:description', content: opts.description });
    if (opts.ogImage) {
      this.meta.updateTag({ name: 'twitter:image', content: opts.ogImage });
    }

    // ── Canonical link ──
    // Angular's Meta service only manages <meta>, not <link> — the canonical tag is
    // maintained directly against the DOM, matching this app's other direct-DOM touches
    // (e.g. ThemeService setting an attribute on <html>).
    if (opts.canonical) {
      this.setCanonicalLink(opts.canonical);
    }
  }

  private setCanonicalLink(url: string): void {
    let link = this.document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = this.document.createElement('link');
      link.setAttribute('rel', 'canonical');
      this.document.head.appendChild(link);
    }
    link.setAttribute('href', url);
  }

  /**
   * Meta Tags المُعدَّة مسبقاً لصفحة الهبوط
   */
  setLandingMeta(): void {
    this.setMeta({
      title:       'منصة عقارية رقمية في سوريا',
      description: 'ابحث عن شقق وعقارات للبيع والإيجار في سوريا بسهولة. صور واضحة، معلومات منظمة، وتواصل مباشر مع المالك أو المكتب العقاري.',
      keywords:    'عقارات سوريا, شقق للإيجار في دمشق, عقارات للبيع في حلب, منصة عقارية سوريا, بيع وشراء العقارات',
      ogImage:     'https://hudhudnest.com/assets/images/og-cover.jpg',
    });
  }
}
