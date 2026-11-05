export type GalleryNavigation = 'next' | 'previous';

/** Detect deliberate horizontal swipes while allowing ordinary vertical scrolling. */
export function getGallerySwipeNavigation(
  deltaX: number,
  deltaY: number,
  isRtl: boolean,
  threshold = 48
): GalleryNavigation | null {
  if (Math.abs(deltaX) < threshold || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) {
    return null;
  }

  if (deltaX > 0) return isRtl ? 'next' : 'previous';
  return isRtl ? 'previous' : 'next';
}
