import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { ProfileService, UserProfile } from '../api/profile.service';
import { SavedSearchApiService } from '../api/saved-search-api.service';
import { AuthService } from '../auth/auth.service';
import { InterestAreasService, buildInterestAreaIds, toInterestParam } from './interest-areas.service';
import { RECENT_AREAS_STORAGE_KEY, RecentAreasService } from './recent-areas.service';

describe('buildInterestAreaIds / toInterestParam', () => {
  it('puts the home area first, then recent searches, then saved searches', () => {
    expect(buildInterestAreaIds(5, [2, 9], [4, 6])).toEqual([5, 2, 9]);
    expect(buildInterestAreaIds(null, [2], [4, 6, 8])).toEqual([2, 4, 6]);
  });

  it('never repeats an id and never exceeds three', () => {
    expect(buildInterestAreaIds(3, [3, 3, 1], [1, 2, 3, 4])).toEqual([3, 1, 2]);
  });

  it('skips ids that are not positive whole numbers', () => {
    expect(buildInterestAreaIds(0, [-1, 2.5], [])).toEqual([]);
    expect(buildInterestAreaIds(undefined, [], [])).toEqual([]);
  });

  it('writes ascending ids so equal sets share one cache entry, and nothing when empty', () => {
    expect(toInterestParam([7, 3])).toBe('3,7');
    expect(toInterestParam([])).toBeUndefined();
  });
});

describe('InterestAreasService', () => {
  let profile$: BehaviorSubject<UserProfile | null>;
  let user$: BehaviorSubject<{ id: string } | null>;
  let getMine: jasmine.Spy;

  function create(): InterestAreasService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: ProfileService, useValue: { profile$ } },
        { provide: AuthService, useValue: { currentUser$: user$ } },
        { provide: SavedSearchApiService, useValue: { getMine } }
      ]
    });
    return TestBed.inject(InterestAreasService);
  }

  beforeEach(() => {
    localStorage.removeItem(RECENT_AREAS_STORAGE_KEY);
    profile$ = new BehaviorSubject<UserProfile | null>(null);
    user$ = new BehaviorSubject<{ id: string } | null>(null);
    getMine = jasmine.createSpy('getMine').and.returnValue(of([]));
  });

  afterEach(() => localStorage.removeItem(RECENT_AREAS_STORAGE_KEY));

  it('is empty for a guest with no searches', () => {
    expect(create().current()).toBeUndefined();
  });

  it('follows the recent searches of a guest', () => {
    const service = create();
    TestBed.inject(RecentAreasService).record(7);
    TestBed.inject(RecentAreasService).record(3);

    expect(service.current()).toBe('3,7');
  });

  it('adds the home area when the profile arrives later, and emits the change once', () => {
    const service = create();
    const seen: (string | undefined)[] = [];
    service.param$.subscribe(value => seen.push(value));
    TestBed.inject(RecentAreasService).record(2);

    profile$.next({ HomeGovernorateId: 9 });

    expect(service.current()).toBe('2,9');
    expect(seen).toEqual([undefined, '2', '2,9']);
  });

  it('uses the governorates of the saved searches of a signed-in user, last in priority', () => {
    getMine.and.returnValue(of([{ governorateId: 4 }, { governorateId: null }, { governorateId: 6 }, { governorateId: 8 }]));
    user$.next({ id: 'u1' });
    const service = create();
    TestBed.inject(RecentAreasService).record(1);

    expect(getMine).toHaveBeenCalledTimes(1);
    expect(service.current()).toBe('1,4,6');
  });

  it('does not fetch saved searches for a guest, and forgets them on sign-out', () => {
    getMine.and.returnValue(of([{ governorateId: 4 }]));
    const service = create();
    expect(getMine).not.toHaveBeenCalled();

    user$.next({ id: 'u1' });
    expect(service.current()).toBe('4');

    user$.next(null);
    expect(service.current()).toBeUndefined();
  });

  it('carries on without saved searches when loading them fails', () => {
    getMine.and.returnValue(throwError(() => new Error('offline')));
    user$.next({ id: 'u1' });
    const service = create();
    TestBed.inject(RecentAreasService).record(5);

    expect(service.current()).toBe('5');
  });
});
