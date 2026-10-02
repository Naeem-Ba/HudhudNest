// ─────────────────────────────────────────────────────────
// structured-data.service.ts
// Centralized JSON-LD (schema.org) injection — the single place every page's structured data
// is built, so no component hand-rolls its own <script type="application/ld+json"> tag.
//
// Organization/WebSite are NOT handled here: they never change per route or per data, so they
// are static <script> tags in src/index.html instead — present even before Angular boots,
// which also means a non-JS crawler sees them (unlike anything this service injects, which is
// only ever in the DOM after the page's component has run).
// ─────────────────────────────────────────────────────────
import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

export interface BreadcrumbItem {
  name: string;
  url: string;
}

/** Shared <script> id for whichever page currently owns the breadcrumb — exactly one page's
 *  breadcrumb can be on screen at a time, so every caller uses this same id rather than each
 *  picking its own (which would leave a stale breadcrumb behind when navigating to a page that
 *  doesn't set one itself). */
export const BREADCRUMB_JSON_LD_ID = 'ld-breadcrumb';

@Injectable({ providedIn: 'root' })
export class StructuredDataService {
  private readonly document = inject(DOCUMENT);

  /** Writes (or replaces) one JSON-LD <script> tag, keyed by `id` so a later call with the
   *  same id updates it in place instead of accumulating duplicate tags. */
  setJsonLd(id: string, data: object): void {
    let script = this.document.getElementById(id) as HTMLScriptElement | null;
    if (!script) {
      script = this.document.createElement('script');
      script.type = 'application/ld+json';
      script.id = id;
      this.document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(data);
  }

  /** Removes a previously-set JSON-LD tag — call on leaving a page whose structured data must
   *  not linger into whatever route is visited next (e.g. a property's RealEstateListing). */
  removeJsonLd(id: string): void {
    this.document.getElementById(id)?.remove();
  }

  buildBreadcrumbList(items: BreadcrumbItem[]): object {
    return {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: items.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: item.name,
        item: item.url
      }))
    };
  }
}
