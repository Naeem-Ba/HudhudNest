// =============================================================
// src/app/core/sharing/providers/native-share.provider.ts
//
// Wraps the Web Share API (navigator.share). Works in supporting desktop/mobile browsers AND
// inside the Capacitor WebView on modern Android/iOS (Chrome-based WebView / WKWebView both
// implement navigator.share) — no extra native plugin is required today. The interface is
// deliberately identical to every other ShareProvider so this class can be swapped later for
// one backed by @capacitor/share (guaranteed native behavior, incl. older WebViews) without
// touching SocialShareService or the UI — only this file would change.
//
// A user dismissing the native share sheet is a normal, frequent outcome — treated as
// `cancelled: true`, never as an error (see section 9 of the feature spec).
// =============================================================

import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { ShareableContent, ShareProvider, ShareResult, SharePlatform } from '../share.model';

/** Minimal shape this provider actually needs — deliberately NOT `extends Navigator`, since
 *  the real DOM lib's Navigator.share/canShare signatures vary across TS/lib versions and a
 *  narrower structural type avoids fighting that instead of depending on it. */
interface NavigatorWithShare {
  share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
}

@Injectable({ providedIn: 'root' })
export class NativeShareProvider implements ShareProvider {
  readonly platform = SharePlatform.Native;
  readonly labelKey = 'SHARE.NATIVE';

  isAvailable(): boolean {
    // The Capacitor app always has the system share sheet (@capacitor/share, installed).
    if (Capacitor.isNativePlatform()) {
      return true;
    }
    const nav = this.navigatorWithShare();
    return typeof nav?.share === 'function';
  }

  async share(content: ShareableContent): Promise<ShareResult> {
    if (Capacitor.isNativePlatform()) {
      return this.shareWithCapacitor(content);
    }

    const nav = this.navigatorWithShare();
    if (typeof nav?.share !== 'function') {
      return {
        success: false,
        platform: this.platform,
        errorCode: 'NOT_SUPPORTED',
        message: 'SHARE.NATIVE_NOT_SUPPORTED'
      };
    }

    try {
      await nav.share({ title: content.title, text: content.text, url: content.url });
      return { success: true, platform: this.platform };
    } catch (err) {
      if (this.isUserCancellation(err)) {
        // The user closed the share sheet without picking anything — not a failure.
        return { success: false, platform: this.platform, cancelled: true };
      }

      return {
        success: false,
        platform: this.platform,
        errorCode: 'NATIVE_SHARE_FAILED',
        message: 'SHARE.ERROR_GENERIC'
      };
    }
  }

  /** The installed app: the OS share sheet through @capacitor/share, which is guaranteed there even on
   *  WebViews without navigator.share. Dismissing it rejects ("Share canceled" on iOS, an abort on
   *  Android) and is a normal outcome, not an error. */
  private async shareWithCapacitor(content: ShareableContent): Promise<ShareResult> {
    try {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title: content.title, text: content.text, url: content.url, dialogTitle: content.title });
      return { success: true, platform: this.platform };
    } catch (err) {
      if (this.isUserCancellation(err)) {
        return { success: false, platform: this.platform, cancelled: true };
      }
      return {
        success: false,
        platform: this.platform,
        errorCode: 'NATIVE_SHARE_FAILED',
        message: 'SHARE.ERROR_GENERIC'
      };
    }
  }

  private isUserCancellation(err: unknown): boolean {
    const message = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
    if (/cancel/i.test(message)) {
      return true;
    }

    // Every major browser rejects navigator.share() with an AbortError DOMException when the
    // user dismisses the share sheet — this is the standard, spec-documented signal for it.
    return err instanceof DOMException && err.name === 'AbortError';
  }

  private navigatorWithShare(): NavigatorWithShare | undefined {
    return typeof navigator !== 'undefined' ? (navigator as NavigatorWithShare) : undefined;
  }
}
