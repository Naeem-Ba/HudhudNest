/**
 * What a listing's `status` means to a reader (QA Phase 7, P7-D08). One rule for every screen so
 * the list, the detail page, the agency page and the owner's page cannot disagree:
 *
 *  - Available: a normal listing.
 *  - Reserved: still on the market (in search, lighter card, "Reserved" tag) until the reservation
 *    ends, the listing expires, or it becomes Sold/Rented. If the buyer or tenant backs out the
 *    owner puts it back to Available.
 *  - Sold / Rented: a concluded deal. Not in search; shown only on the agency page under its own
 *    tab (and on the direct link), lighter and tagged, with its photos compressed to save storage.
 *  - Archived: hidden from the public (the server answers 404); only the owner still sees it.
 *
 * The API serialises the enum by name ("Reserved"); the numeric form is accepted too because older
 * cached responses and tests use it.
 */
export type ListingLifecycle = 'available' | 'reserved' | 'sold' | 'rented' | 'archived' | 'expired' | 'other';

const BY_NUMBER: Readonly<Record<number, ListingLifecycle>> = {
  0: 'available',
  1: 'reserved',
  2: 'sold',
  3: 'rented',
  4: 'archived',
  5: 'expired'
};

export function listingLifecycle(listing: { status?: unknown } | null | undefined): ListingLifecycle {
  const status = listing?.status;

  if (typeof status === 'number') {
    return BY_NUMBER[status] ?? 'other';
  }

  switch (typeof status === 'string' ? status.trim().toLowerCase() : '') {
    case 'available': return 'available';
    case 'reserved': return 'reserved';
    case 'sold': return 'sold';
    case 'rented': return 'rented';
    case 'archived': return 'archived';
    case 'expired': return 'expired';
    default: return 'other';
  }
}

export function isReservedListing(listing: { status?: unknown } | null | undefined): boolean {
  return listingLifecycle(listing) === 'reserved';
}

/** Sold or Rented: the deal is concluded. */
export function isClosedDealListing(listing: { status?: unknown } | null | undefined): boolean {
  const lifecycle = listingLifecycle(listing);
  return lifecycle === 'sold' || lifecycle === 'rented';
}

/** i18n key of the tag a card or page shows for this listing, or null when it needs none. */
export function listingStatusTagKey(listing: { status?: unknown } | null | undefined): string | null {
  switch (listingLifecycle(listing)) {
    case 'reserved': return 'LISTING_STATUS.RESERVED';
    case 'sold': return 'LISTING_STATUS.SOLD';
    case 'rented': return 'LISTING_STATUS.RENTED';
    case 'archived': return 'LISTING_STATUS.ARCHIVED';
    default: return null;
  }
}

/** The values an owner can move a listing to by hand (Expired is set by the system only). */
export const OWNER_SELECTABLE_STATUSES = ['Available', 'Reserved', 'Sold', 'Rented', 'Archived'] as const;
export type OwnerSelectableStatus = (typeof OWNER_SELECTABLE_STATUSES)[number];
