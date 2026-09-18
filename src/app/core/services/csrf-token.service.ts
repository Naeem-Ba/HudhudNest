import { HttpBackend, HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, map, Observable, of } from 'rxjs';

import { environment } from '../../../environments/environment';
import { resolveAuthApiBaseUrl } from '../auth/auth-api-base-url';

interface CsrfTokenResponse {
  csrfToken?: string | null;
}

/**
 * RELEASE-BLOCKERS-AR.md B-20: the backend's CookieCsrfProtectionMiddleware requires an
 * X-XSRF-TOKEN header on every unsafe request that carries the refresh_token cookie
 * (POST /auth/refresh, POST /auth/logout), but nothing in this app ever fetched or sent
 * that token — every forced-refresh silently 403'd and logged the user out.
 *
 * Angular's built-in withXsrfConfiguration (reading XSRF-TOKEN via document.cookie) cannot
 * fix this: in deployed environments the SPA and the API sit on hostnames that share no
 * registrable domain (e.g. realestateworld.world vs. onrender.com), so document.cookie on
 * the SPA's origin can never see a cookie set by the API's origin, no matter what Domain
 * attribute is or isn't set on it. Only local dev (both on `localhost`, different ports)
 * would work that way — which is exactly why this bug was never caught locally.
 *
 * Instead, GET /api/security/csrf-token also returns the same request token in its JSON
 * body (see CsrfController.cs). This service fetches it once, keeps it in memory, and
 * hands it out to CsrfInterceptor (the normal interceptor chain) and to the two call sites
 * that deliberately bypass that chain (requestNewAccessToken in refresh-auth.interceptor.ts,
 * restoreSession in app.config.ts).
 *
 * Production incident (2026-09): the JSON-body workaround above solved reading the token, but
 * the underlying cookies this call sets (the antiforgery-internal cookie and the visible
 * XSRF-TOKEN cookie) are still third-party cookies on the same cross-site call this comment
 * already describes — Chrome/Edge needed the Partitioned attribute (CsrfExtensions.cs,
 * CsrfController.cs), and Safari has no equivalent exception at all. See
 * auth-api-base-url.ts: this call now goes through the same same-origin-proxied path as
 * /auth/refresh on the deployed web app, so the browser never treats these cookies as
 * cross-site in the first place.
 */
@Injectable({ providedIn: 'root' })
export class CsrfTokenService {
  private token: string | null = null;

  constructor(private readonly httpBackend: HttpBackend) {}

  /**
   * Fetches a fresh token and caches it. Built on HttpBackend directly (bypassing every
   * interceptor) so this never accidentally depends on CsrfInterceptor already having a
   * token to attach — this call is exactly how the app first obtains one.
   */
  fetchToken(): Observable<void> {
    const directHttp = new HttpClient(this.httpBackend);

    return directHttp
      .get<CsrfTokenResponse>(`${resolveAuthApiBaseUrl(environment)}/security/csrf-token`, { withCredentials: true })
      .pipe(
        map(response => {
          this.token = response?.csrfToken ?? null;
        }),
        catchError(() => {
          // A token fetch failing (offline, anonymous visitor with nothing to protect yet,
          // etc.) must not itself block the caller — the subsequent request simply goes out
          // without the header and is rejected on its own terms if CSRF actually applies.
          this.token = null;
          return of(void 0);
        })
      );
  }

  getToken(): string | null {
    return this.token;
  }

  /** Called on logout so a stale token from a previous session is never reused. */
  clear(): void {
    this.token = null;
  }
}
