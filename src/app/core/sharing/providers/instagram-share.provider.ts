// =============================================================
// src/app/core/sharing/providers/instagram-share.provider.ts
//
// Instagram has no official web publishing/share API — there is no equivalent of Facebook's
// sharer.php or Telegram's share widget. Per section 8 of the feature spec, this deliberately
// does NOT call any unofficial/private Instagram endpoint and never claims a post was
// published. The only honest, official path from a web page to Instagram is the device's own
// share sheet (the person picks Instagram there themselves) — so this provider is only ever
// available when NativeShareProvider is, and delegates to it. Tracked as SharePlatform.Other
// (not Native) so analytics can still tell "someone tapped the Instagram entry point" apart
// from "someone tapped the generic device-share entry point" — see PropertiesController's
// SharePlatform enum, which documents this exact mapping.
//
// When Web Share API isn't supported (e.g. desktop Firefox), the button using this provider is
// hidden entirely rather than shown disabled or, worse, faked — see PropertyShareButtonComponent.
// =============================================================

import { Injectable, inject } from '@angular/core';
import { ShareableContent, ShareProvider, ShareResult, SharePlatform } from '../share.model';
import { NativeShareProvider } from './native-share.provider';

@Injectable({ providedIn: 'root' })
export class InstagramShareProvider implements ShareProvider {
  readonly platform = SharePlatform.Other;
  readonly labelKey = 'SHARE.INSTAGRAM';

  private readonly nativeShare = inject(NativeShareProvider);

  isAvailable(): boolean {
    return this.nativeShare.isAvailable();
  }

  async share(content: ShareableContent): Promise<ShareResult> {
    const result = await this.nativeShare.share(content);
    return { ...result, platform: this.platform };
  }
}
