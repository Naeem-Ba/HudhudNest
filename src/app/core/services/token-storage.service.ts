import { Injectable } from '@angular/core';

import { writeSessionHint } from '../auth/session-hint';
import { safeRemoveItem } from './safe-storage';

export interface AuthTokenResponse {
  accessToken?: string | null;
  AccessToken?: string | null;
  token?: string | null;
  Token?: string | null;
  expiresIn?: number | null;
  ExpiresIn?: number | null;
}

/**
 * RELEASE-BLOCKERS-AR.md B-13: the refresh token is no longer handled here at all — it
 * travels only in an HttpOnly `refresh_token` cookie the browser manages invisibly to
 * JavaScript (see the backend's RefreshTokenCookie). Before this fix it was persisted to
 * sessionStorage, readable by any script that ever ran on the page — including an XSS
 * payload, which is exactly what B-13 flagged.
 *
 * Only the access token is kept here, in memory only, exactly as before. It does not survive
 * a page reload by design; app.config.ts's restoreSession() mints a fresh one from the
 * ambient cookie on every boot instead of reading anything out of storage.
 */
@Injectable({ providedIn: 'root' })
export class TokenStorageService {
  private accessToken: string | null = null;

  storeTokens(response: AuthTokenResponse): void {
    const accessToken =
      response?.accessToken ?? response?.AccessToken ??
      response?.token ?? response?.Token ?? null;

    if (accessToken) {
      this.accessToken = accessToken;
      // Every sign-in path stores its token here, so this is the one place that knows a session exists.
      writeSessionHint('yes');
    }
  }

  setAccessToken(token: string | null): void {
    this.accessToken = token;
    if (token) {
      writeSessionHint('yes');
    }
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  clear(): void {
    this.accessToken = null;

    // Defensive cleanup only: nothing writes these keys any more, but a browser that still
    // holds a value from before this migration must not keep offering it up indefinitely.
    for (const key of [
      'accessToken', 'token', 'refreshToken',
      'wohnungsapp_refresh', 'wohnungsapp_remember',
      'loggedUser', 'user'
    ]) {
      safeRemoveItem(key, 'local');
      safeRemoveItem(key, 'session');
    }
  }
}
