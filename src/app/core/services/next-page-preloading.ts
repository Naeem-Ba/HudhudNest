import { Injectable, inject } from '@angular/core';
import { PreloadingStrategy, Route, Router } from '@angular/router';
import { Observable, catchError, of, switchMap, timer } from 'rxjs';

/** Time left to the page just opened (its own requests and images) before a likely next page is fetched. */
export const NEXT_PAGE_PRELOAD_DELAY_MS = 2000;

interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
}

/** False on a data-saver connection or a 2G one: there the code is fetched only when the page is opened. */
export function connectionAllowsPrefetch(connection: NetworkInformationLike | undefined | null): boolean {
  if (!connection) {
    return true;
  }
  return !connection.saveData && !/(^|-)2g$/.test(connection.effectiveType ?? '');
}

/**
 * Fetches the code of the page a visitor most likely opens next, while they look at the current one.
 *
 * UI performance audit 2026-11-17: opening a listing from the list took ~0.9 s on a mid-range phone (CPU x4,
 * 170 ms latency), about half of it two round trips for the detail page's code (its chunk, then the 17 chunks it
 * imports). A route opts in with `data: { prefetchFrom: ['/properties'] }`: its code is fetched only while one of
 * those pages is open, after a pause, and never on a data-saver or 2G connection, so a visitor who never goes
 * there downloads nothing extra. Every other lazy page still loads on demand, as before.
 */
@Injectable({ providedIn: 'root' })
export class NextPagePreloading implements PreloadingStrategy {
  private readonly router = inject(Router);

  preload(route: Route, load: () => Observable<unknown>): Observable<unknown> {
    const from = route.data?.['prefetchFrom'] as readonly string[] | undefined;
    if (!from?.length || !this.isOn(from) || !connectionAllowsPrefetch(currentConnection())) {
      return of(null);
    }
    return timer(NEXT_PAGE_PRELOAD_DELAY_MS).pipe(
      // The visitor may have moved on during the pause; the next navigation decides again.
      switchMap(() => (this.isOn(from) ? load() : of(null))),
      // Only an early fetch failed: opening the page loads it again and reports its own error there.
      catchError(() => of(null))
    );
  }

  private isOn(paths: readonly string[]): boolean {
    const current = this.router.url.split(/[?#]/)[0] || '/';
    return paths.includes(current);
  }
}

function currentConnection(): NetworkInformationLike | undefined {
  return typeof navigator === 'undefined'
    ? undefined
    : (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
}
