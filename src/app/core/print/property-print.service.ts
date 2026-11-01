// =============================================================
// src/app/core/print/property-print.service.ts
//
// "طباعة الإعلان": builds a self-contained, print-ready page for one listing (public facts only —
// never the owner's phone, e-mail or name) and prints it. No PDF library: the browser's own print
// dialog already offers "Save as PDF", and the document is plain HTML/CSS with @page rules.
//
// Web: the document is written into a hidden iframe and printed from there, so the app's own
// chrome (header, tabs, gallery, chat) can never leak into the printout. Native app: a WebView
// cannot print an iframe, so the public listing page is opened in the system browser with ?print=1
// and PropertyDetailPage prints it there (see printUrl / PRINT_QUERY_PARAM).
// =============================================================

import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Capacitor } from '@capacitor/core';

import { Property } from '../models/property.model';
import { PropertyShareUrlService } from '../sharing/property-share-url.service';
import { openExternalLink } from '../sharing/external-link';
import { amenityLabel } from '../i18n/amenity-label';
import { currentUiLanguage, listSeparator, uiNumberLocale } from '../i18n/ui-language';
import { formatListingPrice } from '../../shared/utils/listing-price';

export const PRINT_QUERY_PARAM = 'print';

const MAX_PHOTOS = 4;
const IMAGE_WAIT_MS = 4000;

export interface PrintRow { readonly label: string; readonly value: string; }

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** http(s) and same-origin paths only — a listing photo must never smuggle in a javascript: URL. */
function safeImageUrl(url: string | null | undefined): string | null {
  const value = (url ?? '').trim();
  return /^(https?:\/\/|\/)/i.test(value) ? value : null;
}

@Injectable({ providedIn: 'root' })
export class PropertyPrintService {
  private readonly translate = inject(TranslateService);
  private readonly shareUrl = inject(PropertyShareUrlService);

  /** True when there is a public listing to print. */
  canPrint(property: Property | null | undefined): boolean {
    return !!this.shareUrl.getPropertyPublicUrl(property);
  }

  /** The public page the native app opens to print from the system browser. */
  printUrl(property: Property): string | null {
    const url = this.shareUrl.getPropertyPublicUrl(property);
    return url ? `${url}?${PRINT_QUERY_PARAM}=1` : null;
  }

  /** Resolves true when the print dialog was opened (or handed to the system browser). */
  async print(property: Property): Promise<boolean> {
    if (!this.canPrint(property)) return false;

    if (Capacitor.isNativePlatform()) {
      const url = this.printUrl(property);
      if (!url) return false;
      try {
        await openExternalLink(url);
        return true;
      } catch {
        return false;
      }
    }

    return this.printInFrame(this.buildDocument(property));
  }

  // ── document ────────────────────────────────────────────────────────────────

  rows(property: Property): PrintRow[] {
    const t = (key: string, params?: object) => this.translate.instant(key, params) as string;
    const rows: PrintRow[] = [];
    const num = (n: number) => new Intl.NumberFormat(uiNumberLocale()).format(n);

    const lt = property.listingType;
    const mode = lt === 'ForSale' ? 'PROPERTY.MODE_SALE' : lt === 'ForRentAndSale' ? 'SHARE.MSG.MODE_BOTH' : 'PROPERTY.MODE_RENT';
    rows.push({ label: t('PRINT.LISTING_TYPE'), value: t(mode) });

    if (property.area) {
      const unit = !property.areaUnit || property.areaUnit === 'SquareMeter' ? t('COMMON.area_unit') : property.areaUnit;
      rows.push({ label: t('PRINT.AREA'), value: `${num(property.area)} ${unit}` });
    }
    if (property.rooms) rows.push({ label: t('PRINT.ROOMS'), value: num(property.rooms) });
    if (property.floor !== undefined && property.floor !== null) rows.push({ label: t('PRINT.FLOOR'), value: num(property.floor) });

    const location = [property.city, property.region].map(v => v?.trim()).filter(Boolean).join(listSeparator());
    if (location) rows.push({ label: t('PRINT.LOCATION'), value: location });

    return rows;
  }

  prices(property: Property): PrintRow[] {
    const t = (key: string) => this.translate.instant(key) as string;
    const cur = property.currencyCode;
    const out: PrintRow[] = [];
    if (property.purchasePrice) out.push({ label: t('PROPERTY.PURCHASE_PRICE'), value: formatListingPrice(property.purchasePrice, cur) });
    if (property.coldRent) out.push({ label: t('PROPERTY.COLD_RENT'), value: formatListingPrice(property.coldRent, cur) });
    if (property.warmRent) out.push({ label: t('PROPERTY.WARM_RENT'), value: formatListingPrice(property.warmRent, cur) });
    if (property.deposit) out.push({ label: t('PROPERTY.DEPOSIT'), value: formatListingPrice(property.deposit, cur) });
    return out;
  }

