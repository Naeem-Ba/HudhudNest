import { HttpBackend, HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { firstValueFrom, timeout } from 'rxjs';

import { environment } from '../../../environments/environment';

/** A reply is only worth waiting for briefly: this blocks the very first paint of a first-time visitor. */
export const GEO_COUNTRY_TIMEOUT_MS = 1200;

/**
 * Asks the site's own edge function (netlify/edge-functions/geo-country.mjs, GET /geo) which country the
 * request came from. No browser location permission, no third-party service, and the reply carries only a
 * two-letter country code - never an IP address.
 *
 * Every failure (timeout, 404 from `ng serve`, HTML fallback page, feature switched off, malformed JSON)
 * resolves to `null`; callers treat that as "country unknown".
 */
@Injectable({ providedIn: 'root' })
export class GeoCountryService {
  // HttpBackend skips the interceptors on purpose: no auth/CSRF headers belong on this request, and a
  // failing interceptor must never be able to hold up the first render.
  private readonly http = new HttpClient(inject(HttpBackend));

  async fetchCountryCode(timeoutMs: number = GEO_COUNTRY_TIMEOUT_MS): Promise<string | null> {
    const url = this.endpoint();

    if (!url) {
      return null;
    }

    try {
      const body = await firstValueFrom(
        this.http.get<unknown>(url, { headers: { Accept: 'application/json' } }).pipe(timeout(timeoutMs))
      );

      return parseCountryCode(body);
    } catch {
      return null;
    }
  }

  private endpoint(): string | null {
    // The web app is served by the same Netlify site that hosts /geo. The Capacitor shell is not (its
    // origin is https://localhost or capacitor://localhost), so it must use the public site origin.
    if (!Capacitor.isNativePlatform()) {
      return '/geo';
    }

    const siteUrl = (environment.siteUrl ?? '').trim().replace(/\/+$/, '');
    return siteUrl ? `${siteUrl}/geo` : null;
  }
}

/** `{ "country": "DE" }` -> "DE"; anything else -> null. */
export function parseCountryCode(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }

  const country = (body as { country?: unknown }).country;
  return typeof country === 'string' && /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : null;
}
