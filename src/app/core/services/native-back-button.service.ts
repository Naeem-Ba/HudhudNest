import { Location } from '@angular/common';
import { DestroyRef, Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { App } from '@capacitor/app';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';

import { OverlayBackHandlerService } from './overlay-back-handler.service';

/**
 * Android hardware-back integration for the Capacitor shell.
 * Browser/PWA execution is intentionally a no-op.
 */
@Injectable({ providedIn: 'root' })
export class NativeBackButtonService {
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly overlays = inject(OverlayBackHandlerService);
  private readonly destroyRef = inject(DestroyRef);

  private listener?: PluginListenerHandle;
  private initialized = false;

  initialize(): void {
    if (this.initialized || !Capacitor.isNativePlatform()) {
      return;
    }

    this.initialized = true;

    void App.addListener('backButton', ({ canGoBack }) => {
      if (this.overlays.closeTopOverlay()) {
        return;
      }

      if (canGoBack && !this.isRootRoute(this.router.url)) {
        this.location.back();
        return;
      }

      void App.exitApp();
    }).then(handle => {
      this.listener = handle;
    });

    this.destroyRef.onDestroy(() => {
      void this.listener?.remove();
      this.listener = undefined;
      this.initialized = false;
    });
  }

  private isRootRoute(url: string): boolean {
    const path = (url.split(/[?#]/, 1)[0] ?? '').replace(/\/+$/, '') || '/';
    return path === '/' || path === '/home';
  }
}
