import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

const SCRIPT_BASE = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';
const LOAD_TIMEOUT_MS = 10_000;

/**
 * Loads the AdSense library at most once per page lifetime, and only when asked (never from index.html). The same
 * promise is handed to every caller, so route changes and component re-creation cannot add a second <script>.
 * Resolves false (never rejects) on error, ad-blocker or timeout so the page keeps working without ads.
 */
@Injectable({ providedIn: 'root' })
export class AdSenseLoaderService {
  private readonly document = inject(DOCUMENT);
  private pending?: Promise<boolean>;

  load(publisherId: string): Promise<boolean> {
    return (this.pending ??= new Promise<boolean>(resolve => {
      const existing = this.document.querySelector('script[data-hn-adsense]');
      if (existing) {
        resolve(true);
        return;
      }
      const script = this.document.createElement('script');
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.dataset['hnAdsense'] = '1';
      script.src = `${SCRIPT_BASE}?client=${encodeURIComponent(publisherId)}`;
      const timer = setTimeout(() => resolve(false), LOAD_TIMEOUT_MS);
      script.onload = () => {
        clearTimeout(timer);
        resolve(true);
      };
      script.onerror = () => {
        clearTimeout(timer);
        script.remove();
        resolve(false);
      };
      this.document.head.appendChild(script);
    }));
  }
}
