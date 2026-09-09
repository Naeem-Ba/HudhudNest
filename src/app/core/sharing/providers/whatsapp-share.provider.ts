// =============================================================
// src/app/core/sharing/providers/whatsapp-share.provider.ts
//
// wa.me is WhatsApp's own official link format — works as a deep link into the app on mobile
// and falls back to WhatsApp Web/download prompt on desktop with no extra branching needed.
// The full message (title + summary + canonical URL) is the "text" — WhatsApp's endpoint has
// no separate url parameter (see section 8 of the feature spec).
// =============================================================

import { Injectable } from '@angular/core';
import { ShareableContent, ShareProvider, ShareResult, SharePlatform } from '../share.model';

@Injectable({ providedIn: 'root' })
export class WhatsAppShareProvider implements ShareProvider {
  readonly platform = SharePlatform.WhatsApp;
  readonly labelKey = 'SHARE.WHATSAPP';

  isAvailable(): boolean {
    return typeof window !== 'undefined';
  }

  async share(content: ShareableContent): Promise<ShareResult> {
    const shareUrl = `https://wa.me/?text=${encodeURIComponent(content.text)}`;

    const opened = window.open(shareUrl, '_blank', 'noopener,noreferrer');
    if (!opened) {
      return {
        success: false,
        platform: this.platform,
        errorCode: 'POPUP_BLOCKED',
        message: 'SHARE.ERROR_POPUP_BLOCKED'
      };
    }

    return { success: true, platform: this.platform };
  }
}
