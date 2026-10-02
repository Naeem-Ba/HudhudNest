import { TestBed } from '@angular/core/testing';
import { PropertyStructuredDataService } from './property-structured-data.service';
import { Property } from '../models/property.model';
import { environment } from '../../../environments/environment';

function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: 'p1',
    title: 'شقة للبيع في طرطوس',
    city: 'طرطوس',
    countryCode: 'SY',
    isPublished: true,
    listingType: 'ForSale',
    status: 'Available',
    purchasePrice: 75000,
    currencyCode: 'USD',
    ...overrides
  } as Property;
}

describe('PropertyStructuredDataService', () => {
  let service: PropertyStructuredDataService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PropertyStructuredDataService);
    (environment as { siteUrl: string }).siteUrl = 'https://hudhudnest.com';
  });

  it('returns null for a property with no canonical URL (not publicly shareable)', () => {
    expect(service.buildListing(makeProperty({ id: '' }))).toBeNull();
  });

  it('builds a RealEstateListing with name/url and the correct offers mapping for a sale', () => {
    const listing = service.buildListing(makeProperty()) as {
      '@context': string;
      '@type': string;
      name: string;
      url: string;
      offers: { price: number; priceCurrency: string; businessFunction: string; availability: string };
    };

    expect(listing['@context']).toBe('https://schema.org');
    expect(listing['@type']).toBe('RealEstateListing');
    expect(listing.name).toBe('شقة للبيع في طرطوس');
    expect(listing.url).toBe('https://hudhudnest.com/properties/p1');
    expect(listing.offers.price).toBe(75000);
    expect(listing.offers.priceCurrency).toBe('USD');
    expect(listing.offers.businessFunction).toBe('http://purl.org/goodrelations/v1#Sell');
    expect(listing.offers.availability).toBe('https://schema.org/InStock');
  });

  it('maps a rent listing to LeaseOut and falls back to coldRent when purchasePrice is absent', () => {
    const listing = service.buildListing(
      makeProperty({ listingType: 'ForRent', purchasePrice: undefined, coldRent: 500, status: 'Reserved' })
    ) as { offers: { price: number; businessFunction: string; availability: string } };

    expect(listing.offers.price).toBe(500);
    expect(listing.offers.businessFunction).toBe('http://purl.org/goodrelations/v1#LeaseOut');
    expect(listing.offers.availability).toBe('https://schema.org/LimitedAvailability');
  });

  it('omits businessFunction for ForRentAndSale rather than guessing', () => {
    const listing = service.buildListing(makeProperty({ listingType: 'ForRentAndSale' })) as {
      offers: { businessFunction?: string };
    };

    expect(listing.offers.businessFunction).toBeUndefined();
  });

  it('omits offers entirely when there is no price', () => {
    const listing = service.buildListing(
      makeProperty({ purchasePrice: undefined, coldRent: undefined, warmRent: undefined })
    ) as { offers?: unknown };

    expect(listing.offers).toBeUndefined();
  });

  it('omits offers when there is a price but no currency', () => {
    const listing = service.buildListing(makeProperty({ currencyCode: undefined })) as { offers?: unknown };
    expect(listing.offers).toBeUndefined();
  });

  it('includes a PostalAddress built only from present fields', () => {
    const listing = service.buildListing(
      makeProperty({ street: 'شارع الثورة', city: 'طرطوس', countryCode: 'SY' })
    ) as { address: { '@type': string; streetAddress: string; addressLocality: string; addressCountry: string } };

    expect(listing.address).toEqual({
      '@type': 'PostalAddress',
      streetAddress: 'شارع الثورة',
      addressLocality: 'طرطوس',
      addressCountry: 'SY'
    });
  });

  it('omits address entirely when there is no location data at all', () => {
    const listing = service.buildListing(
      makeProperty({ city: '', countryCode: undefined, street: undefined })
    ) as { address?: unknown };

    expect(listing.address).toBeUndefined();
  });

  it('strips HTML from title, description, and street before embedding them', () => {
    const listing = service.buildListing(
      makeProperty({
        title: '<b>شقة</b>',
        description: 'وصف <b>مميز</b>',
        street: '<i>شارع</i> الثورة'
      })
    ) as { name: string; description: string; address: { streetAddress: string } };

    expect(listing.name).toBe('شقة');
    expect(listing.description).toBe('وصف مميز');
    expect(listing.address.streetAddress).toBe('شارع الثورة');
  });

  it('strips tag markers (not their inner text) from a title shaped like a script injection', () => {
    // Matches sanitizeText's documented behavior everywhere else in this codebase (see
    // social-crawler.mjs's identical sanitizer): the <script>/</script> MARKERS are removed, so
    // "alert(1)" survives only as inert plain text with no surrounding element -- it can never
    // execute. This service never writes the result into innerHTML (StructuredDataService uses
    // script.textContent, and JSON.stringify never re-introduces a literal '<' on its own), so
    // this is safe either way; the point of this test is to pin the actual (not assumed) output.
    const listing = service.buildListing(
      makeProperty({ title: '<script>alert(1)</script>شقة' })
    ) as { name: string };

    expect(listing.name).toBe('alert(1)شقة');
  });

  it('deduplicates and filters images to absolute http(s) URLs only', () => {
    const listing = service.buildListing(
      makeProperty({
        mainImageUrl: 'https://cdn.example.com/a.jpg',
        images: [
          { url: 'https://cdn.example.com/a.jpg' },
          { url: 'https://cdn.example.com/b.jpg' },
          { url: '/relative/c.jpg' }
        ]
      })
    ) as { image: string[] };

    expect(listing.image).toEqual(['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg']);
  });

  it('omits image entirely when there is nothing absolute to show', () => {
    const listing = service.buildListing(makeProperty({ mainImageUrl: undefined, images: [] })) as {
      image?: unknown;
    };

    expect(listing.image).toBeUndefined();
  });
});
