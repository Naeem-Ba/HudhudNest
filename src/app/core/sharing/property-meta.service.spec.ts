import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { Meta, Title } from '@angular/platform-browser';
import { PropertyMetaService } from './property-meta.service';
import { Property } from '../models/property.model';
import { environment } from '../../../environments/environment';

function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: 'p1',
    title: 'شقة للبيع في طرطوس',
    city: 'طرطوس',
    isPublished: true,
    area: 120,
    rooms: 3,
    purchasePrice: 75000,
    currencyCode: 'USD',
    ...overrides
  } as Property;
}

describe('PropertyMetaService', () => {
  let service: PropertyMetaService;
  let meta: Meta;
  let title: Title;

  let originalEnvironmentName: string;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TranslateModule.forRoot()] });
    service = TestBed.inject(PropertyMetaService);
    meta = TestBed.inject(Meta);
    title = TestBed.inject(Title);
    (environment as { siteUrl: string }).siteUrl = 'https://hudhudnest.com';
    originalEnvironmentName = environment.environmentName;
    (environment as { environmentName: string }).environmentName = 'production';

    // Clean slate — Meta.updateTag persists into the real document between tests otherwise.
    meta.removeTag('property="og:title"');
    meta.removeTag('property="og:url"');
    meta.removeTag('name="robots"');
    document.querySelector('link[rel="canonical"]')?.remove();
  });

  afterEach(() => {
    (environment as { environmentName: string }).environmentName = originalEnvironmentName;
    meta.removeTag('name="robots"');
    document.querySelector('link[rel="canonical"]')?.remove();
  });

  it('sets the <title> with the site name suffix', () => {
    service.applyTo(makeProperty());
    expect(title.getTitle()).toBe('شقة للبيع في طرطوس | هدهد نيست');
  });

  it('sets all required Open Graph tags', () => {
    service.applyTo(makeProperty());

    expect(meta.getTag('property="og:title"')?.content).toContain('شقة للبيع في طرطوس');
    expect(meta.getTag('property="og:description"')?.content).toBeTruthy();
    expect(meta.getTag('property="og:type"')?.content).toBe('website');
    expect(meta.getTag('property="og:site_name"')?.content).toBe('هدهد نيست');
    expect(meta.getTag('property="og:locale"')?.content).toBe('ar_SY');
    expect(meta.getTag('property="og:url"')?.content).toBe('https://hudhudnest.com/properties/p1');
    expect(meta.getTag('property="og:image"')?.content).toBeTruthy();
  });

  it('sets all required Twitter Card tags', () => {
    service.applyTo(makeProperty());

    expect(meta.getTag('name="twitter:card"')?.content).toBe('summary_large_image');
    expect(meta.getTag('name="twitter:title"')?.content).toContain('شقة للبيع في طرطوس');
    expect(meta.getTag('name="twitter:description"')?.content).toBeTruthy();
    expect(meta.getTag('name="twitter:image"')?.content).toBeTruthy();
  });

  it('sets a canonical <link> matching the same URL used everywhere else', () => {
    service.applyTo(makeProperty());

    const link = document.querySelector('link[rel="canonical"]');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('https://hudhudnest.com/properties/p1');
    expect(meta.getTag('property="og:url"')?.content).toBe(link?.getAttribute('href'));
  });

  it('never produces an internal Angular route as the canonical/og:url value', () => {
    service.applyTo(makeProperty());

    const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? '';
    expect(canonical).not.toContain('#');
    expect(canonical.startsWith('https://hudhudnest.com/properties/')).toBeTrue();
  });

  it('falls back to the branded placeholder image when the property has no images', () => {
    service.applyTo(makeProperty({ mainImageUrl: undefined, images: [] }));

    const ogImage = meta.getTag('property="og:image"')?.content ?? '';
    expect(ogImage).toContain('/images/og-default.png');
    expect(ogImage.startsWith('https://hudhudnest.com')).toBeTrue();
  });

  it('uses the property main image when present', () => {
    service.applyTo(makeProperty({ mainImageUrl: 'https://res.cloudinary.com/demo/image/upload/cover.jpg' }));

    expect(meta.getTag('property="og:image"')?.content).toBe('https://res.cloudinary.com/demo/image/upload/cover.jpg');
  });

  it('strips HTML tags out of a user-entered title before writing it into a meta attribute', () => {
    service.applyTo(makeProperty({ title: '<script>alert(1)</script>شقة خطيرة' }));

    const ogTitle = meta.getTag('property="og:title"')?.content ?? '';
    expect(ogTitle).not.toContain('<script>');
  });

  it('does not touch document metadata for a property that is not shareable (unpublished)', () => {
    const titleBefore = title.getTitle();

    service.applyTo(makeProperty({ isPublished: false }));

    expect(title.getTitle()).toBe(titleBefore);
    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
  });

  it('markNotFound sets a noindex,nofollow robots tag', () => {
    service.markNotFound();
    expect(meta.getTag('name="robots"')?.content).toBe('noindex, nofollow');
  });

  it('applyTo clears a previous markNotFound (a retry that succeeds must not stay noindex)', () => {
    service.markNotFound();
    expect(meta.getTag('name="robots"')?.content).toBe('noindex, nofollow');

    service.applyTo(makeProperty());

    expect(meta.getTag('name="robots"')).toBeNull();
  });

  it('clear() removes the canonical link left by applyTo (navigating away must not leak it)', () => {
    service.applyTo(makeProperty());
    expect(document.querySelector('link[rel="canonical"]')).not.toBeNull();

    service.clear();

    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
  });
});
