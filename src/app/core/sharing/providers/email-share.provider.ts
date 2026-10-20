// =============================================================
// src/app/core/sharing/providers/email-share.provider.ts
//
// "Send by e-mail" through a mailto: link: the device's own mail app composes the message. Only the
// public title, summary and link go in — the same ShareableContent every other provider gets, so no
// phone number, e-mail or owner detail can reach the message. Tracked as SharePlatform.Other, like the
// other entry points the backend enum has no dedicated value for.
// =============================================================

import { Injectable } from '@angular/core';
import { openExternalLink } from '../external-link';
import { ShareableContent, ShareProvider, ShareResult, SharePlatform } from '../share.model';

@Injectable({ providedIn: 'root' })
export class EmailShareProvider implements ShareProvider {
  readonly platform = SharePlatform.Other;
  readonly labelKey = 'SHARE.EMAIL';

  isAvailable(): boolean {
    return typeof document !== 'undefined';
  }

  async share(content: ShareableContent): Promise<ShareResult> {
    const mailto =
      `mailto:?subject=${encodeURIComponent(content.title)}` +
      `&body=${encodeURIComponent(content.text)}`;

    try {
      await openExternalLink(mailto);
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
