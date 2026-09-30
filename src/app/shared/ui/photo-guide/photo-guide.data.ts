// Content model of the photography guide. Text lives in i18n (`PHOTO_GUIDE.STEPS.<KEY>.*`);
// this file only decides WHICH shots are shown, in WHAT order, for each listing kind, and
// which illustration file backs each shot. It is a pure UX layer: nothing here touches the
// listing data model or the upload pipeline.

export type PhotoGuideKind = 'sale' | 'rent' | 'shortStay';

export type PhotoGuideShot =
  | 'FACADE'
  | 'LIVING'
  | 'BEDROOM'
  | 'KITCHEN'
  | 'BATHROOM'
  | 'BALCONY'
  | 'COURTYARD'
  | 'ENTRANCE';

/** Shot -> illustration in `public/images/photo-guide/` (one separate file per shot). */
export const PHOTO_GUIDE_IMAGES: Record<PhotoGuideShot, string> = {
  FACADE: '/images/photo-guide/facade.svg',
  LIVING: '/images/photo-guide/living.svg',
  BEDROOM: '/images/photo-guide/bedroom.svg',
  KITCHEN: '/images/photo-guide/kitchen.svg',
  BATHROOM: '/images/photo-guide/bathroom.svg',
  BALCONY: '/images/photo-guide/balcony.svg',
  COURTYARD: '/images/photo-guide/courtyard.svg',
  ENTRANCE: '/images/photo-guide/entrance.svg'
};

/**
 * Order matters: it is the order a buyer / tenant / guest looks for the information.
 *  - sale: the building and its condition first.
 *  - rent: rooms, kitchen and bathroom first (what a tenant asks about).
 *  - shortStay: where the guest sleeps first, and the entrance last (arrival).
 */
export const PHOTO_GUIDE_SHOTS: Record<PhotoGuideKind, readonly PhotoGuideShot[]> = {
  sale: ['FACADE', 'LIVING', 'BEDROOM', 'KITCHEN', 'BATHROOM', 'BALCONY', 'COURTYARD'],
  rent: ['LIVING', 'BEDROOM', 'KITCHEN', 'BATHROOM', 'BALCONY', 'FACADE'],
  shortStay: ['BEDROOM', 'KITCHEN', 'BATHROOM', 'LIVING', 'BALCONY', 'ENTRANCE']
};

export const PHOTO_GUIDE_TIP_KEYS = ['LIGHT', 'TIDY', 'STEADY', 'HONEST', 'DETAILS', 'LENS', 'SHARP', 'FRESH'] as const;

/** Listing type as the property form stores it: 1 = rent, 2 = sale. */
export function photoGuideKindForListingType(listingType: number | null | undefined): PhotoGuideKind {
  return Number(listingType) === 2 ? 'sale' : 'rent';
}
