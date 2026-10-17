import { TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { PropertyPrintService, escapeHtml } from './property-print.service';
import { Property } from '../models/property.model';
import { environment } from '../../../environments/environment';

function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: 'p1',
    title: 'شقة <b>رائعة</b> في المزة',
    description: 'وصف "الشقة" & المرافق',
    city: 'دمشق',
    region: 'المزة',
    isPublished: true,
    listingType: 'ForSale',
    purchasePrice: 75000,
    currencyCode: 'USD',
    area: 120,
    rooms: 3,
    ownerName: 'اسم المالك السري',
    agencyName: 'مكتب الأمل',
    images: [{ url: 'https://img.test/a.jpg', isMain: true }, { url: 'javascript:alert(1)' }, { url: 'https://img.test/b.jpg' }],
    amenities: [{ id: 'a1', name: 'مسبح', iconName: 'pool' }],
    ...overrides
  } as Property;
}

describe('PropertyPrintService', () => {
  let service: PropertyPrintService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TranslateModule.forRoot()] });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', {
      AMENITIES_CATALOG: { pool: 'Swimming pool' },
      PRINT: { LINK: 'Listing link', DESCRIPTION: 'Description', AMENITIES: 'Amenities', AGENCY: 'Agency', PRINTED_ON: 'Printed on {{date}}' }
    });
    translate.use('en');
    (environment as { siteUrl: string }).siteUrl = 'https://hudhudnest.com';
    service = TestBed.inject(PropertyPrintService);
  });

  it('escapes HTML-significant characters', () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
  });

  it('cannot print a listing that is not public', () => {
    expect(service.canPrint(makeProperty({ isPublished: false }))).toBeFalse();
    expect(service.canPrint(null)).toBeFalse();
  });

  it('builds the native print URL from the public URL', () => {
    expect(service.printUrl(makeProperty())).toBe('https://hudhudnest.com/properties/p1?print=1');
  });

  it('builds a document with the public facts, escaped, and the public link', () => {
    const html = service.buildDocument(makeProperty());

    expect(html).toContain('&lt;b&gt;رائعة&lt;/b&gt;');
    expect(html).not.toContain('<b>رائعة</b>');
    expect(html).toContain('&quot;الشقة&quot; &amp; المرافق');
    expect(html).toContain('Swimming pool');
    expect(html).toContain('مكتب الأمل');
    expect(html).toContain('https://hudhudnest.com/properties/p1');
    expect(html).toContain('/images/horizontal-logo-480.png');
    expect(html).toContain('@page');
  });

  it('never prints owner details and drops non-http image URLs', () => {
    const html = service.buildDocument(makeProperty());

    expect(html).not.toContain('اسم المالك السري');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('https://img.test/a.jpg');
  });

  it('is right-to-left for Arabic', () => {
    document.documentElement.lang = 'ar';
    expect(service.buildDocument(makeProperty())).toContain('dir="rtl"');
    document.documentElement.lang = 'en';
    expect(service.buildDocument(makeProperty())).toContain('dir="ltr"');
  });

  it('lists the price rows that exist for a sale', () => {
    const rows = service.prices(makeProperty());
    expect(rows.length).toBe(1);
    expect(rows[0].value).toContain('75');
  });
});
