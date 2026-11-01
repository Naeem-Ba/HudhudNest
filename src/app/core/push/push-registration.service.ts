import { HttpContext } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Router } from '@angular/router';
import { Observable, catchError, defer, from, of, switchMap } from 'rxjs';

import { BackendApiService } from '../api/backend-api.service';
import { SKIP_ERROR_TOAST } from '../interceptors/api-error.interceptor';
import { AuthService } from '../auth/auth.service';
import { PushNativeGateway, PushPermissionState } from './push-native.gateway';
import { routeForNotification } from '../models/notification-route';

/**
 * Keeps this app install's push address registered against the signed-in account:
 *  - signed in on a native build where notifications are already allowed: get the FCM token and
 *    POST /devices/push-token (re-sent whenever the OS rotates the token). The system permission
 *    dialog is NOT shown at sign-in, when the person has no reason yet to say yes: it is shown when they
 *    press "turn on notifications" (see PushOptInComponent on the notifications page), which calls enable();
 *  - signing out: revoke the token on the server BEFORE the session ends, so a notification meant
 *    for the account that just left cannot ring on this phone. If the session simply expires, the
 *    next account that signs in on the phone takes the token over (the API re-binds it to them).
 * On the web nothing happens: web users get the in-app (SignalR) notifications.
 * Push is a convenience: every failure here is silent and never blocks sign-in or sign-out.
 */
/** Push is a convenience and every failure is swallowed here: none of it may toast. */
const SILENT = new HttpContext().set(SKIP_ERROR_TOAST, true);

@Injectable({ providedIn: 'root' })
export class PushRegistrationService {
  private readonly api = inject(BackendApiService);
  private readonly auth = inject(AuthService);
  private readonly native = inject(PushNativeGateway);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);

  /** 'unknown' until the first check; stays 'unknown' on the web, where there is nothing to turn on. */
  readonly permission = signal<PushPermissionState | 'unknown'>('unknown');

  private started = false;
  private listenersAttached = false;
  private currentToken: string | null = null;

  start(): void {
    if (this.started || !this.native.isNativePlatform()) {
      return;
    }
    this.started = true;

    this.auth.isLoggedIn$.subscribe(loggedIn => {
      if (loggedIn) {
        void this.syncWithPermission();
      }
    });
  }

  /**
   * Called by the "turn on notifications" button: shows the system dialog (once; the OS remembers the answer)
   * and registers the device when the person agrees. Resolves to whether notifications are now on.
   */
  async enable(): Promise<boolean> {
    if (!this.native.isNativePlatform() || !this.native.platform()) {
      return false;
    }
    try {
      const granted = await this.native.requestPermission();
      this.permission.set(granted ? 'granted' : 'denied');
      if (granted) {
        await this.register();
      }
      return granted;
    } catch {
      return false;
    }
  }

  /** Call before ending the session; completes even when the server or the plugin fails. */
  revoke(): Observable<void> {
    return defer(() => {
      const token = this.currentToken;
      if (!token) {
        return of(void 0);
      }

      this.currentToken = null;
      return this.api.post<void>('/devices/push-token/revoke', { token }, { context: SILENT }).pipe(
        switchMap(() => from(this.native.deleteToken().catch(() => undefined))),
        switchMap(() => of(void 0)),
        catchError(() => of(void 0))
      );
    });
  }

  /** Registers silently when the permission is already granted; otherwise only records where it stands. */
  private async syncWithPermission(): Promise<void> {
    try {
      const state = await this.native.checkPermission();
      this.permission.set(state);
      if (state === 'granted') {
        await this.register();
      }
    } catch {
      // Push unavailable on this device: the in-app channel still works.
    }
  }

  private async register(): Promise<void> {
    const platform = this.native.platform();
    if (!platform) {
      return;
    }

    try {
      await this.native.ensureAndroidChannel(this.translate.instant('NOTIFICATIONS.PUSH_CHANNEL_NAME')).catch(() => undefined);
      await this.attachListeners(platform);

      const token = await this.native.getToken();
      if (token) {
        await this.send(token, platform);
      }
    } catch {
      // Push unavailable (no Google Play services, blocked, offline): the in-app channel still works.
    }
  }

  private async attachListeners(platform: 'android' | 'ios'): Promise<void> {
    if (this.listenersAttached) {
      return;
    }
    this.listenersAttached = true;

    await this.native.onTokenRefresh(token => {
      void this.send(token, platform).catch(() => undefined);
    });
    await this.native.onNotificationTapped(data => {
      // Open the screen the push is about; anything unknown falls back to the notification list.
      const route = data['targetKind']
        ? routeForNotification({
            type: data['type'],
            target: { kind: data['targetKind'], id: data['relatedEntityId'] ?? null, propertyId: data['propertyId'] ?? null },
            propertyId: data['propertyId'] ?? null,
            relatedEntityId: data['relatedEntityId'] ?? null
          })
        : null;
      void this.router.navigate(route ?? ['/notifications']);
    });
  }

  private async send(token: string, platform: 'android' | 'ios'): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.api.post<void>('/devices/push-token', { token, platform }, { context: SILENT }).subscribe({
        next: () => {
          this.currentToken = token;
          resolve();
        },
        error: reject
      });
    });
  }
}
