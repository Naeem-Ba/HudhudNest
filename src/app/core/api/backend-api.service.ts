import { Injectable } from '@angular/core';
import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { resolveAuthApiBaseUrl } from '../auth/auth-api-base-url';

export type QueryScalar = string | number | boolean;
export type QueryValue = QueryScalar | readonly QueryScalar[] | null | undefined;

/** Per-request HttpContext, e.g. SKIP_ERROR_TOAST for a failure the caller treats as normal. */
export interface RequestOptions {
  context?: HttpContext;
  /** Extra request headers (e.g. the anonymous visitor id of the view counter). */
  headers?: Record<string, string>;
}

@Injectable({ providedIn: 'root' })
export class BackendApiService {
  private readonly baseUrl = this.normalizeBaseUrl(environment.apiBaseUrl || environment.apiUrl);

  // See auth-api-base-url.ts's doc comment: every /auth/* call (AuthApiService,
  // PhoneAuthApiService — login/refresh/logout/register/social/phone OTP, all of which set or
  // depend on the refresh_token cookie) must be same-origin on the deployed web app, or Safari
  // drops the cookie outright. Scoped to just this prefix, not this.baseUrl itself, because
  // every other endpoint (property/photo uploads especially) has no reason to be proxied
  // through Netlify and no cookie-persistence problem to fix.
  private readonly authBaseUrl = this.normalizeBaseUrl(resolveAuthApiBaseUrl(environment));

  constructor(private readonly http: HttpClient) {}

  // withCredentials: true on every call (RELEASE-BLOCKERS-AR.md B-13) — the refresh-token
  // cookie is cross-origin (the Angular app and this API are different origins/ports even in
  // local development), and a browser never attaches or stores a cross-origin cookie without
  // this flag on the request, no matter what the server's Set-Cookie says.
  get<T>(path: string, query?: Record<string, QueryValue>, options?: RequestOptions): Observable<T> {
    return this.http.get<T>(this.url(path), { params: this.params(query), withCredentials: true, context: options?.context });
  }

  post<T>(path: string, body?: unknown, options?: RequestOptions): Observable<T> {
    return this.http.post<T>(this.url(path), body ?? {}, { withCredentials: true, context: options?.context, headers: options?.headers });
  }

  put<T>(path: string, body?: unknown): Observable<T> {
    return this.http.put<T>(this.url(path), body ?? {}, { withCredentials: true });
  }

  patch<T>(path: string, body?: unknown): Observable<T> {
    return this.http.patch<T>(this.url(path), body ?? {}, { withCredentials: true });
  }

  // `body` is optional because most DELETE endpoints in this app take none — Angular's
  // HttpClient supports a DELETE body via the `body` request option (used by e.g.
  // ShortStayBookingsController.Cancel, which accepts an optional cancellation note).
  delete<T>(path: string, body?: unknown, options?: RequestOptions): Observable<T> {
    return this.http.delete<T>(this.url(path), { body, withCredentials: true, context: options?.context });
  }

  upload<T>(path: string, formData: FormData): Observable<T> {
    return this.http.post<T>(this.url(path), formData, { withCredentials: true });
  }

  postFormData<T>(path: string, formData: FormData): Observable<T> {
    return this.upload<T>(path, formData);
  }

  private url(path: string): string {
    if (/^https?:\/\//i.test(path)) {
      return path;
    }

    const normalizedPath = path.startsWith('/') ? path : '/' + path;
    const base = normalizedPath.startsWith('/auth/') || normalizedPath === '/auth'
      ? this.authBaseUrl
      : this.baseUrl;

    return `${base}${normalizedPath}`;
  }

  private normalizeBaseUrl(value: string): string {
    const normalized = (value || '').trim().replace(/\/+$/, '');

    if (!normalized) {
      throw new Error('API base URL is missing. Configure API_URL or environment.apiBaseUrl.');
    }

    return /\/api$/i.test(normalized) ? normalized : `${normalized}/api`;
  }

  private params(query?: Record<string, QueryValue>): HttpParams {
    let params = new HttpParams();

    Object.entries(query ?? {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') {
        return;
      }

      if (Array.isArray(value)) {
        value
          .filter(item => item !== undefined && item !== null && String(item) !== '')
          .forEach(item => {
            params = params.append(key, String(item));
          });
        return;
      }

      params = params.set(key, String(value));
    });

    return params;
  }
}
