// =============================================================
// src/app/core/sharing/providers/telegram-share.provider.ts
//
// Telegram's official share widget URL — url and text are separate parameters here (unlike
// WhatsApp), matching Telegram's own documented format exactly.
// =============================================================

import { Injectable } from '@angular/core';
import { ShareableContent, ShareProvider, ShareResult, SharePlatform } from '../share.model';

@Injectable({ providedIn: 'root' })
export class TelegramShareProvider implements ShareProvider {
  readonly platform = SharePlatform.Telegram;
  readonly labelKey = 'SHARE.TELEGRAM';

  isAvailable(): boolean {
    return typeof window !== 'undefined';
  }

  async share(content: ShareableContent): Promise<ShareResult> {
    // Telegram appends `url` itself as a link preview card (using this listing's Open Graph
    // metadata) — `text` is just a caption, so it deliberately does NOT repeat the URL the way
    // the WhatsApp message does.
    const shareUrl =
      `https://t.me/share/url?url=${encodeURIComponent(content.url)}` +
      `&text=${encodeURIComponent(content.title)}`;

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
