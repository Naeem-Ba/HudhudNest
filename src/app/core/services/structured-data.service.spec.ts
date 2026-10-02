import { TestBed } from '@angular/core/testing';
import { StructuredDataService } from './structured-data.service';

describe('StructuredDataService', () => {
  let service: StructuredDataService;
  const testId = 'ld-test-tag';

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(StructuredDataService);
  });

  afterEach(() => {
    document.getElementById(testId)?.remove();
  });

  it('creates a <script type="application/ld+json"> tag with the given id', () => {
    service.setJsonLd(testId, { '@type': 'Thing', name: 'a' });

    const script = document.getElementById(testId) as HTMLScriptElement;
    expect(script).not.toBeNull();
    expect(script.type).toBe('application/ld+json');
    expect(JSON.parse(script.textContent ?? '')).toEqual({ '@type': 'Thing', name: 'a' });
  });

  it('updates the existing tag in place on a second call with the same id, never duplicating it', () => {
    service.setJsonLd(testId, { '@type': 'Thing', name: 'a' });
    service.setJsonLd(testId, { '@type': 'Thing', name: 'b' });

    expect(document.querySelectorAll(`#${testId}`).length).toBe(1);
    const script = document.getElementById(testId) as HTMLScriptElement;
    expect(JSON.parse(script.textContent ?? '')).toEqual({ '@type': 'Thing', name: 'b' });
  });

  it('removeJsonLd removes the tag, and is a no-op when nothing was ever set', () => {
    service.setJsonLd(testId, { '@type': 'Thing' });
    service.removeJsonLd(testId);
    expect(document.getElementById(testId)).toBeNull();

    expect(() => service.removeJsonLd('ld-never-set')).not.toThrow();
  });

  it('buildBreadcrumbList emits a valid BreadcrumbList', () => {
    const list = service.buildBreadcrumbList([
      { name: 'الرئيسية', url: 'https://hudhudnest.com/' },
      { name: 'العقارات', url: 'https://hudhudnest.com/properties' }
    ]) as {
      '@context': string;
      '@type': string;
      itemListElement: { '@type': string; position: number; name: string; item: string }[];
    };

    expect(list['@context']).toBe('https://schema.org');
    expect(list['@type']).toBe('BreadcrumbList');
    expect(list.itemListElement.length).toBe(2);
    expect(list.itemListElement[0]).toEqual({
      '@type': 'ListItem',
      position: 1,
      name: 'الرئيسية',
      item: 'https://hudhudnest.com/'
    });
    expect(list.itemListElement[1].position).toBe(2);
  });
});
