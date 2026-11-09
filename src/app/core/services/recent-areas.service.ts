// =============================================================
// src/app/core/services/recent-areas.service.ts
//
// The last governorates this person searched in (at most three, newest first), kept ONLY on this
// device in localStorage. They are sent with the property-list request (interestGovernorateIds) so the
// server can put featured ads of those areas first; the server stores no search history for this.
// Cleared on sign-out (AuthService.clearSession). When storage is unavailable (private window, blocked
// site data) they live for the page session only.
// =============================================================

import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export const RECENT_AREAS_STORAGE_KEY = 'hn.recentAreas';
export const MAX_RECENT_AREAS = 3;

@Injectable({ providedIn: 'root' })
export class RecentAreasService {
  private readonly subject = new BehaviorSubject<number[]>(RecentAreasService.read());

  /** The recent governorate ids, newest first. */
  readonly areas$: Observable<number[]> = this.subject.asObservable();

  list(): number[] {
    return this.subject.value;
  }

  /** Remembers a searched governorate: moved to the front, no duplicates, at most three kept. */
  record(governorateId: number | null | undefined): void {
    if (!Number.isInteger(governorateId) || (governorateId as number) <= 0) {
      return;
    }

    const id = governorateId as number;
    if (this.subject.value[0] === id) {
      return;
    }

    const next = [id, ...this.subject.value.filter(existing => existing !== id)].slice(0, MAX_RECENT_AREAS);
    this.subject.next(next);
    RecentAreasService.write(next);
  }

  clear(): void {
    if (this.subject.value.length === 0) {
      RecentAreasService.remove();
      return;
    }

    this.subject.next([]);
    RecentAreasService.remove();
  }

  private static read(): number[] {
    try {
      const raw = globalThis.localStorage?.getItem(RECENT_AREAS_STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .filter((value): value is number => Number.isInteger(value) && value > 0)
        .filter((value, index, all) => all.indexOf(value) === index)
        .slice(0, MAX_RECENT_AREAS);
    } catch {
      return [];
    }
  }

  private static write(ids: number[]): void {
    try {
      globalThis.localStorage?.setItem(RECENT_AREAS_STORAGE_KEY, JSON.stringify(ids));
    } catch {
      /* storage unavailable: kept for this page session only */
    }
  }

  private static remove(): void {
    try {
      globalThis.localStorage?.removeItem(RECENT_AREAS_STORAGE_KEY);
    } catch {
      /* nothing to clean up */
    }
  }
}
