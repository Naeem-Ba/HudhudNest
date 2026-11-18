import {
  isClosedDealListing,
  isReservedListing,
  listingLifecycle,
  listingStatusTagKey
} from './listing-status';

describe('listing status (QA Phase 7, P7-D08)', () => {
  it('reads the status the API sends by name, in any case, and by number', () => {
    expect(listingLifecycle({ status: 'Reserved' })).toBe('reserved');
    expect(listingLifecycle({ status: ' sold ' })).toBe('sold');
    expect(listingLifecycle({ status: 'RENTED' })).toBe('rented');
    expect(listingLifecycle({ status: 'Archived' })).toBe('archived');
    expect(listingLifecycle({ status: 'Expired' })).toBe('expired');
    expect(listingLifecycle({ status: 0 })).toBe('available');
    expect(listingLifecycle({ status: 1 })).toBe('reserved');
    expect(listingLifecycle({ status: 2 })).toBe('sold');
    expect(listingLifecycle({ status: 3 })).toBe('rented');
    expect(listingLifecycle({ status: 4 })).toBe('archived');
    // Platform audit 2026-11-18, HN-21: the numeric form of Expired (API enum value 5).
    expect(listingLifecycle({ status: 5 })).toBe('expired');
  });

  it('treats a missing or unknown status as an ordinary listing, never as a closed one', () => {
    expect(listingLifecycle(undefined)).toBe('other');
    expect(listingLifecycle({})).toBe('other');
    expect(listingLifecycle({ status: 99 })).toBe('other');
    expect(isReservedListing({})).toBeFalse();
    expect(isClosedDealListing({ status: 'Draft' })).toBeFalse();
  });

  it('only Sold and Rented are concluded deals; Reserved is not', () => {
    expect(isClosedDealListing({ status: 'Sold' })).toBeTrue();
    expect(isClosedDealListing({ status: 'Rented' })).toBeTrue();
    expect(isClosedDealListing({ status: 'Reserved' })).toBeFalse();
    expect(isClosedDealListing({ status: 'Archived' })).toBeFalse();
    expect(isReservedListing({ status: 'Reserved' })).toBeTrue();
  });

  it('tags reserved, sold, rented and archived listings and nothing else', () => {
    expect(listingStatusTagKey({ status: 'Reserved' })).toBe('LISTING_STATUS.RESERVED');
    expect(listingStatusTagKey({ status: 'Sold' })).toBe('LISTING_STATUS.SOLD');
    expect(listingStatusTagKey({ status: 'Rented' })).toBe('LISTING_STATUS.RENTED');
    expect(listingStatusTagKey({ status: 'Archived' })).toBe('LISTING_STATUS.ARCHIVED');
    expect(listingStatusTagKey({ status: 'Available' })).toBeNull();
    expect(listingStatusTagKey({ status: 'Expired' })).toBeNull();
  });
});
