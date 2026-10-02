// ─────────────────────────────────────────────────────────
// meta.service.ts
// إدارة SEO Meta Tags ديناميكياً في Angular
// ─────────────────────────────────────────────────────────
import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { environment } from '../../../environments/environment';

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
  /** Overrides the default Arabic site name in the title suffix (e.g. 'HudhudNest' for en/de pages). */
  siteName?: string;
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
    const siteName = opts.siteName ?? 'هدهد نيست';
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
   * Second layer of Staging/preview protection for a crawler that actually executes JS (robots.txt
   * is generated per-deploy-context to disallow everything outside Production -- see
   * tools/generate-robots.mjs -- but that is a static file a JS-executing crawler could in
   * principle ignore once it has already fetched and rendered the page). Called once, at app
   * bootstrap (AppComponent), never per-route: there is nothing to turn back on later, since
   * `environment.environmentName` cannot change within a running app instance.
   */
  applyGlobalRobotsPolicy(): void {
    if (environment.environmentName !== 'production') {
      this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
    }
  }

  /**
   * Per-page robots override, for a specific page that must never be indexed regardless of
   * environment — e.g. a property id that doesn't exist or isn't public anymore. Pass `null` to
   * clear it again (e.g. a retry that succeeds): this restores the environment's own default
   * rather than unconditionally removing the tag, so clearing it on a Production page where
   * nothing else set `robots` is a no-op, while outside Production it never fights
   * applyGlobalRobotsPolicy's own noindex, which must stay regardless of per-page state.
   */
  setPageRobots(content: string | null): void {
    if (content) {
      this.meta.updateTag({ name: 'robots', content });
      return;
    }
    if (environment.environmentName === 'production') {
      this.meta.removeTag('name="robots"');
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
      ogImage:     'https://hudhudnest.com/assets/images/og-cover.jpg',
    });
  }
}
