// =============================================================
// src/app/core/services/interest-areas.service.ts
//
// Which governorates the property list should favour for this person, as the single
// `interestGovernorateIds` list parameter ("3,7", at most three ids):
//   1. the home area chosen in Settings (account profile),
//   2. the last governorates searched (RecentAreasService, this device only),
//   3. the governorates of the saved searches (signed in).
// They are only a preference sent with the request: the server ranks featured ads of these areas
// first and keeps no record of them. The value is sorted so that equal sets share one cache entry.
// =============================================================

import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest, distinctUntilChanged, map, of, switchMap, catchError } from 'rxjs';

import { ProfileService } from '../api/profile.service';
import { SavedSearchApiService } from '../api/saved-search-api.service';
import { AuthService } from '../auth/auth.service';
import { RecentAreasService } from './recent-areas.service';

export const MAX_INTEREST_AREAS = 3;

/** Home area first, then recent searches (newest first), then saved searches; distinct, positive, at most three. */
export function buildInterestAreaIds(
  home: number | null | undefined,
  recent: readonly number[],
  saved: readonly number[]
): number[] {
  const ids: number[] = [];
  for (const candidate of [home, ...recent, ...saved]) {
    if (Number.isInteger(candidate) && (candidate as number) > 0 && !ids.includes(candidate as number)) {
      ids.push(candidate as number);
    }
    if (ids.length === MAX_INTEREST_AREAS) {
      break;
    }
  }

  return ids;
}

/** The query value: ascending ids joined by commas, or undefined when there is nothing to favour. */
export function toInterestParam(ids: readonly number[]): string | undefined {
  return ids.length ? [...ids].sort((a, b) => a - b).join(',') : undefined;
}

@Injectable({ providedIn: 'root' })
export class InterestAreasService {
  private readonly profile = inject(ProfileService);
  private readonly recent = inject(RecentAreasService);
  private readonly savedSearches = inject(SavedSearchApiService);
  private readonly auth = inject(AuthService);

  private readonly saved$ = new BehaviorSubject<number[]>([]);
  private latestParam: string | undefined;

  /** The current parameter value, distinct until it changes (the profile and saved searches arrive after the page). */
  readonly param$: Observable<string | undefined>;

  constructor() {
    this.auth.currentUser$
      .pipe(
        map(user => (user?.id ? String(user.id) : null)),
        distinctUntilChanged(),
        switchMap(userId =>
          userId
            ? this.savedSearches.getMine().pipe(
                map(items => items.map(item => item.governorateId).filter((id): id is number => typeof id === 'number' && id > 0)),
                catchError(() => of([] as number[]))
              )
            : of([] as number[])
        )
      )
      .subscribe(ids => this.saved$.next(ids));

    this.param$ = combineLatest([this.profile.profile$, this.recent.areas$, this.saved$]).pipe(
      map(([profile, recent, saved]) => toInterestParam(buildInterestAreaIds(profile?.HomeGovernorateId, recent, saved))),
      distinctUntilChanged()
    );
    this.param$.subscribe(param => (this.latestParam = param));
  }

  /** The latest value, for requests built outside a stream. */
  current(): string | undefined {
    return this.latestParam;
  }
}
