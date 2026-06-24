import { Injectable } from '@angular/core';

export interface AuthTokenResponse {
  accessToken?: string | null;
  AccessToken?: string | null;
  token?: string | null;
  Token?: string | null;
  refreshToken?: string | null;
  RefreshToken?: string | null;
  expiresIn?: number | null;
  ExpiresIn?: number | null;
}

@Injectable({ providedIn: 'root' })
export class TokenStorageService {
  private accessToken: string | null = null;
  private readonly REFRESH_KEY = 'wohnungsapp_refresh';
  private readonly REMEMBER_KEY = 'wohnungsapp_remember';

  storeTokens(response: AuthTokenResponse, remember = false): void {
    const accessToken =
      response?.accessToken ?? response?.AccessToken ??
      response?.token ?? response?.Token ?? null;

    const refreshToken =
      response?.refreshToken ?? response?.RefreshToken ?? null;

    if (accessToken) {
      this.accessToken = accessToken;
    }

    if (refreshToken) {
      if (remember) {
        localStorage.setItem(this.REFRESH_KEY, refreshToken);
        localStorage.setItem(this.REMEMBER_KEY, 'true');
        sessionStorage.removeItem(this.REFRESH_KEY);
      } else {
        sessionStorage.setItem(this.REFRESH_KEY, refreshToken);
        localStorage.removeItem(this.REFRESH_KEY);
        localStorage.removeItem(this.REMEMBER_KEY);
      }
    }
  }

  setAccessToken(token: string | null): void {
    this.accessToken = token;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  getRefreshToken(): string | null {
    return sessionStorage.getItem(this.REFRESH_KEY) ?? localStorage.getItem(this.REFRESH_KEY);
  }

  isRemembered(): boolean {
    return localStorage.getItem(this.REMEMBER_KEY) === 'true';
  }

  clear(): void {
    this.accessToken = null;
    sessionStorage.removeItem(this.REFRESH_KEY);
    localStorage.removeItem(this.REFRESH_KEY);
    localStorage.removeItem(this.REMEMBER_KEY);

    for (const key of ['accessToken', 'token', 'refreshToken', 'loggedUser', 'user']) {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    }
  }
}
