import { getGallerySwipeNavigation } from './gallery-swipe';

describe('gallery swipe navigation', () => {
  it('maps deliberate horizontal gestures to next and previous in LTR', () => {
    expect(getGallerySwipeNavigation(-70, 5, false)).toBe('next');
    expect(getGallerySwipeNavigation(70, 5, false)).toBe('previous');
  });

  it('respects RTL ordering without changing the saved image order', () => {
    expect(getGallerySwipeNavigation(70, 5, true)).toBe('next');
    expect(getGallerySwipeNavigation(-70, 5, true)).toBe('previous');
  });

  it('ignores taps, short movement, and predominantly vertical scrolling', () => {
    expect(getGallerySwipeNavigation(8, 1, false)).toBeNull();
    expect(getGallerySwipeNavigation(47, 0, false)).toBeNull();
    expect(getGallerySwipeNavigation(65, 90, false)).toBeNull();
  });
});
