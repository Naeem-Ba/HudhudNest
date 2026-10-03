import { DestroyRef, Injectable, NgZone, inject } from '@angular/core';
import { Router } from '@angular/router';
import { App } from '@capacitor/app';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';

import { resolveDeepLink } from './deep-link-routes';

/**
 * Opens https://hudhudnest.com/... links inside the Capacitor shell.
 *
 * The operating system decides *whether* our app receives a link (Android App Links via the manifest
 * intent-filter + assetlinks.json, iOS Universal Links via the entitlement + apple-app-site-association).
 * This service decides *what to do* with it: validate it (see resolveDeepLink) and navigate the router.
 *
 * Browser/PWA execution is intentionally a no-op, exactly like NativeBackButtonService.
 */
@Injectable({ providedIn: 'root' })
export class DeepLinkService {
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);

  private listener?: PluginListenerHandle;
  private initialized = false;

  initialize(): void {
    if (this.initialized || !Capacitor.isNativePlatform()) {
      return;
    }

    this.initialized = true;

    // Link tapped while the app is running or in the background.
    void App.addListener('appUrlOpen', ({ url }) => {
      this.open(url);
    }).then(handle => {
      this.listener = handle;
    });

    // Link that cold-started the app: the event above fires before any listener exists.
    void App.getLaunchUrl()
      .then(launch => this.open(launch?.url))
      .catch(() => undefined);

    this.destroyRef.onDestroy(() => {
      void this.listener?.remove();
      this.listener = undefined;
      this.initialized = false;
    });
  }

  /** Navigates to the link when it is allowed; returns whether it was. Capacitor events arrive outside Angular's zone. */
  open(rawUrl: string | null | undefined): boolean {
    const target = resolveDeepLink(rawUrl);

    if (!target) {
      return false;
    }

    this.zone.run(() => {
      void this.router.navigateByUrl(target);
    });

    return true;
  }
}
