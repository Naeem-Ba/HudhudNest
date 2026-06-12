import { Injectable } from '@angular/core';
import { AuthTokenResponse } from '../models/auth.model';

@Injectable({ providedIn: 'root' })
export class TokenStorageService {
  private readonly accessTokenKey = 'accessToken';
  private readonly legacyTokenKey = 'token';
  private readonly refreshTokenKey = 'refreshToken';

  storeTokens(response: AuthTokenResponse): void {
    if (response?.accessToken) {
      sessionStorage.setItem(this.accessTokenKey, response.accessToken);

      // Compatibility مع الكود القديم الذي قد يبحث عن token
      sessionStorage.setItem(this.legacyTokenKey, response.accessToken);
    }

    if (response?.refreshToken) {
      sessionStorage.setItem(this.refreshTokenKey, response.refreshToken);
    }
  }

  getAccessToken(): string | null {
    return (
      sessionStorage.getItem(this.accessTokenKey) ||
      sessionStorage.getItem(this.legacyTokenKey) ||
      localStorage.getItem(this.accessTokenKey) ||
      localStorage.getItem(this.legacyTokenKey)
    );
  }

  getRefreshToken(): string | null {
    return (
      sessionStorage.getItem(this.refreshTokenKey) ||
      localStorage.getItem(this.refreshTokenKey)
    );
  }

  clear(): void {
    sessionStorage.removeItem(this.accessTokenKey);
    sessionStorage.removeItem(this.legacyTokenKey);
    sessionStorage.removeItem(this.refreshTokenKey);

    localStorage.removeItem(this.accessTokenKey);
    localStorage.removeItem(this.legacyTokenKey);
    localStorage.removeItem(this.refreshTokenKey);
  }
}
