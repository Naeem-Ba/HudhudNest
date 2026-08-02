import { Injectable, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { BackendApiService } from '../api/backend-api.service';
import { ApiPagedResult, unwrapItems } from '../models/api.model';
import { Favorite } from '../models/favorite.model';

@Injectable({ providedIn: 'root' })
export class FavoritesApiService {
  constructor(private readonly api: BackendApiService) {}

  /**
   * Client-side cache of the current user's favorited property ids.
   * Lets any page (list, detail) render the correct heart state and
   * toggle it without every card re-fetching /favorites individually.
   */
  readonly favoriteIds = signal<Set<string>>(new Set());
  private idsLoaded = false;

  getFavorites(): Observable<Favorite[]> {
    return this.api.get<Favorite[] | ApiPagedResult<Favorite>>('/favorites').pipe(map(response => unwrapItems(response)));
  }

  add(propertyId: string): Observable<unknown> {
    return this.api.post(`/favorites/${propertyId}`);
  }

  remove(propertyId: string): Observable<unknown> {
    return this.api.delete(`/favorites/${propertyId}`);
  }

  /** Loads favorite ids once (e.g. on app/page init for a logged-in user). */
  loadFavoriteIds(): void {
    if (this.idsLoaded) {
      return;
    }

    this.idsLoaded = true;

    this.getFavorites().subscribe({
      next: favorites => {
        const ids = favorites
          .map(favorite => favorite.propertyId)
          .filter((id): id is string => Boolean(id));
        this.favoriteIds.set(new Set(ids));
      },
      error: () => {
        // Not logged in or request failed — leave the cache empty and allow retry.
        this.idsLoaded = false;
      }
    });
  }

  isFavorite(propertyId: string): boolean {
    return this.favoriteIds().has(propertyId);
  }

  /**
   * Adds or removes the property from favorites depending on current state,
   * updates the local cache optimistically-on-success, and returns the new
   * favorited state so the caller can show a toast/UI update.
   */
  toggleFavorite(propertyId: string): Observable<boolean> {
    const wasFavorite = this.isFavorite(propertyId);
    const request$ = wasFavorite ? this.remove(propertyId) : this.add(propertyId);

    return request$.pipe(
      tap(() => {
        this.favoriteIds.update(current => {
          const next = new Set(current);
          if (wasFavorite) {
            next.delete(propertyId);
          } else {
            next.add(propertyId);
          }
          return next;
        });
      }),
      map(() => !wasFavorite)
    );
  }
}
