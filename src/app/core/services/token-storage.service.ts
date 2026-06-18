import { Injectable } from '@angular/core';

export interface AuthTokenResponse {
  accessToken?: string | null;
  AccessToken?: string | null;
  token?: string | null;
  Token?: string | null;
  refreshToken?: string | null;
  RefreshToken?: string | null;
}

@Injectable({ providedIn: 'root' })
export class TokenStorageService {
  private accessToken: string | null = null;
  private readonly refreshTokenKey = 'wohnungsapp_refresh';

  storeTokens(response: AuthTokenResponse): void {
    const accessToken = response?.accessToken ?? response?.AccessToken ?? response?.token ?? response?.Token ?? null;
    const refreshToken = response?.refreshToken ?? response?.RefreshToken ?? null;

    if (accessToken) {
      this.accessToken = accessToken;
    }

    if (refreshToken) {
      sessionStorage.setItem(this.refreshTokenKey, refreshToken);
    }
  }

  setAccessToken(token: string | null): void {
    this.accessToken = token;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  getRefreshToken(): string | null {
    return sessionStorage.getItem(this.refreshTokenKey);
  }

  clear(): void {
    this.accessToken = null;
    sessionStorage.removeItem(this.refreshTokenKey);

    // Remove legacy unsafe keys that may have been written by older code.
    for (const key of ['accessToken', 'token', 'refreshToken', 'loggedUser', 'user']) {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    }
  }
}