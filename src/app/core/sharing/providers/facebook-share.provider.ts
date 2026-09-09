// =============================================================
// src/app/core/sharing/providers/facebook-share.provider.ts
//
// Uses Facebook's official Sharer endpoint (a share *intent* link — opening it is the entire
// contract; there is no publish-confirmation callback, so success here means "the share dialog
// was opened", never "the post was published"). No Graph API, no access token — see section 8
// of the feature spec ("لا تستخدم APIs غير رسمية").
// =============================================================

import { Injectable } from '@angular/core';
import { ShareableContent, ShareProvider, ShareResult, SharePlatform } from '../share.model';

@Injectable({ providedIn: 'root' })
export class FacebookShareProvider implements ShareProvider {
  readonly platform = SharePlatform.Facebook;
  readonly labelKey = 'SHARE.FACEBOOK';

  isAvailable(): boolean {
    return typeof window !== 'undefined';
  }

  async share(content: ShareableContent): Promise<ShareResult> {
    const shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(content.url)}`;

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
