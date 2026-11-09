import { TestBed } from '@angular/core/testing';

import { MAX_RECENT_AREAS, RECENT_AREAS_STORAGE_KEY, RecentAreasService } from './recent-areas.service';

describe('RecentAreasService', () => {
  beforeEach(() => {
    localStorage.removeItem(RECENT_AREAS_STORAGE_KEY);
    TestBed.resetTestingModule();
  });

  afterEach(() => localStorage.removeItem(RECENT_AREAS_STORAGE_KEY));

  it('starts empty', () => {
    expect(TestBed.inject(RecentAreasService).list()).toEqual([]);
  });

  it('keeps the newest searches first and never more than three', () => {
    const service = TestBed.inject(RecentAreasService);
    [1, 2, 3, 4].forEach(id => service.record(id));

    expect(MAX_RECENT_AREAS).toBe(3);
    expect(service.list()).toEqual([4, 3, 2]);
  });

  it('moves a repeated governorate to the front instead of listing it twice', () => {
    const service = TestBed.inject(RecentAreasService);
    [1, 2, 3].forEach(id => service.record(id));
    service.record(1);

    expect(service.list()).toEqual([1, 3, 2]);
  });

  it('ignores ids that are not positive whole numbers', () => {
    const service = TestBed.inject(RecentAreasService);
    [0, -2, 1.5, NaN, null, undefined].forEach(id => service.record(id as number | null | undefined));

    expect(service.list()).toEqual([]);
    expect(localStorage.getItem(RECENT_AREAS_STORAGE_KEY)).toBeNull();
  });

  it('survives a reload: the list is read back from this device', () => {
    TestBed.inject(RecentAreasService).record(5);
    TestBed.resetTestingModule();

    expect(TestBed.inject(RecentAreasService).list()).toEqual([5]);
  });

  it('reads damaged storage as empty, and drops duplicates and junk', () => {
    localStorage.setItem(RECENT_AREAS_STORAGE_KEY, '{not json');
    expect(TestBed.inject(RecentAreasService).list()).toEqual([]);

    TestBed.resetTestingModule();
    localStorage.setItem(RECENT_AREAS_STORAGE_KEY, JSON.stringify([2, 2, 'x', -1, 4, 6, 8]));
    expect(TestBed.inject(RecentAreasService).list()).toEqual([2, 4, 6]);
  });

  it('is emptied on clear (sign-out), in memory and on the device, and tells subscribers', () => {
    const service = TestBed.inject(RecentAreasService);
    const seen: number[][] = [];
    service.areas$.subscribe(areas => seen.push(areas));
    service.record(7);

    service.clear();

    expect(service.list()).toEqual([]);
    expect(localStorage.getItem(RECENT_AREAS_STORAGE_KEY)).toBeNull();
    expect(seen.at(-1)).toEqual([]);
  });

  it('keeps working in memory when storage refuses writes', () => {
    const service = TestBed.inject(RecentAreasService);
    spyOn(Storage.prototype, 'setItem').and.throwError('QuotaExceededError');

    service.record(9);

    expect(service.list()).toEqual([9]);
  });
});
