import { TestBed } from '@angular/core/testing';
import { PropertyShareUrlService } from './property-share-url.service';
import { Property } from '../models/property.model';
import { environment } from '../../../environments/environment';

function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: 'abc-123',
    title: 'شقة للبيع',
    city: 'دمشق',
    isPublished: true,
    ...overrides
  } as Property;
}

describe('PropertyShareUrlService', () => {
  let service: PropertyShareUrlService;
  let originalSiteUrl: string;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PropertyShareUrlService);
    originalSiteUrl = environment.siteUrl;
  });

  afterEach(() => {
    (environment as { siteUrl: string }).siteUrl = originalSiteUrl;
  });

  it('builds a canonical URL for a published property using the configured siteUrl', () => {
    (environment as { siteUrl: string }).siteUrl = 'https://hudhudnest.com';

    const url = service.getPropertyPublicUrl(makeProperty());

    expect(url).toBe('https://hudhudnest.com/properties/abc-123');
  });

  it('strips a trailing slash from the configured siteUrl', () => {
    (environment as { siteUrl: string }).siteUrl = 'https://hudhudnest.com/';

    const url = service.getPropertyPublicUrl(makeProperty());

    expect(url).toBe('https://hudhudnest.com/properties/abc-123');
  });

  it('falls back to window.location.origin when siteUrl is not configured', () => {
    (environment as { siteUrl: string }).siteUrl = '';

    const url = service.getPropertyPublicUrl(makeProperty());

    expect(url).toBe(`${window.location.origin}/properties/abc-123`);
  });

  it('returns null for a property with no id', () => {
    expect(service.getPropertyPublicUrl(makeProperty({ id: '' }))).toBeNull();
  });

  it('returns null for null/undefined input', () => {
    expect(service.getPropertyPublicUrl(null)).toBeNull();
    expect(service.getPropertyPublicUrl(undefined)).toBeNull();
  });

  it('returns null for an explicitly unpublished property', () => {
    expect(service.getPropertyPublicUrl(makeProperty({ isPublished: false }))).toBeNull();
  });

  it('treats a missing isPublished field as published (defensive default, not the sole check)', () => {
    const property = makeProperty();
    delete (property as Partial<Property>).isPublished;

    expect(service.getPropertyPublicUrl(property)).not.toBeNull();
  });

  it('returns null for an expired property', () => {
    const expired = makeProperty({ expiresAt: new Date(Date.now() - 86_400_000).toISOString() });

    expect(service.getPropertyPublicUrl(expired)).toBeNull();
  });

  it('returns a URL for a property expiring in the future', () => {
    const stillValid = makeProperty({ expiresAt: new Date(Date.now() + 86_400_000).toISOString() });

    expect(service.getPropertyPublicUrl(stillValid)).not.toBeNull();
  });

  it('never returns an internal Angular route as the share URL', () => {
    (environment as { siteUrl: string }).siteUrl = 'https://hudhudnest.com';

    const url = service.getPropertyPublicUrl(makeProperty())!;

    expect(url).not.toContain('#');
    expect(url.startsWith('https://hudhudnest.com/properties/')).toBeTrue();
  });

  it('URL-encodes the property id', () => {
    (environment as { siteUrl: string }).siteUrl = 'https://hudhudnest.com';

    const url = service.getPropertyPublicUrl(makeProperty({ id: 'abc def' }))!;

    expect(url).toContain(encodeURIComponent('abc def'));
  });
});
