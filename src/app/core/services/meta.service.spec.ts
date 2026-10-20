import { TestBed } from '@angular/core/testing';
import { Meta, Title } from '@angular/platform-browser';
import { MetaService } from './meta.service';
import { environment } from '../../../environments/environment';

describe('MetaService.applyGlobalRobotsPolicy', () => {
  let service: MetaService;
  let meta: Meta;
  let originalEnvironmentName: string;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MetaService);
    meta = TestBed.inject(Meta);
    originalEnvironmentName = environment.environmentName;
    meta.removeTag('name="robots"');
  });

  afterEach(() => {
    (environment as { environmentName: string }).environmentName = originalEnvironmentName;
    meta.removeTag('name="robots"');
  });

  it('sets a noindex,nofollow robots tag outside Production', () => {
    (environment as { environmentName: string }).environmentName = 'staging';

    service.applyGlobalRobotsPolicy();

    expect(meta.getTag('name="robots"')?.content).toBe('noindex, nofollow');
  });

  it('sets a noindex,nofollow robots tag for a local build too', () => {
    (environment as { environmentName: string }).environmentName = 'local';

    service.applyGlobalRobotsPolicy();

    expect(meta.getTag('name="robots"')?.content).toBe('noindex, nofollow');
  });

  it('does not add a robots tag in Production', () => {
    (environment as { environmentName: string }).environmentName = 'production';

    service.applyGlobalRobotsPolicy();

    expect(meta.getTag('name="robots"')).toBeNull();
  });
});

describe('MetaService.setPageRobots', () => {
  let service: MetaService;
  let meta: Meta;
  let originalEnvironmentName: string;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MetaService);
    meta = TestBed.inject(Meta);
    originalEnvironmentName = environment.environmentName;
    meta.removeTag('name="robots"');
  });

  afterEach(() => {
    (environment as { environmentName: string }).environmentName = originalEnvironmentName;
    meta.removeTag('name="robots"');
  });

  it('sets the given robots content', () => {
    service.setPageRobots('noindex, nofollow');
    expect(meta.getTag('name="robots"')?.content).toBe('noindex, nofollow');
  });

  it('clearing (null) removes the tag in Production', () => {
    (environment as { environmentName: string }).environmentName = 'production';
    service.setPageRobots('noindex, nofollow');

    service.setPageRobots(null);

    expect(meta.getTag('name="robots"')).toBeNull();
  });

  it('clearing (null) outside Production leaves the global noindex policy\'s tag alone', () => {
    (environment as { environmentName: string }).environmentName = 'staging';
    service.applyGlobalRobotsPolicy();

    service.setPageRobots(null);

    expect(meta.getTag('name="robots"')?.content).toBe('noindex, nofollow');
  });
});

describe('MetaService.clearCanonical', () => {
  let service: MetaService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MetaService);
    document.querySelector('link[rel="canonical"]')?.remove();
  });

  afterEach(() => {
    document.querySelector('link[rel="canonical"]')?.remove();
  });

  it('removes an existing canonical link entirely', () => {
    service.setMeta({ title: 't', description: 'd', canonical: 'https://hudhudnest.com/properties/p1' });
    expect(document.querySelector('link[rel="canonical"]')).not.toBeNull();

    service.clearCanonical();

    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
  });

  it('is a no-op when there is no canonical link to remove', () => {
    expect(() => service.clearCanonical()).not.toThrow();
    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
  });
});

describe('MetaService.setHomeMeta / setPropertiesListMeta', () => {
  let service: MetaService;
  let meta: Meta;
  let title: Title;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MetaService);
    meta = TestBed.inject(Meta);
    title = TestBed.inject(Title);
    document.querySelector('link[rel="canonical"]')?.remove();
  });

  afterEach(() => {
    document.querySelector('link[rel="canonical"]')?.remove();
  });

  it('setHomeMeta sets a real title, description, and the given canonical', () => {
    service.setHomeMeta('https://hudhudnest.com/');

    expect(title.getTitle()).not.toBe('HudhudNest');
    expect(title.getTitle().length).toBeGreaterThan(0);
    expect(meta.getTag('name="description"')?.content.length).toBeGreaterThan(0);
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://hudhudnest.com/');
  });

  it('setPropertiesListMeta sets a real title, description, and the given canonical', () => {
    service.setPropertiesListMeta('https://hudhudnest.com/properties');

    expect(title.getTitle().length).toBeGreaterThan(0);
    expect(meta.getTag('name="description"')?.content.length).toBeGreaterThan(0);
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://hudhudnest.com/properties');
  });

  it('setPropertiesListMeta always receives the clean base canonical, never a filtered query string', () => {
    // Guards the actual duplicate-content fix: whatever filters are active in the real URL,
    // the canonical passed in must be the bare path -- this is enforced by the caller
    // (property-list.page.ts builds it from siteOrigin + '/properties' with no queryParams),
    // so this test documents the contract rather than re-deriving it.
    service.setPropertiesListMeta('https://hudhudnest.com/properties');

    const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? '';
    expect(canonical).not.toContain('?');
  });
});
