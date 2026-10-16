import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { HttpContext, HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, catchError, distinctUntilChanged, map, of, tap, throwError } from 'rxjs';
import { BackendApiService } from '../api/backend-api.service';
import { AuthService } from '../auth/auth.service';
import { SKIP_ERROR_TOAST } from '../interceptors/api-error.interceptor';
import { ApiPagedResult, unwrapItems } from '../models/api.model';
import { Favorite } from '../models/favorite.model';

export type FavoritesLoadState = 'idle' | 'loading' | 'ready' | 'failed';

/**
 * The single source of truth for "is this property one of my favorites?".
 *
 * Every heart in the app (list card, detail page, favorites page) reads `favoriteIds` and
 * changes it through add/remove/toggleFavorite, so they can never disagree. Before this the
 * detail page's heart had no state at all (always empty, and clicking it re-POSTed a property
 * that was already a favorite → 409 → an error toast, with no way to remove it from there).
 *
 * The set belongs to the signed-in user: it is cleared whenever the user changes (logout,
 * account switch) and loaded again as soon as someone is signed in.
 */
@Injectable({ providedIn: 'root' })
export class FavoritesApiService {
  private readonly api = inject(BackendApiService);
  private readonly auth = inject(AuthService);

  readonly favoriteIds = signal<ReadonlySet<string>>(new Set());
  readonly loadState = signal<FavoritesLoadState>('idle');

  constructor() {
    this.auth.currentUser$
      .pipe(
        map(user => user?.id || user?.Id || null),
        distinctUntilChanged(),
        takeUntilDestroyed(inject(DestroyRef))
      )
      .subscribe(userId => {
        this.reset();
        if (userId) {
          this.loadFavoriteIds();
        }
      });
  }

  /** GET /favorites — also refreshes the shared id set from what the server returned. */
  getFavorites(): Observable<Favorite[]> {
    return this.api.get<Favorite[] | ApiPagedResult<Favorite>>('/favorites').pipe(
      map(response => unwrapItems(response)),
      tap(favorites => this.setIds(favorites))
    );
  }

  /**
   * POST /favorites/{id}. "Already a favorite" (409) is the state the caller wanted, so it counts
   * as success and raises no error toast.
   */
  add(propertyId: string): Observable<unknown> {
    return this.api.post(`/favorites/${propertyId}`, undefined, { context: this.expectedFailureContext() }).pipe(
      catchError(error => this.isStatus(error, 409) ? of(null) : throwError(() => error)),
      tap(() => this.updateIds(ids => ids.add(propertyId)))
    );
  }

  /** DELETE /favorites/{id}. "Not a favorite" (404) is likewise the wanted end state. */
  remove(propertyId: string): Observable<unknown> {
    return this.api.delete(`/favorites/${propertyId}`, undefined, { context: this.expectedFailureContext() }).pipe(
      catchError(error => this.isStatus(error, 404) ? of(null) : throwError(() => error)),
      tap(() => this.updateIds(ids => ids.delete(propertyId)))
    );
  }

  /** Loads the user's favorite ids once per signed-in user; a failed attempt may be retried. */
  loadFavoriteIds(): void {
    if (this.loadState() === 'loading' || this.loadState() === 'ready') {
      return;
    }

    this.loadState.set('loading');
    this.getFavorites().subscribe({
      next: () => this.loadState.set('ready'),
      error: () => this.loadState.set('failed')
    });
  }

  isFavorite(propertyId: string): boolean {
    return this.favoriteIds().has(propertyId);
  }

  /** Adds or removes depending on the current state; emits the new favorited state. */
  toggleFavorite(propertyId: string): Observable<boolean> {
    const makeFavorite = !this.isFavorite(propertyId);
    const request$ = makeFavorite ? this.add(propertyId) : this.remove(propertyId);
    return request$.pipe(map(() => makeFavorite));
  }

  private reset(): void {
    this.favoriteIds.set(new Set());
    this.loadState.set('idle');
  }

  private setIds(favorites: Favorite[]): void {
    this.favoriteIds.set(new Set(favorites.map(favorite => favorite.propertyId).filter((id): id is string => !!id)));
  }

  private updateIds(change: (ids: Set<string>) => void): void {
    const next = new Set(this.favoriteIds());
    change(next);
    this.favoriteIds.set(next);
  }

  private expectedFailureContext(): HttpContext {
    return new HttpContext().set(SKIP_ERROR_TOAST, true);
  }

  private isStatus(error: unknown, status: number): boolean {
    return error instanceof HttpErrorResponse && error.status === status;
  }
}
