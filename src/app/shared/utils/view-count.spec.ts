import { COMPACT_VIEW_COUNT_FROM, formatViewCountCompact, formatViewCountFull, mergeViewCount, normalizeViewCount } from './view-count';

describe('view-count formatting', () => {
  it('mergeViewCount only ever raises the loaded number', () => {
    expect(mergeViewCount(10, null)).toBe(10);
    expect(mergeViewCount(10, 12)).toBe(12);
    expect(mergeViewCount(10, 8)).toBe(10);
    expect(mergeViewCount(undefined, null)).toBeNull();
    expect(mergeViewCount(undefined, 3)).toBe(3);
    expect(mergeViewCount('x', 0)).toBe(0);
  });

  it('normalizeViewCount keeps real counts (floored) and rejects anything else', () => {
    expect(normalizeViewCount(0)).toBe(0);
    expect(normalizeViewCount(1248)).toBe(1248);
    expect(normalizeViewCount(12.9)).toBe(12);
    expect(normalizeViewCount(-1)).toBeNull();
    expect(normalizeViewCount(NaN)).toBeNull();
    expect(normalizeViewCount(Infinity)).toBeNull();
    expect(normalizeViewCount('12')).toBeNull();
    expect(normalizeViewCount(null)).toBeNull();
    expect(normalizeViewCount(undefined)).toBeNull();
  });

  it('full form groups digits per language', () => {
    expect(formatViewCountFull(1248, 'en-US')).toBe('1,248');
    expect(formatViewCountFull(1248, 'de-DE')).toBe('1.248');
    expect(formatViewCountFull(0, 'en-US')).toBe('0');
  });

  it('compact form leaves small numbers alone and shortens from 1000', () => {
    expect(COMPACT_VIEW_COUNT_FROM).toBe(1000);
    expect(formatViewCountCompact(999, 'en-US')).toBe('999');
    expect(formatViewCountCompact(1248, 'en-US')).toBe('1.2K');
    expect(formatViewCountCompact(1000, 'en-US')).toBe('1K');
    expect(formatViewCountCompact(2_500_000, 'en-US')).toBe('2.5M');
  });

  it('compact form follows the language (no "K" in German or Arabic; German keeps its grouped full number)', () => {
    expect(formatViewCountCompact(1248, 'de-DE')).toBe('1.248');
    expect(formatViewCountCompact(1248, 'ar')).not.toMatch(/K/);
  });
});
