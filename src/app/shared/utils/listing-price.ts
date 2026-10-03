/**
 * One rule for "the price of a listing" so Home, the list and the detail page cannot disagree:
 * the purchase price for sales, otherwise the warm rent, otherwise the cold rent. 0 and null both
 * mean "not set".
 */
export function primaryListingPrice(listing: {
  purchasePrice?: number | null;
  warmRent?: number | null;
  coldRent?: number | null;
}): number | null {
  return listing.purchasePrice || listing.warmRent || listing.coldRent || null;
}

/**
 * Formats an amount WITH its currency (Intl prints the symbol), so callers must not append the
 * currency code again — doing so rendered "US$1,451 USD".
 */
export function formatListingPrice(value: number | null | undefined, currencyCode: string | null | undefined): string {
  if (!value) return '—';

  const currency = currencyCode || 'SYP';

  try {
    return new Intl.NumberFormat('ar', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0
    }).format(value);
  } catch {
    return `${value.toLocaleString('ar')} ${currency}`;
  }
}
