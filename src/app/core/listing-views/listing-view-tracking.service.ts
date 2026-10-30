// =============================================================
// src/app/core/listing-views/listing-view-tracking.service.ts
//
// Reports "this listing's detail page is on screen" to the server, once per page opening:
//
//  - called by the detail pages only, after the listing was loaded and shown. A card in a list, a
//    prefetch, a map marker or a failed load never reaches it, so none of them counts;
//  - de-duplicated here for REPEAT_WINDOW_MS per listing, so Angular re-running a lifecycle hook,
//    a retry or back/forward does not even make a request (the server dedupes with its own
//    cooldown regardless; this is only to save the round trip);
//  - waits until the page is actually visible: a tab opened in the background is not a view yet;
//  - never throws and never blocks: any failure (offline, 404, 429, timeout) yields null.
// =============================================================

import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, defer, filter, first, map, of, switchMap, fromEvent, startWith } from 'rxjs';

import { ListingViewsApiService } from '../api/listing-views-api.service';
import { ListingViewKind, ListingViewResult } from '../models/listing-views.model';

/** Opening the same listing again inside this window sends nothing from this browser tab. */
export const REPEAT_WINDOW_MS = 30 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class ListingViewTrackingService {
  private readonly api = inject(ListingViewsApiService);
  private readonly document = inject(DOCUMENT);

  private readonly lastSent = new Map<string, number>();

  /**
   * Emits the server's answer once (or null when nothing was sent or the call failed) and completes.
   * Subscribe to it from the detail page; ignoring the result is fine.
   */
  record(kind: ListingViewKind, listingId: string): Observable<ListingViewResult | null> {
    return defer(() => {
      const key = `${kind}:${listingId}`;
      const now = Date.now();
      const last = this.lastSent.get(key);

      if (!listingId || (last !== undefined && now - last < REPEAT_WINDOW_MS)) {
        return of(null);
      }

      // Claimed before the (possibly delayed) request: two overlapping calls send one request.
      this.lastSent.set(key, now);

      return this.whenVisible().pipe(
        switchMap(() => this.api.record(kind, listingId)),
        map((result): ListingViewResult | null => result ?? null),
        catchError(() => {
          // Allow another try on the next opening: nothing reached the server.
          this.lastSent.delete(key);
          return of(null);
        })
      );
    });
  }

  private whenVisible(): Observable<true> {
    const doc = this.document;
    if (!doc || doc.visibilityState !== 'hidden') {
      return of(true);
    }

    return fromEvent(doc, 'visibilitychange').pipe(
      startWith(null),
      filter(() => doc.visibilityState !== 'hidden'),
      first(),
      map((): true => true)
    );
  }
}
