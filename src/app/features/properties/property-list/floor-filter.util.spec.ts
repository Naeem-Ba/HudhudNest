import { AvailableFloors } from '../../../core/models/property.model';
import {
  DEFAULT_FLOOR_CEILING,
  floorChoices,
  hasFloorSelection,
  parseFloorMode,
  parseFloorParam,
  selectionStillPossible
} from './floor-filter.util';

const available = (...floors: number[]): AvailableFloors => ({
  min: floors.length ? Math.min(...floors) : null,
  max: floors.length ? Math.max(...floors) : null,
  floors: floors.map(floor => ({ floor, count: 1 }))
});

describe('floor filter helpers', () => {
  describe('parseFloorParam', () => {
    it('reads 0 as the ground floor, not as "no floor"', () => {
      expect(parseFloorParam('0')).toBe(0);
    });

    it('reads whole numbers up to 200 and drops everything else', () => {
      expect(parseFloorParam('7')).toBe(7);
      expect(parseFloorParam('120')).toBe(120);
      expect(parseFloorParam('200')).toBe(200);
      expect(parseFloorParam('201')).toBeNull();
      expect(parseFloorParam('-1')).toBeNull();
      expect(parseFloorParam('2.5')).toBeNull();
      expect(parseFloorParam('abc')).toBeNull();
      expect(parseFloorParam('')).toBeNull();
      expect(parseFloorParam(null)).toBeNull();
    });
  });

  describe('parseFloorMode', () => {
    it('accepts highest and lowest in any case and nothing else', () => {
      expect(parseFloorMode('highest')).toBe('highest');
      expect(parseFloorMode('LOWEST')).toBe('lowest');
      expect(parseFloorMode('middle')).toBeNull();
      expect(parseFloorMode(null)).toBeNull();
    });
  });

  describe('floorChoices', () => {
    it('lists the available floors, lowest first, with the ground floor as 0', () => {
      expect(floorChoices(available(5, 0, 2), [])).toEqual([0, 2, 5]);
    });

    it('is 0..50 while the available floors are unknown', () => {
      const list = floorChoices(null, []);
      expect(list.length).toBe(DEFAULT_FLOOR_CEILING + 1);
      expect(list[0]).toBe(0);
      expect(list[list.length - 1]).toBe(DEFAULT_FLOOR_CEILING);
    });

    it('does not cap real data at 50', () => {
      expect(floorChoices(available(1, 120), [])).toEqual([1, 120]);
    });

    it('keeps a floor that is already chosen even when it is not available any more', () => {
      expect(floorChoices(available(1, 2), [7, null])).toEqual([1, 2, 7]);
    });

    it('is empty when no floor exists', () => {
      expect(floorChoices(available(), [])).toEqual([]);
    });
  });

  describe('selectionStillPossible', () => {
    it('keeps a single floor that exists and drops one that does not', () => {
      expect(selectionStillPossible({ from: 2, to: 2, mode: null }, available(1, 2, 3))).toBeTrue();
      expect(selectionStillPossible({ from: 7, to: 7, mode: null }, available(1, 2, 3))).toBeFalse();
    });

    it('keeps a range that holds at least one existing floor', () => {
      expect(selectionStillPossible({ from: 2, to: 9, mode: null }, available(1, 3))).toBeTrue();
      expect(selectionStillPossible({ from: 4, to: 9, mode: null }, available(1, 3))).toBeFalse();
      expect(selectionStillPossible({ from: 2, to: null, mode: null }, available(1))).toBeFalse();
    });

    it('treats the ground floor as a real floor', () => {
      expect(selectionStillPossible({ from: 0, to: 0, mode: null }, available(0, 4))).toBeTrue();
      expect(selectionStillPossible({ from: 0, to: 0, mode: null }, available(4))).toBeFalse();
    });

    it('never drops highest/lowest or an empty selection', () => {
      expect(selectionStillPossible({ from: null, to: null, mode: 'highest' }, available())).toBeTrue();
      expect(selectionStillPossible({ from: null, to: null, mode: null }, available())).toBeTrue();
    });

    it('drops any floor choice when nothing has a floor', () => {
      expect(selectionStillPossible({ from: 0, to: 3, mode: null }, available())).toBeFalse();
    });
  });

  describe('hasFloorSelection', () => {
    it('counts the ground floor (0) as a selection', () => {
      expect(hasFloorSelection({ from: 0, to: 0, mode: null })).toBeTrue();
      expect(hasFloorSelection({ from: null, to: 3, mode: null })).toBeTrue();
      expect(hasFloorSelection({ from: null, to: null, mode: 'lowest' })).toBeTrue();
      expect(hasFloorSelection({ from: null, to: null, mode: null })).toBeFalse();
    });
  });
});
