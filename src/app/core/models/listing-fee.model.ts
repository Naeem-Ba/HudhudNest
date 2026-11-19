// One-off platform fees an owner pays on their own listing.
//
// Two exist today, and both follow the identical shape in HudhudNestApi: the request
// endpoint records a Pending transaction and returns 202, and the listing only changes
// once an administrator confirms the money arrived. Nothing here completes a payment,
// because there is no payment gateway in the system — see FRONTEND_BACKEND_CONTRACT.md.

/** Which fee the checkout page is quoting. Doubles as the :kind route segment. */
export type ListingFeeKind = 'extension' | 'featured' | 'extra-listing';

export const LISTING_FEE_KINDS: readonly ListingFeeKind[] = ['extension', 'featured', 'extra-listing'];

/** The one fee that is not about an existing listing: it buys permission to publish one more (no :propertyId). */
export function isListingFeeWithoutProperty(kind: ListingFeeKind): boolean {
  return kind === 'extra-listing';
}

export function isListingFeeKind(value: string): value is ListingFeeKind {
  return (LISTING_FEE_KINDS as readonly string[]).includes(value);
}

/**
 * What the page shows BEFORE the user commits.
 *
 * The amounts mirror ListingLifecyclePolicy in the backend, which is the authoritative
 * source — these exist only so the review step can name a price before creating a charge.
 * The figure rendered after confirmation always comes from the server's response, so a
 * drift here shows up as a changed number on screen rather than as a wrong charge.
 */
export interface ListingFeePreview {
  kind: ListingFeeKind;
  amountUsd: number;
  days: number;
  titleKey: string;
  descriptionKey: string;
}

export const LISTING_FEE_PREVIEWS: Readonly<Record<ListingFeeKind, ListingFeePreview>> = {
  extension: {
    kind: 'extension',
    amountUsd: 1,
    days: 30,
    titleKey: 'CHECKOUT.EXTENSION.TITLE',
    descriptionKey: 'CHECKOUT.EXTENSION.DESCRIPTION'
  },
  featured: {
    kind: 'featured',
    amountUsd: 5,
    days: 30,
    titleKey: 'CHECKOUT.FEATURED.TITLE',
    descriptionKey: 'CHECKOUT.FEATURED.DESCRIPTION'
  },
  'extra-listing': {
    kind: 'extra-listing',
    amountUsd: 1,
    days: 30,
    titleKey: 'CHECKOUT.EXTRA_LISTING.TITLE',
    descriptionKey: 'CHECKOUT.EXTRA_LISTING.DESCRIPTION'
  }
};

/**
 * The server's answer to "record what I owe".
 *
 * `transactionId` is the reference the payer must quote on their bank transfer — it is how
 * an administrator matches an incoming payment to a listing.
 */
export interface ListingFeeQuote {
  kind: ListingFeeKind;
  transactionId: string;
  propertyId: string;
  amountUsd: number;
  days: number;

  /** Extension only: when the listing expired, and the deadline to recover it. */
  expiresAt: string | null;
  graceEndsAt: string | null;

  /** Featured only: the placement the listing already holds, and where this fee takes it. */
  currentFeaturedUntil: string | null;
  projectedFeaturedUntil: string | null;

  /**
   * True when the server reused a charge the owner already owed. The page says so out
   * loud — a second visit must not leave anyone believing they were billed twice.
   */
  isExistingPendingFee: boolean;
}

/** One of the owner's featured requests that is still waiting for payment confirmation. */
export interface PendingFeaturedRequest {
  transactionId: string;
  propertyId: string;
  amountUsd: number;
  featuredDays: number;
  requestedAt: string;
}

/**
 * Whether the owner may buy permission to publish ONE more listing (GET /extra-listing).
 *
 * `blockedCode` says why not (office member, paid plan, no plan, or still has room); `availableCredits` are
 * paid permissions an administrator confirmed and the owner has not spent yet.
 */
export interface ExtraListingStatus {
  canRequest: boolean;
  blockedCode: string | null;
  hasPendingRequest: boolean;
  pendingRequestId: string | null;
  availableCredits: number;
  priceUsd: number;
  listingDays: number;
  activeListings: number;
  limit: number;
}
