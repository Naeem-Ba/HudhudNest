// =============================================================
// src/app/core/sharing/providers/copy-link.provider.ts
//
// Copies ONLY the canonical public URL (never an internal Angular route, never the whole
// message) to the clipboard. Uses the async Clipboard API where available, with a
// document.execCommand('copy') fallback for older/non-secure-context browsers.
// =============================================================

import { Injectable } from '@angular/core';
import { ShareableContent, ShareProvider, ShareResult, SharePlatform } from '../share.model';

@Injectable({ providedIn: 'root' })
export class CopyLinkProvider implements ShareProvider {
  readonly platform = SharePlatform.CopyLink;
  readonly labelKey = 'SHARE.COPY_LINK';

  isAvailable(): boolean {
    return typeof document !== 'undefined';
  }

  async share(content: ShareableContent): Promise<ShareResult> {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(content.url);
        return { success: true, platform: this.platform, message: 'SHARE.COPY_LINK_SUCCESS' };
      }

      if (this.copyViaFallback(content.url)) {
        return { success: true, platform: this.platform, message: 'SHARE.COPY_LINK_SUCCESS' };
      }

      return {
        success: false,
        platform: this.platform,
        errorCode: 'CLIPBOARD_UNAVAILABLE',
        message: 'SHARE.COPY_LINK_ERROR'
      };
    } catch {
      // Clipboard API can reject (permission denied, non-secure context) — try the legacy
      // fallback once before giving up, rather than failing immediately.
      if (this.copyViaFallback(content.url)) {
        return { success: true, platform: this.platform, message: 'SHARE.COPY_LINK_SUCCESS' };
      }

      return {
        success: false,
        platform: this.platform,
        errorCode: 'CLIPBOARD_FAILED',
        message: 'SHARE.COPY_LINK_ERROR'
      };
    }
  }

  /** Legacy fallback for browsers without navigator.clipboard (or a non-secure-context page). */
  private copyViaFallback(text: string): boolean {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      // Keep it off-screen and non-disruptive — no visible flash, no scroll jump.
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.setAttribute('readonly', '');
      document.body.appendChild(textarea);
      textarea.select();
      textarea.setSelectionRange(0, text.length);

      const copied = document.execCommand('copy');
      document.body.removeChild(textarea);
      return copied;
    } catch {
      return false;
    }
  }
}
