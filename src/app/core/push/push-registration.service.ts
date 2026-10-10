import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, defer, from, of, switchMap } from 'rxjs';

import { BackendApiService } from '../api/backend-api.service';
import { AuthService } from '../auth/auth.service';
import { PushNativeGateway } from './push-native.gateway';

/**
 * Keeps this app install's push address registered against the signed-in account:
 *  - signed in on a native build: ask permission, get the FCM token, POST /devices/push-token
 *    (re-sent whenever the OS rotates the token);
 *  - signing out: revoke the token on the server BEFORE the session ends, so a notification meant
 *    for the account that just left cannot ring on this phone. If the session simply expires, the
 *    next account that signs in on the phone takes the token over (the API re-binds it to them).
 * On the web nothing happens: web users get the in-app (SignalR) notifications.
 * Push is a convenience: every failure here is silent and never blocks sign-in or sign-out.
 */
@Injectable({ providedIn: 'root' })
export class PushRegistrationService {
  private readonly api = inject(BackendApiService);
  private readonly auth = inject(AuthService);
  private readonly native = inject(PushNativeGateway);
  private readonly router = inject(Router);

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
        void this.register();
      }
    });
  }

  /** Call before ending the session; completes even when the server or the plugin fails. */
  revoke(): Observable<void> {
    return defer(() => {
      const token = this.currentToken;
      if (!token) {
        return of(void 0);
      }

      this.currentToken = null;
      return this.api.post<void>('/devices/push-token/revoke', { token }).pipe(
        switchMap(() => from(this.native.deleteToken().catch(() => undefined))),
        switchMap(() => of(void 0)),
        catchError(() => of(void 0))
      );
    });
  }

  private async register(): Promise<void> {
    const platform = this.native.platform();
    if (!platform) {
      return;
    }

    try {
      if (!(await this.native.requestPermission())) {
        return;
      }

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
    await this.native.onNotificationTapped(() => {
      void this.router.navigateByUrl('/notifications');
    });
  }

  private async send(token: string, platform: 'android' | 'ios'): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.api.post<void>('/devices/push-token', { token, platform }).subscribe({
        next: () => {
          this.currentToken = token;
          resolve();
        },
        error: reject
      });
    });
  }
}
