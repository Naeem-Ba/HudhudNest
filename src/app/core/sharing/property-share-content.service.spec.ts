import { TestBed } from '@angular/core/testing';
import { PropertyShareContentService } from './property-share-content.service';
import { Property } from '../models/property.model';
import { environment } from '../../../environments/environment';

function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: 'p1',
    title: 'شقة رائعة في المزة',
    city: 'دمشق',
    isPublished: true,
    area: 120,
    rooms: 3,
    purchasePrice: 75000,
    currencyCode: 'USD',
    ...overrides
  } as Property;
}

describe('PropertyShareContentService', () => {
  let service: PropertyShareContentService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PropertyShareContentService);
    (environment as { siteUrl: string }).siteUrl = 'https://hudhudnest.com';
  });

  it('returns null when the property is not shareable', () => {
    expect(service.build(makeProperty({ isPublished: false }))).toBeNull();
  });

  it('returns null for null/undefined input', () => {
    expect(service.build(null)).toBeNull();
  });

  it('uses the property title verbatim when present', () => {
    const content = service.build(makeProperty())!;
    expect(content.title).toBe('شقة رائعة في المزة');
  });

  it('synthesizes a title when the property title is blank', () => {
    const content = service.build(makeProperty({ title: '  ' }))!;
    expect(content.title.length).toBeGreaterThan(0);
    expect(content.title).toContain('دمشق');
  });

  it('includes the canonical URL in the share text', () => {
    const content = service.build(makeProperty())!;
    expect(content.text).toContain('https://hudhudnest.com/properties/p1');
    expect(content.url).toBe('https://hudhudnest.com/properties/p1');
  });

  it('includes area, rooms, price and city facts in the summary/description', () => {
    const description = service.buildMetaDescription(makeProperty());
    expect(description).toContain('120');
    expect(description).toContain('3');
    expect(description).toContain('دمشق');
  });

  it('caps the meta description length instead of producing an unbounded string', () => {
    const longCity = 'مدينة-'.repeat(60);
    const description = service.buildMetaDescription(makeProperty({ city: longCity }));

    expect(description.length).toBeLessThanOrEqual(160);
  });

  it('uses the given urlOverride (UTM-attributed URL) instead of the canonical URL when provided', () => {
    const attributedUrl = 'https://hudhudnest.com/properties/p1?utm_source=facebook&utm_medium=social';
    const content = service.build(makeProperty(), attributedUrl)!;

    expect(content.url).toBe(attributedUrl);
    expect(content.text).toContain(attributedUrl);
  });

  it('falls back to the title as the description when there are no structured facts at all', () => {
    const bare = makeProperty({
      area: undefined,
      rooms: undefined,
      purchasePrice: undefined,
      coldRent: undefined,
      warmRent: undefined,
      city: ''
    });

    const description = service.buildMetaDescription(bare);
    expect(description).toBe(bare.title);
  });
});