  buildDocument(property: Property): string {
    const t = (key: string, params?: object) => this.translate.instant(key, params) as string;
    const lang = currentUiLanguage() ?? 'ar';
    const dir = lang === 'ar' ? 'rtl' : 'ltr';
    const origin = this.shareUrl.getSiteOrigin();
    const url = this.shareUrl.getPropertyPublicUrl(property) ?? '';
    const logo = `${origin}/images/horizontal-logo-480.png`;

    const photos = (property.images ?? [])
      .map(img => safeImageUrl(img.url))
      .filter((u): u is string => !!u);
    const fallbackPhoto = safeImageUrl(property.mainImageUrl);
    const all = photos.length ? photos : fallbackPhoto ? [fallbackPhoto] : [];
    const [main, ...rest] = all.slice(0, MAX_PHOTOS);

    const amenities = (property.amenities ?? [])
      .map(a => amenityLabel(this.translate, { name: a.name, icon: a.icon, iconName: a.iconName }))
      .filter(Boolean);

    const prices = this.prices(property);
    const rowsHtml = this.rows(property)
      .map(r => `<tr><th>${escapeHtml(r.label)}</th><td>${escapeHtml(r.value)}</td></tr>`).join('');
    const pricesHtml = prices
      .map(r => `<div class="price"><span>${escapeHtml(r.label)}</span><strong>${escapeHtml(r.value)}</strong></div>`).join('');

    const description = property.description?.trim();
    const date = new Date().toLocaleDateString(uiNumberLocale());

    return `<!doctype html>
<html lang="${lang}" dir="${dir}"><head><meta charset="utf-8">
<title>${escapeHtml(property.title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", Tahoma, Arial, sans-serif; color: #0f172a; line-height: 1.6; font-size: 12pt; }
  header { display: flex; justify-content: space-between; align-items: center; gap: 12px; border-bottom: 2px solid #0f2742; padding-bottom: 8px; margin-bottom: 12px; }
  header img { height: 38px; width: auto; }
  header small { color: #475569; }
  h1 { font-size: 20pt; margin: 0 0 8px; color: #0f2742; }
  .hero { width: 100%; max-height: 95mm; object-fit: cover; border-radius: 6px; display: block; margin-bottom: 8px; }
  .thumbs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 12px; }
  .thumbs img { width: 100%; height: 34mm; object-fit: cover; border-radius: 4px; }
  .prices { display: flex; flex-wrap: wrap; gap: 8px 24px; margin: 8px 0 12px; }
  .price span { display: block; color: #475569; font-size: 10pt; }
  .price strong { font-size: 16pt; color: #0f2742; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th, td { text-align: start; padding: 5px 8px; border-bottom: 1px solid #e2e8f0; }
  th { width: 34%; color: #475569; font-weight: 600; }
  h2 { font-size: 13pt; margin: 14px 0 6px; color: #0f2742; break-after: avoid; }
  p.desc { white-space: pre-wrap; margin: 0; overflow-wrap: anywhere; }
  ul.amenities { columns: 2; margin: 0; padding-inline-start: 18px; }
  ul.amenities li { break-inside: avoid; }
  .agency { margin-top: 10px; }
  footer { margin-top: 16px; padding-top: 8px; border-top: 1px solid #cbd5e1; font-size: 10pt; color: #475569; word-break: break-all; break-inside: avoid; }
  img { break-inside: avoid; }
</style></head><body>
<header><img src="${escapeHtml(logo)}" alt="HudhudNest"><small>${escapeHtml(t('PRINT.PRINTED_ON', { date }))}</small></header>
<h1>${escapeHtml(property.title)}</h1>
${main ? `<img class="hero" src="${escapeHtml(main)}" alt="">` : ''}
${rest.length ? `<div class="thumbs">${rest.map(u => `<img src="${escapeHtml(u)}" alt="">`).join('')}</div>` : ''}
${pricesHtml ? `<div class="prices">${pricesHtml}</div>` : ''}
<table>${rowsHtml}</table>
${description ? `<h2>${escapeHtml(t('PRINT.DESCRIPTION'))}</h2><p class="desc">${escapeHtml(description)}</p>` : ''}
${amenities.length ? `<h2>${escapeHtml(t('PRINT.AMENITIES'))}</h2><ul class="amenities">${amenities.map(a => `<li>${escapeHtml(a)}</li>`).join('')}</ul>` : ''}
${property.agencyName ? `<div class="agency"><h2>${escapeHtml(t('PRINT.AGENCY'))}</h2>${escapeHtml(property.agencyName)}</div>` : ''}
<footer>${escapeHtml(t('PRINT.LINK'))}: <span dir="ltr">${escapeHtml(url)}</span></footer>
</body></html>`;
  }

  // ── printing ────────────────────────────────────────────────────────────────

  private printInFrame(html: string): Promise<boolean> {
    return new Promise<boolean>(resolve => {
      const frame = document.createElement('iframe');
      frame.setAttribute('aria-hidden', 'true');
      frame.style.cssText = 'position:fixed;inset-inline-end:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
      document.body.appendChild(frame);

      const cleanup = () => setTimeout(() => frame.remove(), 1500);
      const doc = frame.contentDocument;
      const win = frame.contentWindow;
      if (!doc || !win) {
        frame.remove();
        resolve(false);
        return;
      }

      doc.open();
      doc.write(html);
      doc.close();

      const images = Array.from(doc.images);
      const ready = Promise.race([
        Promise.all(images.map(img => img.complete
          ? Promise.resolve()
          : new Promise<void>(done => { img.onload = img.onerror = () => done(); }))),
        new Promise<void>(done => setTimeout(done, IMAGE_WAIT_MS))
      ]);

      void ready.then(() => {
        try {
          win.addEventListener('afterprint', cleanup, { once: true });
          win.focus();
          win.print();
          resolve(true);
          setTimeout(cleanup, 60_000);
        } catch {
          cleanup();
          resolve(false);
        }
      });
    });
  }
}
