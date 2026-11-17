import { HttpEventType, HttpInterceptorFn } from '@angular/common/http';
import { map } from 'rxjs';

import { isBackendApiRequest } from './refresh-auth.interceptor';

/**
 * The API stores every instant in UTC, but with Npgsql's legacy timestamp behaviour it
 * serialises them WITHOUT a zone designator ("2026-11-17T07:28:23.044876"). Browsers, and
 * Angular's DatePipe, read a zone-less ISO string as LOCAL time, so every time on screen was
 * shifted by the viewer's UTC offset (3 hours in Damascus). Every value the app sends is
 * already UTC (`toISOString()`), so the server's zone-less values are UTC too.
 *
 * This interceptor appends "Z" to such values in API responses. It deliberately leaves alone:
 * - values that already carry a zone ("Z" or "+03:00"),
 * - date-only values ("2026-12-01"),
 * - values at exactly midnight with no fraction ("2026-12-01T00:00:00"): these are calendar
 *   dates stored as DateTime (availableFrom, rental start/end), and making them UTC would move
 *   them to the previous day for viewers west of UTC.
 */
const ZONELESS_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,7})?)?$/;
const MIDNIGHT_DATE = /T00:00(:00(\.0+)?)?$/;

export function normalizeUtcInstant(value: string): string {
  return ZONELESS_INSTANT.test(value) && !MIDNIGHT_DATE.test(value) ? `${value}Z` : value;
}

export function normalizeUtcInstants<T>(body: T): T {
  if (typeof body === 'string') return normalizeUtcInstant(body) as T;
  if (Array.isArray(body)) {
    let changed = false;
    const out = body.map((item) => {
      const next = normalizeUtcInstants(item);
      if (next !== item) changed = true;
      return next;
    });
    return (changed ? out : body) as T;
  }
  if (body !== null && typeof body === 'object' && Object.getPrototypeOf(body) === Object.prototype) {
    let out: Record<string, unknown> | null = null;
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      const next = normalizeUtcInstants(value);
      if (next !== value) {
        out ??= { ...(body as Record<string, unknown>) };
        out[key] = next;
      }
    }
    return (out ?? body) as T;
  }
  return body;
}

export const UtcDatesInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isBackendApiRequest(req.url) || (req.responseType ?? 'json') !== 'json') return next(req);
  return next(req).pipe(
    map((event) =>
      event.type === HttpEventType.Response && event.body
        ? event.clone({ body: normalizeUtcInstants(event.body) })
        : event,
    ),
  );
};
