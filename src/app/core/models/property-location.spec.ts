import { hasCompleteCoordinates, isValidCoordinates } from './property-location';

describe('property location coordinates', () => {
  it('accepts latitude and longitude in their respective ranges', () => {
    expect(isValidCoordinates(33.5138, 36.2765)).toBeTrue();
    expect(isValidCoordinates(90, 180)).toBeTrue();
    expect(isValidCoordinates(-90, -180)).toBeTrue();
  });

  it('rejects swapped out-of-range values, non-finite values, and incomplete pairs', () => {
    expect(isValidCoordinates(36.2765, 333.5138)).toBeFalse();
    expect(isValidCoordinates(Number.NaN, 12)).toBeFalse();
    expect(isValidCoordinates(12, Number.POSITIVE_INFINITY)).toBeFalse();
    expect(hasCompleteCoordinates(33, null)).toBeFalse();
  });

  it('allows an absent location and the valid coordinate origin', () => {
    expect(hasCompleteCoordinates(null, null)).toBeTrue();
    expect(hasCompleteCoordinates(0, 0)).toBeTrue();
  });
});
