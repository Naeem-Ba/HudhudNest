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
   * Removes the canonical <link> entirely. For a component whose destroy hook must not leave a
   * page-specific canonical sitting in the DOM once the user has navigated away, same spirit as
   * StructuredDataService.removeJsonLd -- unlike title/og:title/description, which the next
   * page's own setMeta() call naturally overwrites (and which this app's pages deliberately
   * leave stale in between for that reason, see PropertyDetailPage's destroy hook), canonical
   * has no such safety net for a destination page that calls setMeta() with no `canonical` at
   * all (most pages, as of the 2026-10 session audit): it would otherwise keep pointing at the
   * property/listing the user has already left. Removing it outright is safe regardless of what
   * comes next -- a destination that sets its own canonical replaces it immediately, and one
   * that doesn't is correctly left with none rather than a wrong one.
   */
  clearCanonical(): void {
    this.document.querySelector('link[rel="canonical"]')?.remove();
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
  setLandingMeta(offer?: { offerName: string; offerDescription?: string | null }): void {
    // With a live offer the tags describe it (browsers/crawlers that run JS see this; crawlers
    // that don't get the same text from the social-crawler edge function for /landing).
    const description = offer
      ? [offer.offerName, offer.offerDescription].filter((part): part is string => !!part?.trim()).join(' — ')
      : 'ابحث عن شقق وعقارات للبيع والإيجار في سوريا بسهولة. صور واضحة، معلومات منظمة، وتواصل مباشر مع المالك أو المكتب العقاري.';
    this.setMeta({
      title:       'منصة عقارية رقمية في سوريا',
      description,
      keywords:    'عقارات سوريا, شقق للإيجار في دمشق, عقارات للبيع في حلب, منصة عقارية سوريا, بيع وشراء العقارات',
      // Was '/assets/images/og-cover.jpg', a file that has never existed in this project (no
      // assets/images directory at all) -- a broken og:image means a blank/failed preview image
      // on every Facebook/WhatsApp/Telegram share of this page. Session audit, 2026-10.
      ogImage:     'https://hudhudnest.com/images/og-default.png',
    });
  }

  /**
   * Meta tags for the real homepage (/home, what '/' redirects to) -- distinct from
   * setLandingMeta() above, which is a separate, currently-unlinked marketing page. Session
   * audit (2026-10) found /home called neither this nor anything else: its title/description
   * were whatever index.html's static shell happened to say ("HudhudNest", no description at
   * all) and it had no canonical link, same gap this closes for every other page via setMeta.
   * `canonical` is passed in rather than built here because resolving the site origin
   * (environment.siteUrl, falling back to window.location.origin) already has a single home in
   * PropertyShareUrlService.getSiteOrigin() -- this generic service has no reason to depend on
   * that property-sharing-named one, so the caller (HomeComponent) resolves it instead.
   */
  setHomeMeta(canonical: string): void {
    this.setMeta({
      title:       'منصة عقارية رقمية في سوريا',
      description: 'ابحث عن شقق وعقارات للبيع والإيجار في سوريا بسهولة. صور واضحة، معلومات منظمة، وتواصل مباشر مع المالك أو المكتب العقاري.',
      keywords:    'عقارات سوريا, شقق للإيجار في دمشق, عقارات للبيع في حلب, منصة عقارية سوريا, بيع وشراء العقارات',
      ogImage:     'https://hudhudnest.com/images/og-default.png',
      canonical
    });
  }

  /**
   * Meta tags for the property list/search page. Session audit (2026-10) found two gaps here:
   * no title/description of its own (same "HudhudNest" default as every unhandled page), and no
   * canonical at all -- the page's own filters (city, price, rooms...) are real query params
   * (property-list.page.ts calls router.navigate with queryParams), so /properties?city=...&
   * minPrice=... is a real, distinct, crawlable URL with no canonical pointing back to the base
   * listing. `canonical` is always the clean `/properties` path with no query string, regardless
   * of which filters are active when this is called -- consolidating every filtered variant onto
   * one canonical URL is the standard fix for this class of faceted-search duplicate content,
   * and still lets Google crawl/index a specific filtered URL on its own if it chooses to; this
   * only removes the "these are N different pages" signal that a missing canonical implied.
   */
  setPropertiesListMeta(canonical: string): void {
    this.setMeta({
      title:       'عقارات للبيع والإيجار في سوريا',
      description: 'تصفّح آلاف العقارات للبيع والإيجار في سوريا — شقق ومنازل في دمشق وحلب وطرطوس وغيرها، مع صور وتفاصيل كاملة وتواصل مباشر مع المالك أو المكتب العقاري.',
      keywords:    'عقارات للبيع, عقارات للإيجار, شقق سوريا, عقارات دمشق, عقارات حلب',
      ogImage:     'https://hudhudnest.com/images/og-default.png',
      canonical
    });
  }
}
