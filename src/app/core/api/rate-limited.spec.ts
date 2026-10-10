import { isRateLimited } from './rate-limited';

describe('isRateLimited', () => {
  it('is true only for HTTP 429', () => {
    expect(isRateLimited({ status: 429 })).toBeTrue();
    expect(isRateLimited({ status: 400 })).toBeFalse();
    expect(isRateLimited({ status: 500 })).toBeFalse();
    expect(isRateLimited({ status: 0 })).toBeFalse();
  });

  it('is false for anything that is not an HTTP error', () => {
    expect(isRateLimited(null)).toBeFalse();
    expect(isRateLimited(undefined)).toBeFalse();
    expect(isRateLimited('429')).toBeFalse();
    expect(isRateLimited(new Error('429'))).toBeFalse();
  });
});
