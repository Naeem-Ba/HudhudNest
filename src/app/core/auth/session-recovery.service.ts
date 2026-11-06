import { DOCUMENT } from '@angular/common';
import { HttpBackend, HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { App } from '@capacitor/app';
import { firstValueFrom, timeout } from 'rxjs';

import { environment } from '../../../environments/environment';
import { isCsrfFailure } from '../interceptors/refresh-auth.interceptor';
import { normalizeAuthTokenResponse } from '../models/auth.model';
import { CsrfTokenService } from '../services/csrf-token.service';
import { AuthService } from './auth.service';
import { resolveAuthApiBaseUrl } from './auth-api-base-url';
import { readSessionHint, writeSessionHint } from './session-hint';

const RECOVERY_TIMEOUT_MS = 15_000;

/**
 * Gets the person back in after a *connection* problem, so a bad signal never looks like a sign-out.
 *
 * The start-up refresh asks the server once (twice on a dropped connection). If the phone had no signal
 * at that moment the app starts as a guest even though the refresh cookie is still good; before this,
 * the person stayed a guest until they reloaded by hand. Now the same refresh is tried again when the
 * connection returns, when the tab becomes visible again, and when the native app comes back to the
 * foreground.
 *
 * It only ever *restores*: it never signs anybody out. Only a clear "no session" answer from the server
 * (401 / 400) ends the attempt and records "no session" for the next visit; a dropped connection, a
 * timeout or a 5xx leaves everything as it was and the next trigger tries again.
 */
@Injectable({ providedIn: 'root' })
export class SessionRecoveryService {
  private readonly document = inject(DOCUMENT);
  private readonly httpBackend = inject(HttpBackend);
  private readonly auth = inject(AuthService);
  private readonly csrf = inject(CsrfTokenService);

  private started = false;
  private inFlight = false;

  /** Idempotent: wires the triggers once for the life of the app. */
  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;

    const win = this.document.defaultView;
    win?.addEventListener('online', () => void this.recover());
    this.document.addEventListener('visibilitychange', () => {
      if (this.document.visibilityState === 'visible') {
        void this.recover();
      }
    });
    void App.addListener('resume', () => void this.recover()).catch(() => undefined);
  }

  /** True when there is something to restore: signed out here, but a session was open before. */
  private needsRecovery(): boolean {
    return !this.auth.currentUserSnapshot && readSessionHint() === 'yes';
  }

  async recover(): Promise<boolean> {
    if (this.inFlight || !this.needsRecovery()) {
      return false;
    }

    this.inFlight = true;
    this.auth.beginSessionRefresh();

    try {
      if (!this.csrf.getToken()) {
        await firstValueFrom(this.csrf.fetchToken());
      }

      const http = new HttpClient(this.httpBackend);
      const attempt = () =>
        firstValueFrom(
          http
            .post<unknown>(`${resolveAuthApiBaseUrl(environment)}/auth/refresh`, {}, {
              withCredentials: true,
              headers: { 'X-XSRF-TOKEN': this.csrf.getToken() ?? '' }
            })
            .pipe(timeout(RECOVERY_TIMEOUT_MS))
        );

      let result: unknown;
      try {
        result = await attempt();
      } catch (error) {
        if (!isCsrfFailure(error)) {
          throw error;
        }
        await firstValueFrom(this.csrf.fetchToken());
        result = await attempt();
      }

      const tokens = normalizeAuthTokenResponse(result);
      if (!tokens.accessToken) {
        return false;
      }

      this.auth.login(tokens);
      return true;
    } catch (error) {
      // Only the server saying "there is no session" counts; anything else is the connection.
      if (error instanceof HttpErrorResponse && (error.status === 401 || error.status === 400)) {
        writeSessionHint('no');
      }
      return false;
    } finally {
      this.auth.endSessionRefresh();
      this.inFlight = false;
    }
  }
}
