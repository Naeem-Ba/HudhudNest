// =============================================================
// src/app/core/sharing/providers/telegram-share.provider.ts
//
// Telegram's official share widget URL — url and text are separate parameters here (unlike
// WhatsApp), matching Telegram's own documented format exactly.
// =============================================================

import { Injectable } from '@angular/core';
import { openExternalLink } from '../external-link';
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

    // The result is "the share link was handed over", never "the post exists": there is no callback
    // from the other app. A pop-up blocker is not detectable here (see openExternalLink), so the only
    // real failure is the hand-over itself throwing.
    try {
      await openExternalLink(shareUrl);
    } catch {
      return {
        success: false,
        platform: this.platform,
        errorCode: 'OPEN_FAILED',
        message: 'SHARE.ERROR_OPEN_FAILED'
      };
    }

    return { success: true, platform: this.platform };
  }
}
