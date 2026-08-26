import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type QueryScalar = string | number | boolean;
export type QueryValue = QueryScalar | readonly QueryScalar[] | null | undefined;

@Injectable({ providedIn: 'root' })
export class BackendApiService {
  private readonly baseUrl = this.normalizeBaseUrl(environment.apiBaseUrl || environment.apiUrl);

  constructor(private readonly http: HttpClient) {}

  // withCredentials: true on every call (RELEASE-BLOCKERS-AR.md B-13) — the refresh-token
  // cookie is cross-origin (the Angular app and this API are different origins/ports even in
  // local development), and a browser never attaches or stores a cross-origin cookie without
  // this flag on the request, no matter what the server's Set-Cookie says.
  get<T>(path: string, query?: Record<string, QueryValue>): Observable<T> {
    return this.http.get<T>(this.url(path), { params: this.params(query), withCredentials: true });
  }

  post<T>(path: string, body?: unknown): Observable<T> {
    return this.http.post<T>(this.url(path), body ?? {}, { withCredentials: true });
  }

  put<T>(path: string, body?: unknown): Observable<T> {
    return this.http.put<T>(this.url(path), body ?? {}, { withCredentials: true });
  }

  patch<T>(path: string, body?: unknown): Observable<T> {
    return this.http.patch<T>(this.url(path), body ?? {}, { withCredentials: true });
  }

  delete<T>(path: string): Observable<T> {
    return this.http.delete<T>(this.url(path), { withCredentials: true });
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

    return `${this.baseUrl}${path.startsWith('/') ? path : '/' + path}`;
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
