// =============================================================
// src/app/core/sharing/property-structured-data.service.ts
//
// Builds the RealEstateListing/Offer JSON-LD (schema.org) for a property page — the one place
// that turns "a Property" into structured data, same split as PropertyMetaService (title/OG)
// and PropertyShareContentService (share message text): each has one job.
//
// Only fields the property actually has are included — no invented address, rating, or review
// data (see the SEO plan's explicit rule against fabricated structured data). `offers` is
// omitted entirely when there's no price, and `address`/`image` are omitted when there's
// nothing real to put in them, rather than emitting an empty/misleading object.
// =============================================================

import { Injectable, inject } from '@angular/core';
import { Property, ListingType, PropertyStatus } from '../models/property.model';
import { PropertyShareUrlService } from './property-share-url.service';

/** schema.org/Offer.businessFunction — the GoodRelations terms schema.org itself points to for
 *  "this offer is a sale" vs "this offer is a lease". Omitted (not guessed) for
 *  'ForRentAndSale', which doesn't map to either term alone. */
function resolveBusinessFunction(listingType: ListingType | undefined): string | null {
  switch (listingType) {
    case 'ForSale':
      return 'http://purl.org/goodrelations/v1#Sell';
    case 'ForRent':
      return 'http://purl.org/goodrelations/v1#LeaseOut';
    default:
      return null;
  }
}

/** schema.org/Offer.availability, mapped from this app's own PropertyStatus — real data, not a
 *  guess: Sold/Rented listings genuinely should not show as "in stock" in a rich result. An
 *  unrecognized/missing status omits `availability` rather than defaulting to InStock. */
function resolveAvailability(status: PropertyStatus | undefined): string | null {
  switch (status) {
    case 'Available':
      return 'https://schema.org/InStock';
    case 'Reserved':
      return 'https://schema.org/LimitedAvailability';
    case 'Sold':
    case 'Rented':
      return 'https://schema.org/SoldOut';
    case 'Archived':
      return 'https://schema.org/Discontinued';
    default:
      return null;
  }
}

/** The price a visitor sees for this listing: the monthly rent for a rental (the detail page shows
 *  warm rent first, then cold rent -- "<currency>/month"), the purchase price otherwise. For
 *  'ForRentAndSale' the sale price wins, as it always has here. */
function resolvePrice(property: Property): { price: number | null | undefined; isMonthlyRent: boolean } {
  if (property.listingType === 'ForRent') {
    const rent = property.warmRent ?? property.coldRent;
    if (rent != null) {
      return { price: rent, isMonthlyRent: true };
    }
  }

  const price = property.purchasePrice ?? property.warmRent ?? property.coldRent;
  return { price, isMonthlyRent: false };
}

function sanitize(value: string): string {
  return value.replace(/<[^>]*>/g, '').trim();
}

function resolveImages(property: Property): string[] {
  const candidates = [
    property.mainImageUrl,
    ...(property.images?.map(img => img.url) ?? [])
  ];
  const seen = new Set<string>();
  const images: string[] = [];
  for (const candidate of candidates) {
    if (candidate && /^https?:\/\//i.test(candidate) && !seen.has(candidate)) {
      seen.add(candidate);
      images.push(candidate);
    }
  }
  return images;
}

@Injectable({ providedIn: 'root' })
export class PropertyStructuredDataService {
  private readonly shareUrl = inject(PropertyShareUrlService);

  /** Returns null exactly when PropertyMetaService.applyTo would no-op (not publicly
   *  shareable) — structured data must never describe a listing that isn't public. */
  buildListing(property: Property): object | null {
    const canonicalUrl = this.shareUrl.getPropertyPublicUrl(property);
    if (!canonicalUrl) {
      return null;
    }

    const { price, isMonthlyRent } = resolvePrice(property);
    const businessFunction = resolveBusinessFunction(property.listingType);
    const availability = resolveAvailability(property.status);

    const offers =
      price != null && property.currencyCode
        ? {
            '@type': 'Offer',
            price,
            priceCurrency: property.currencyCode,
            // A rent is per month; without this a crawler reads it as a total price.
            ...(isMonthlyRent
              ? {
                  priceSpecification: {
                    '@type': 'UnitPriceSpecification',
                    price,
                    priceCurrency: property.currencyCode,
                    unitCode: 'MON'
                  }
                }
              : {}),
            ...(businessFunction ? { businessFunction } : {}),
            ...(availability ? { availability } : {})
          }
        : null;

    const hasAddressData = Boolean(property.street || property.city || property.countryCode);
    const address = hasAddressData
      ? {
          '@type': 'PostalAddress',
          ...(property.street ? { streetAddress: sanitize(property.street) } : {}),
          ...(property.city ? { addressLocality: sanitize(property.city) } : {}),
          ...(property.countryCode ? { addressCountry: property.countryCode } : {})
        }
      : null;

    const hasCoordinates = Number.isFinite(property.latitude) && Number.isFinite(property.longitude);
    const geo = hasCoordinates
      ? { '@type': 'GeoCoordinates', latitude: property.latitude, longitude: property.longitude }
      : null;

    const images = resolveImages(property);

    return {
      '@context': 'https://schema.org',
      '@type': 'RealEstateListing',
      name: sanitize(property.title?.trim() || 'عقار'),
      url: canonicalUrl,
      ...(property.description ? { description: sanitize(property.description) } : {}),
      ...(property.publishedAt ? { datePosted: property.publishedAt } : {}),
      ...(images.length ? { image: images } : {}),
      ...(address ? { address } : {}),
      ...(geo ? { geo } : {}),
      ...(offers ? { offers } : {})
    };
  }
}
